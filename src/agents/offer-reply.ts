/**
 * Offer Reply Agent
 *
 * Fires on: message.inbound (when seller in Offer stage sends a message)
 * Does: AI-classifies into 5 outcomes, routes accordingly
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { loadPlaybook } from '../config';
import { taskBot } from '../bots';

const AGENT_ID = 'offer-reply';

type OfferOutcome = 'accept' | 'counter' | 'stall' | 'reject' | 'unclear';

interface ClassificationResult {
  outcome: OfferOutcome;
  confidence: number;
  counterAmount?: number;
  summary: string;
}

async function classifyReply(message: string, _tenantId: string): Promise<ClassificationResult> {
  // TODO: wire to AI intelligence service
  return { outcome: 'unclear', confidence: 0, summary: message.slice(0, 100) };
}

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

  const classification = await classifyReply(messageBody, tenantId);

  if (!isDryRun()) {
    switch (classification.outcome) {
      case 'accept':
        await taskBot(contactId, { title: 'Seller ACCEPTED offer — lock it down', assignedTo: am, dueDate: new Date(Date.now() + 30 * 60_000).toISOString() });
        await emit({ kind: 'offer.accepted', tenantId, contactId, opportunityId, metadata: { classification } });
        break;
      case 'counter':
        await taskBot(contactId, { title: `Seller COUNTERED — amount: $${classification.counterAmount ?? 'unknown'}`, assignedTo: am, dueDate: new Date(Date.now() + 30 * 60_000).toISOString() });
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
        await taskBot(contactId, { title: `Unclear offer reply — call seller: "${classification.summary}"`, assignedTo: am, dueDate: new Date(Date.now() + 30 * 60_000).toISOString() });
        break;
    }
  }

  auditLog({
    agent: AGENT_ID, contactId, opportunityId,
    action: `reply.${classification.outcome}`,
    result: 'success',
    metadata: { confidence: classification.confidence },
    durationMs: Date.now() - start,
  });
}
