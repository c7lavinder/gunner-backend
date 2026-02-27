/**
 * Dispo Accountability Agent
 *
 * Fires on: poller (every 4 hours)
 * Does: Audits dispo pipeline health, creates alert tasks for violations
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { loadPlaybook } from '../config/loader';
import { taskBot, tagBot } from '../bots';

const AGENT_ID = 'dispo-accountability';
const ESTEBAN_USER_ID = 'BhVAeJjAfojeX9AJdqbf';

interface StaleOpportunity {
  contactId: string;
  opportunityId: string;
  stageName: string;
  stageEnteredAt: number;
  propertyAddress: string;
}

const THRESHOLDS: Record<string, { maxHours: number; label: string }> = {
  new_deal: { maxHours: 24, label: 'Deal not blasted yet' },
  offers_received: { maxHours: 48, label: 'Offers not reviewed' },
  uc_with_buyer: { maxHours: 720, label: 'Stale closing (30+ days)' }, // 30 days
};

const cooldowns = new Map<string, number>();
const COOLDOWN_MS = 4 * 60 * 60_000; // 4 hours (match poller interval)

export async function runDispoAccountability(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { tenantId } = event;
  const start = Date.now();
  const playbook = await loadPlaybook(tenantId);

  // Stale opportunities come from event metadata (populated by poller)
  const staleOpps: StaleOpportunity[] = (event.metadata as any)?.staleOpportunities ?? [];
  let alertCount = 0;

  for (const opp of staleOpps) {
    const threshold = THRESHOLDS[opp.stageName];
    if (!threshold) continue;

    const hoursInStage = (Date.now() - opp.stageEnteredAt) / (60 * 60_000);
    if (hoursInStage < threshold.maxHours) continue;

    // Cooldown check
    const cooldownKey = `${opp.opportunityId}:${opp.stageName}`;
    const lastAlert = cooldowns.get(cooldownKey);
    if (lastAlert && Date.now() - lastAlert < COOLDOWN_MS) continue;

    if (!isDryRun()) {
      await taskBot(opp.contactId, {
        title: `⚠️ Dispo Alert: ${threshold.label} — ${opp.propertyAddress}`,
        body: `Deal has been in "${opp.stageName}" for ${Math.round(hoursInStage)}h (threshold: ${threshold.maxHours}h).\nProperty: ${opp.propertyAddress}`,
        assignedTo: ESTEBAN_USER_ID,
        dueDate: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
      });

      await tagBot(opp.contactId, ['dispo-stale']);
      cooldowns.set(cooldownKey, Date.now());
    }

    alertCount++;

    auditLog({
      agent: AGENT_ID,
      contactId: opp.contactId,
      opportunityId: opp.opportunityId,
      action: `dispo.accountability.${opp.stageName}`,
      result: 'alert-created',
      metadata: { hoursInStage: Math.round(hoursInStage), threshold: threshold.maxHours },
      durationMs: Date.now() - start,
    });
  }

  auditLog({
    agent: AGENT_ID,
    contactId: 'system',
    action: 'dispo.accountability.sweep',
    result: 'success',
    metadata: { checked: staleOpps.length, alerts: alertCount },
    durationMs: Date.now() - start,
  });
}
