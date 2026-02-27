/**
 * Response Agent
 *
 * Fires on: sms.inbound (inbound SMS from lead)
 * Does: classifies message, routes to Offer Reply or Follow-Up Closer
 * Does NOT: touch CRM directly
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { loadPlaybook } from '../config';

const AGENT_ID = 'response-agent';

type Classification = 'real-engagement' | 'push-off' | 'dnc' | 'unknown';

interface SmsEvent extends GunnerEvent {
  fromNumber?: string;
  currentStage?: string;
}

export async function runResponseAgent(event: SmsEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, tenantId, message, currentStage } = event;
  const start = Date.now();
  const playbook = await loadPlaybook(tenantId);

  const classification = classifyMessage(message ?? '', playbook);

  // DNC gets immediate routing
  if (classification === 'dnc') {
    await emit({ kind: 'lead.dnc', tenantId, contactId, opportunityId, metadata: { message } });
    auditLog({
      agent: AGENT_ID, contactId, opportunityId,
      action: 'response:dnc', result: 'success', durationMs: Date.now() - start,
    });
    return;
  }

  // If in Offer stage, delegate to Offer Reply Agent
  const offerStages = playbook?.stages?.offer ?? [];
  if (currentStage && offerStages.includes(currentStage)) {
    await emit({
      kind: 'offer.reply', tenantId, contactId, opportunityId,
      metadata: { message, classification },
    });
    auditLog({
      agent: AGENT_ID, contactId, opportunityId,
      action: 'response:offer-reply', result: 'success', durationMs: Date.now() - start,
    });
    return;
  }

  // If in follow-up bucket, fire Follow-Up Closer
  const followUpStages = playbook?.stages?.followUp ?? [];
  if (currentStage && followUpStages.includes(currentStage)) {
    await emit({
      kind: 'followup.closer', tenantId, contactId, opportunityId,
      metadata: { message, classification },
    });
    auditLog({
      agent: AGENT_ID, contactId, opportunityId,
      action: 'response:followup-closer', result: 'success', durationMs: Date.now() - start,
    });
    return;
  }

  // Default: emit generic response event
  await emit({
    kind: 'lead.responded', tenantId, contactId, opportunityId,
    metadata: { message, classification },
  });

  auditLog({
    agent: AGENT_ID, contactId, opportunityId,
    action: 'response:classified', result: 'success',
    metadata: { classification },
    durationMs: Date.now() - start,
  });
}

function classifyMessage(message: string, playbook: any): Classification {
  const lower = message.toLowerCase().trim();

  const dncKeywords = playbook?.sms?.dncKeywords ?? ['stop', 'unsubscribe', 'remove me', 'do not contact', 'dnc'];
  if (dncKeywords.some((kw: string) => lower.includes(kw))) return 'dnc';

  const pushOffPatterns = playbook?.sms?.pushOffPatterns ?? ['not interested', 'no thanks', 'not right now', 'maybe later'];
  if (pushOffPatterns.some((p: string) => lower.includes(p))) return 'push-off';

  if (lower.length > 10 && (lower.includes('?') || lower.split(' ').length > 3)) {
    return 'real-engagement';
  }

  return 'unknown';
}
