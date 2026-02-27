/**
 * Offer Chase Agent
 *
 * Fires on: opportunity.stage.offer (when deal enters Offer stage)
 * Does: 3-touch follow-up cadence via smsBot + taskBot
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { loadPlaybook, getSla, getSendWindow } from '../config';
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

  try {
    const { contactId, opportunityId, tenantId } = event;
    const start = Date.now();
    const playbook = await loadPlaybook(tenantId);
    const cadence = playbook?.offerChase?.cadence ?? DEFAULT_CADENCE;
    const sla = await getSla(tenantId, 'offer_chase_escalation');

    const currentTouch = (event.metadata?.touchNumber as number) ?? 1;
    const touchConfig = cadence.find((c: ChaseCadence) => c.touchNumber === currentTouch);

    if (!touchConfig) {
      if (!isDryRun()) {
        await taskBot(contactId, {
          title: 'Offer Chase: No reply after 3 touches — renegotiate or walk away',
          assignedTo: playbook?.roles?.acquisitionManager ?? 'am',
          dueDate: new Date(Date.now() + (sla ?? 60) * 60_000).toISOString(),
        }).catch(err => {
          auditLog({ agent: AGENT_ID, contactId, action: 'taskBot:failed', result: 'error', reason: err?.message });
        });
        await fieldBot(contactId, { offer_chase_status: 'exhausted' }).catch(err => {
          auditLog({ agent: AGENT_ID, contactId, action: 'fieldBot:failed', result: 'error', reason: err?.message });
        });
      }
      auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'chase.exhausted', result: 'success', durationMs: Date.now() - start });
      return;
    }

    const status = event.metadata?.offerStatus as string | undefined;
    if (status === 'accepted' || status === 'countered' || status === 'rejected') {
      auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'chase.cancelled', result: 'success', metadata: { status }, durationMs: Date.now() - start });
      return;
    }

    if (status === 'stall') {
      if (!isDryRun()) {
        await fieldBot(contactId, { offer_chase_touch: '1', offer_chase_status: 'active' }).catch(err => {
          auditLog({ agent: AGENT_ID, contactId, action: 'fieldBot:failed', result: 'error', reason: err?.message });
        });
      }
      auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'chase.reset', result: 'success', durationMs: Date.now() - start });
      await emit({ kind: 'offer.chase.scheduled', tenantId, contactId, opportunityId, metadata: { touchNumber: 1, delayDays: cadence[0].delayDays } }).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'emit:offer.chase.scheduled:failed', result: 'error', reason: err?.message });
      });
      return;
    }

    if (!isDryRun()) {
      await smsBot(contactId, `Offer chase touch ${currentTouch}`).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'smsBot:failed', result: 'error', reason: err?.message });
      });
      await fieldBot(contactId, { offer_chase_touch: String(currentTouch), offer_chase_last_sent: new Date().toISOString() }).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'fieldBot:failed', result: 'error', reason: err?.message });
      });
    }

    auditLog({ agent: AGENT_ID, contactId, opportunityId, action: `chase.touch_${currentTouch}`, result: 'success', durationMs: Date.now() - start });

    const nextTouch = currentTouch + 1;
    const nextConfig = cadence.find((c: ChaseCadence) => c.touchNumber === nextTouch);
    await emit({ kind: 'offer.chase.scheduled', tenantId, contactId, opportunityId, metadata: { touchNumber: nextTouch, delayDays: nextConfig?.delayDays ?? null } }).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'emit:offer.chase.scheduled:failed', result: 'error', reason: err?.message });
    });
  } catch (err: any) {
    auditLog({ agent: AGENT_ID, contactId: event.contactId, action: 'agent:crashed', result: 'error', reason: err?.message });
  }
}
