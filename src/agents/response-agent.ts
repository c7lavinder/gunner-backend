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
import { getPlaybook } from '../core/playbook';

const AGENT_ID = 'response-agent';

type Classification = 'real-engagement' | 'push-off' | 'dnc' | 'unknown';

interface SmsEvent extends GunnerEvent {
  message: string;
  fromNumber: string;
  currentStage?: string;
}

export async function runResponseAgent(event: SmsEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, tenantId, message, currentStage } = event;
  const start = Date.now();
  const playbook = getPlaybook(tenantId);

  const classification = classifyMessage(message, playbook);

  // Guard: DNC gets immediate routing, no further processing
  if (classification === 'dnc') {
    await emit({ kind: 'lead.dnc', tenantId, contactId, opportunityId, message });
    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'response:dnc',
      result: 'routed',
      durationMs: Date.now() - start,
    });
    return;
  }

  // If in Offer stage, delegate to Offer Reply Agent
  const offerStages = playbook?.stages?.offer ?? ['Offer Made', 'Offer'];
  if (currentStage && offerStages.includes(currentStage)) {
    await emit({
      kind: 'offer.reply',
      tenantId,
      contactId,
      opportunityId,
      message,
      classification,
    });
    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'response:offer-reply',
      result: classification,
      durationMs: Date.now() - start,
    });
    return;
  }

  // If in follow-up bucket, fire Follow-Up Closer
  const followUpStages = playbook?.stages?.followUp ?? [
    'Follow Up 1 Month',
    'Follow Up 4 Month',
    'Follow Up 1 Year',
  ];
  if (currentStage && followUpStages.includes(currentStage)) {
    await emit({
      kind: 'followup.closer',
      tenantId,
      contactId,
      opportunityId,
      message,
      classification,
    });
    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'response:followup-closer',
      result: classification,
      durationMs: Date.now() - start,
    });
    return;
  }

  // Default: emit generic response event
  await emit({
    kind: 'lead.responded',
    tenantId,
    contactId,
    opportunityId,
    message,
    classification,
  });

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: 'response:classified',
    result: classification,
    durationMs: Date.now() - start,
  });
}

function classifyMessage(message: string, playbook: any): Classification {
  const lower = message.toLowerCase().trim();

  // DNC keywords
  const dncKeywords = playbook?.sms?.dncKeywords ?? ['stop', 'unsubscribe', 'remove me', 'do not contact', 'dnc'];
  if (dncKeywords.some((kw: string) => lower.includes(kw))) return 'dnc';

  // Push-off patterns
  const pushOffPatterns = playbook?.sms?.pushOffPatterns ?? ['not interested', 'no thanks', 'not right now', 'maybe later'];
  if (pushOffPatterns.some((p: string) => lower.includes(p))) return 'push-off';

  // If message has substance (>10 chars, has question marks or multiple words), likely engagement
  if (lower.length > 10 && (lower.includes('?') || lower.split(' ').length > 3)) {
    return 'real-engagement';
  }

  return 'unknown';
}
