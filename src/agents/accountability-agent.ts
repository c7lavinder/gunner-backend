/**
 * Accountability Agent
 *
 * Fires on: cron (every 15 min)
 * Does: monitors overdue tasks, escalates by SLA tier
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { loadPlaybook } from '../config/loader';
import { taskBot, tagBot } from '../bots';

const AGENT_ID = 'accountability-agent';

type EscalationTier = 'yellow' | 'orange' | 'red';

interface OverdueTask {
  taskId: string;
  contactId: string;
  opportunityId: string;
  assignedTo: string;
  title: string;
  dueAt: number;
  overdueMinutes: number;
}

interface TierConfig {
  thresholdMins: number;
  tier: EscalationTier;
}

const DEFAULT_TIERS: TierConfig[] = [
  { thresholdMins: 30, tier: 'yellow' },
  { thresholdMins: 120, tier: 'orange' },
  { thresholdMins: 480, tier: 'red' },
];

const cooldowns = new Map<string, number>();

function isOnCooldown(taskId: string, tier: EscalationTier, cooldownMins: number): boolean {
  const key = `${taskId}:${tier}`;
  const last = cooldowns.get(key);
  if (!last) return false;
  return Date.now() - last < cooldownMins * 60_000;
}

function setCooldown(taskId: string, tier: EscalationTier): void {
  cooldowns.set(`${taskId}:${tier}`, Date.now());
}

function resolveTier(overdueMinutes: number, tiers: TierConfig[]): EscalationTier | null {
  let matched: TierConfig | null = null;
  for (const t of tiers) {
    if (overdueMinutes >= t.thresholdMins) matched = t;
  }
  return matched?.tier ?? null;
}

export async function runAccountabilityAgent(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { tenantId } = event;
  const start = Date.now();
  const playbook = await loadPlaybook(tenantId);
  const tiers: TierConfig[] = playbook?.accountability?.tiers ?? DEFAULT_TIERS;
  const cooldownMins = playbook?.accountability?.cooldownMins ?? 60;
  const escalationContact = playbook?.roles?.escalationContact ?? playbook?.roles?.acquisitionManager ?? 'am';
  const leadership = playbook?.roles?.leadership ?? escalationContact;

  const overdueTasks: OverdueTask[] = (event.metadata as any)?.overdueTasks ?? [];

  for (const task of overdueTasks) {
    const tier = resolveTier(task.overdueMinutes, tiers);
    if (!tier) continue;
    if (isOnCooldown(task.taskId, tier, cooldownMins)) continue;

    if (!isDryRun()) {
      switch (tier) {
        case 'yellow':
          await tagBot(task.contactId, ['overdue-task']);
          break;

        case 'orange':
          await taskBot(task.contactId, {
            title: `⚠️ OVERDUE (${task.overdueMinutes}min): ${task.title}`,
            assignedTo: escalationContact,
            dueDate: new Date(Date.now() + 30 * 60_000).toISOString(),
          });
          break;

        case 'red':
          await taskBot(task.contactId, {
            title: `🚨 CRITICAL OVERDUE (${task.overdueMinutes}min): ${task.title}`,
            assignedTo: leadership,
            dueDate: new Date(Date.now() + 15 * 60_000).toISOString(),
          });
          break;
      }

      setCooldown(task.taskId, tier);
    }

    auditLog({
      agent: AGENT_ID,
      contactId: task.contactId,
      opportunityId: task.opportunityId,
      action: `escalation.${tier}`,
      result: 'success',
      metadata: { overdueMinutes: task.overdueMinutes },
      durationMs: Date.now() - start,
    });
  }
}
