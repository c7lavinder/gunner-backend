/**
 * Response Agent — pure orchestration.
 * Fires on: sms.inbound
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { loadPlaybook } from '../config';
import { classifierBot } from '../bots/classifier';
import { memoryWriterBot } from '../bots/memory-writer';

const AGENT_ID = 'response-agent';

interface SmsEvent extends GunnerEvent {
  fromNumber?: string;
  currentStage?: string;
}

export async function runResponseAgent(event: SmsEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, tenantId, message, currentStage } = event;
  const start = Date.now();
  const playbook = await loadPlaybook(tenantId);

  const classification = classifierBot.classifyMessage(message ?? '', playbook);

  if (classification === 'dnc') {
    await emit({ kind: 'lead.dnc', tenantId, contactId, opportunityId, metadata: { message } });
    auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'response:dnc', result: 'success', durationMs: Date.now() - start });
    return;
  }

  const offerStages = playbook?.stages?.offer ?? [];
  if (currentStage && offerStages.includes(currentStage)) {
    await emit({ kind: 'offer.reply', tenantId, contactId, opportunityId, metadata: { message, classification } });
    auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'response:offer-reply', result: 'success', durationMs: Date.now() - start });
    return;
  }

  const followUpStages = playbook?.stages?.followUp ?? [];
  if (currentStage && followUpStages.includes(currentStage)) {
    await emit({ kind: 'followup.closer', tenantId, contactId, opportunityId, metadata: { message, classification } });
    auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'response:followup-closer', result: 'success', durationMs: Date.now() - start });
    return;
  }

  await emit({ kind: 'lead.responded', tenantId, contactId, opportunityId, metadata: { message, classification } });

  await memoryWriterBot.recordAction('classification-corrections', { contactId, message }, { classification }, tenantId);

  auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'response:classified', result: 'success', metadata: { classification }, durationMs: Date.now() - start });
}
