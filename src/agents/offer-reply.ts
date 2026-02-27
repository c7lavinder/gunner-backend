/**
 * Offer Reply Agent — pure orchestration.
 * Fires on: message.inbound when seller in Offer stage
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { loadPlaybook } from '../config';
import { taskBot } from '../bots';
import { classifierBot } from '../bots/classifier';
import { schedulerBot } from '../bots/scheduler';
import { memoryWriterBot } from '../bots/memory-writer';

const AGENT_ID = 'offer-reply';

export async function runOfferReply(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, tenantId } = event;
  const messageBody = (event.metadata?.messageBody as string) ?? event.message ?? '';
  const start = Date.now();
  const playbook = await loadPlaybook(tenantId);
  const am = playbook?.roles?.acquisitionManager ?? 'am';

  if (!messageBody) {
    auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'skip', result: 'skipped', durationMs: 0 });
    return;
  }

  const classification = await classifierBot.classifyOfferReply(messageBody, tenantId);

  if (!isDryRun()) {
    switch (classification.outcome) {
      case 'accept':
        await taskBot(contactId, { title: 'Seller ACCEPTED offer — lock it down', assignedTo: am, dueDate: schedulerBot.dueIn(30) });
        await emit({ kind: 'offer.accepted', tenantId, contactId, opportunityId, metadata: { classification } });
        break;
      case 'counter':
        await taskBot(contactId, { title: `Seller COUNTERED — amount: $${classification.counterAmount ?? 'unknown'}`, assignedTo: am, dueDate: schedulerBot.dueIn(30) });
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
        await taskBot(contactId, { title: `Unclear offer reply — call seller: "${classification.summary}"`, assignedTo: am, dueDate: schedulerBot.dueIn(30) });
        break;
    }
  }

  await memoryWriterBot.recordAction('classification-corrections', { contactId, message: messageBody, context: 'offer-reply' }, { classification: classification.outcome, confidence: classification.confidence }, tenantId);

  auditLog({ agent: AGENT_ID, contactId, opportunityId, action: `reply.${classification.outcome}`, result: 'success', metadata: { confidence: classification.confidence }, durationMs: Date.now() - start });
}
