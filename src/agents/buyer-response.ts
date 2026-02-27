/**
 * Buyer Response Agent
 *
 * Fires on: inbound message from a buyer contact
 * Does: AI-classifies response, routes accordingly, creates note
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { loadPlaybook } from '../config/loader';
import { noteBot, taskBot, tagBot, stageBot } from '../bots';
import { aiClassifierBot } from '../bots/ai-classifier';

const AGENT_ID = 'buyer-response';
const ESTEBAN_USER_ID = 'BhVAeJjAfojeX9AJdqbf';

type ResponseClass = 'interested' | 'pass' | 'question' | 'lowball' | 'schedule_showing';

interface Classification {
  intent: ResponseClass;
  confidence: number;
  summary: string;
}

export async function runBuyerResponse(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  try {
    const { contactId, tenantId, message: inboundMessage } = event;
    const start = Date.now();
    const playbook = await loadPlaybook(tenantId);

    if (!inboundMessage) return;

    const classification = await aiClassifierBot.classifyJSON<Classification>(
      `Classify this buyer's response to a real estate deal blast.
Message: "${inboundMessage}"
Categories: interested, pass, question, lowball, schedule_showing
Return JSON: {intent, confidence (0-1), summary}`,
      'You are a real estate disposition assistant. Classify buyer intent accurately. Return only valid JSON.'
    ).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'aiClassifierBot:failed', result: 'error', reason: err?.message });
      return null;
    }) || { intent: 'question' as ResponseClass, confidence: 0.5, summary: inboundMessage ?? '' };

    if (!isDryRun()) {
      await noteBot(contactId, [
        `📩 Buyer Response Classified`,
        `Intent: ${classification.intent} (${Math.round(classification.confidence * 100)}%)`,
        `Summary: ${classification.summary}`,
        `Original: "${inboundMessage}"`,
      ].join('\n')).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'noteBot:failed', result: 'error', reason: err?.message });
      });

      const buyerStages = playbook?.crm?.pipelines?.buyer?.stages;

      switch (classification.intent) {
        case 'interested':
          await tagBot(contactId, ['buyer-interested']).catch(err => {
            auditLog({ agent: AGENT_ID, contactId, action: 'tagBot:failed', result: 'error', reason: err?.message });
          });
          if (buyerStages?.interested) {
            const buyerOppId = (event.metadata as any)?.buyerOpportunityId;
            if (buyerOppId) await stageBot(buyerOppId, buyerStages.interested).catch(err => {
              auditLog({ agent: AGENT_ID, contactId, action: 'stageBot:failed', result: 'error', reason: err?.message });
            });
          }
          break;

        case 'schedule_showing':
          await tagBot(contactId, ['showing-requested']).catch(err => {
            auditLog({ agent: AGENT_ID, contactId, action: 'tagBot:failed', result: 'error', reason: err?.message });
          });
          if (buyerStages?.showing_scheduled) {
            const buyerOppId = (event.metadata as any)?.buyerOpportunityId;
            if (buyerOppId) await stageBot(buyerOppId, buyerStages.showing_scheduled).catch(err => {
              auditLog({ agent: AGENT_ID, contactId, action: 'stageBot:failed', result: 'error', reason: err?.message });
            });
          }
          break;

        case 'question':
          await taskBot(contactId, {
            title: `Buyer question needs answer`,
            body: `Message: "${inboundMessage}"\nClassification: ${classification.summary}`,
            assignedTo: ESTEBAN_USER_ID,
            dueDate: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
          }).catch(err => {
            auditLog({ agent: AGENT_ID, contactId, action: 'taskBot:failed', result: 'error', reason: err?.message });
          });
          break;

        case 'lowball':
          await tagBot(contactId, ['lowball-offer']).catch(err => {
            auditLog({ agent: AGENT_ID, contactId, action: 'tagBot:failed', result: 'error', reason: err?.message });
          });
          await taskBot(contactId, {
            title: `Lowball offer received — review`,
            body: `Message: "${inboundMessage}"`,
            assignedTo: ESTEBAN_USER_ID,
            dueDate: new Date(Date.now() + 4 * 60 * 60_000).toISOString(),
          }).catch(err => {
            auditLog({ agent: AGENT_ID, contactId, action: 'taskBot:failed', result: 'error', reason: err?.message });
          });
          break;

        case 'pass':
          await tagBot(contactId, ['buyer-passed']).catch(err => {
            auditLog({ agent: AGENT_ID, contactId, action: 'tagBot:failed', result: 'error', reason: err?.message });
          });
          break;
      }
    }

    await emit({
      kind: 'buyer.response',
      tenantId,
      contactId,
      metadata: { intent: classification.intent, confidence: classification.confidence },
    }).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'emit:buyer.response:failed', result: 'error', reason: err?.message });
    });

    auditLog({
      agent: AGENT_ID,
      contactId,
      action: `buyer.response.${classification.intent}`,
      result: 'success',
      metadata: { intent: classification.intent, confidence: classification.confidence },
      durationMs: Date.now() - start,
    });
  } catch (err: any) {
    auditLog({ agent: AGENT_ID, contactId: event.contactId, action: 'agent:crashed', result: 'error', reason: err?.message });
  }
}
