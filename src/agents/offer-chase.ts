/**
 * Offer Chase Agent
 *
 * Fires on: opportunity.stage.offer (when deal enters Offer stage)
 * Does: 3-touch follow-up cadence via smsBot + taskBot
 *   Touch 1 (Day 3): check-in
 *   Touch 2 (Day 7): any questions?
 *   Touch 3 (Day 14): final follow-up
 *   No reply after 3 → AM task: renegotiate or walk away
 * Cancels on: accept, counter, reject
 * Resets on: stall
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { loadPlaybook } from '../config/loader';
import { smsBot, taskBot, fieldBot } from '../bots';

const AGENT_ID = 'offer-chase';

interface ChaseCadence {
  touchNumber: number;
  delayDays: number;
  templateKey: string;
}

const DEFAULT_CADENCE: ChaseCadence[] = [
  { touchNumber: 1, delayDays: 3, templateKey: 'offer_chase_checkin' },
  { touchNumber: 2, delayDays: 7, templateKey: 'offer_chase_questions' },
  { touchNumber: 3, delayDays: 14, templateKey: 'offer_chase_final' },
];

export async function runOfferChase(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, tenantId } = event;
  const start = Date.now();
  const playbook = await loadPlaybook(tenantId);
  const cadence = playbook?.offerChase?.cadence ?? DEFAULT_CADENCE;

  // Guard: check current touch number from contact field
  const currentTouch = event.metadata?.touchNumber ?? 1;
  const touchConfig = cadence.find((c: ChaseCadence) => c.touchNumber === currentTouch);

  if (!touchConfig) {
    // All touches exhausted — create AM escalation task
    if (!isDryRun()) {
      await taskBot({
        contactId,
        opportunityId,
        tenantId,
        title: 'Offer Chase: No reply after 3 touches — renegotiate or walk away',
        assignTo: playbook?.roles?.acquisitionManager ?? 'am',
        dueMins: 60,
      });

      await fieldBot({
        contactId,
        tenantId,
        fields: { offer_chase_status: 'exhausted' },
      });
    }

    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'chase.exhausted',
      result: 'am_task_created',
      durationMs: Date.now() - start,
    });
    return;
  }

  // Guard: check for cancel signals (accept/counter/reject)
  const status = event.metadata?.offerStatus;
  if (status === 'accepted' || status === 'countered' || status === 'rejected') {
    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'chase.cancelled',
      result: `offer_${status}`,
      durationMs: Date.now() - start,
    });
    return;
  }

  // Guard: reset on stall
  if (status === 'stall') {
    if (!isDryRun()) {
      await fieldBot({
        contactId,
        tenantId,
        fields: { offer_chase_touch: '1', offer_chase_status: 'active' },
      });
    }

    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'chase.reset',
      result: 'stall_detected',
      durationMs: Date.now() - start,
    });

    await emit({
      kind: 'offer.chase.scheduled',
      tenantId,
      contactId,
      opportunityId,
      metadata: { touchNumber: 1, delayDays: cadence[0].delayDays },
    });
    return;
  }

  // Execute current touch
  if (!isDryRun()) {
    await smsBot({
      contactId,
      tenantId,
      templateKey: touchConfig.templateKey,
      context: { opportunityId, touchNumber: currentTouch },
    });

    await fieldBot({
      contactId,
      tenantId,
      fields: {
        offer_chase_touch: String(currentTouch),
        offer_chase_last_sent: new Date().toISOString(),
      },
    });
  }

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: `chase.touch_${currentTouch}`,
    result: 'sms_sent',
    durationMs: Date.now() - start,
  });

  // Schedule next touch
  const nextTouch = currentTouch + 1;
  const nextConfig = cadence.find((c: ChaseCadence) => c.touchNumber === nextTouch);

  await emit({
    kind: 'offer.chase.scheduled',
    tenantId,
    contactId,
    opportunityId,
    metadata: {
      touchNumber: nextTouch,
      delayDays: nextConfig?.delayDays ?? null,
    },
  });
}
