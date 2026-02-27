/**
 * Offer Reply Agent
 *
 * Fires on: message.inbound (when seller in Offer stage sends a message)
 * Does: AI-classifies into 5 outcomes, routes accordingly
 *   Accept → AM task (30 min deadline)
 *   Counter → AM task with counter amount
 *   Stall → reset offer chase cadence
 *   Reject → bucket re-eval
 *   Unclear → AM task to call seller
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { loadPlaybook } from '../config/loader';
import { taskBot } from '../bots';

const AGENT_ID = 'offer-reply';

type OfferOutcome = 'accept' | 'counter' | 'stall' | 'reject' | 'unclear';

interface ClassificationResult {
  outcome: OfferOutcome;
  confidence: number;
  counterAmount?: number;
  summary: string;
}

async function classifyReply(
  message: string,
  _tenantId: string,
): Promise<ClassificationResult> {
  // Delegates to AI intelligence service
  const { classifyOfferReply } = await import('../intelligence/offer-classifier');
  return classifyOfferReply(message);
}

export async function runOfferReply(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, tenantId } = event;
  const message = event.metadata?.messageBody;
  const start = Date.now();
  const playbook = await loadPlaybook(tenantId);
  const am = playbook?.roles?.acquisitionManager ?? 'am';

  if (!message) {
    auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'skip', result: 'no_message_body', durationMs: 0 });
    return;
  }

  const classification = await classifyReply(message, tenantId);

  if (!isDryRun()) {
    switch (classification.outcome) {
      case 'accept':
        await taskBot({
          contactId, opportunityId, tenantId,
          title: 'Seller ACCEPTED offer — lock it down',
          assignTo: am,
          dueMins: 30,
        });
        await emit({ kind: 'offer.accepted', tenantId, contactId, opportunityId, metadata: { classification } });
        break;

      case 'counter':
        await taskBot({
          contactId, opportunityId, tenantId,
          title: `Seller COUNTERED — amount: $${classification.counterAmount ?? 'unknown'}`,
          assignTo: am,
          dueMins: 30,
        });
        await emit({ kind: 'offer.countered', tenantId, contactId, opportunityId, metadata: { classification } });
        break;

      case 'stall':
        await emit({ kind: 'offer.stall', tenantId, contactId, opportunityId, metadata: { offerStatus: 'stall' } });
        break;

      case 'reject':
        await emit({ kind: 'offer.rejected', tenantId, contactId, opportunityId, metadata: { classification } });
        await emit({ kind: 'bucket.reeval', tenantId, contactId, opportunityId });
        break;

      case 'unclear':
        await taskBot({
          contactId, opportunityId, tenantId,
          title: `Unclear offer reply — call seller: "${classification.summary}"`,
          assignTo: am,
          dueMins: 30,
        });
        break;
    }
  }

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: `reply.${classification.outcome}`,
    result: `confidence:${classification.confidence}`,
    durationMs: Date.now() - start,
  });
}
