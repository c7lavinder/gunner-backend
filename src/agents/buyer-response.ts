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

  const { contactId, tenantId, message: inboundMessage } = event;
  const start = Date.now();
  const playbook = await loadPlaybook(tenantId);

  if (!inboundMessage) return;

  // AI-classify the response
  const classification = await aiClassifierBot.classifyJSON<Classification>(
    `Classify this buyer's response to a real estate deal blast.
Message: "${inboundMessage}"
Categories: interested, pass, question, lowball, schedule_showing
Return JSON: {intent, confidence (0-1), summary}`,
    'You are a real estate disposition assistant. Classify buyer intent accurately. Return only valid JSON.'
  ) || { intent: 'question' as ResponseClass, confidence: 0.5, summary: inboundMessage ?? '' };

  if (!isDryRun()) {
    await noteBot(contactId, [
      `📩 Buyer Response Classified`,
      `Intent: ${classification.intent} (${Math.round(classification.confidence * 100)}%)`,
      `Summary: ${classification.summary}`,
      `Original: "${inboundMessage}"`,
    ].join('\n'));

    const buyerStages = playbook?.crm?.pipelines?.buyer?.stages;

    switch (classification.intent) {
      case 'interested':
        await tagBot(contactId, ['buyer-interested']);
        if (buyerStages?.interested) {
          // Move buyer to interested stage if they have an opp
          const buyerOppId = (event.metadata as any)?.buyerOpportunityId;
          if (buyerOppId) await stageBot(buyerOppId, buyerStages.interested);
        }
        break;

      case 'schedule_showing':
        await tagBot(contactId, ['showing-requested']);
        if (buyerStages?.showing_scheduled) {
          const buyerOppId = (event.metadata as any)?.buyerOpportunityId;
          if (buyerOppId) await stageBot(buyerOppId, buyerStages.showing_scheduled);
        }
        break;

      case 'question':
        await taskBot(contactId, {
          title: `Buyer question needs answer`,
          body: `Message: "${inboundMessage}"\nClassification: ${classification.summary}`,
          assignedTo: ESTEBAN_USER_ID,
          dueDate: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
        });
        break;

      case 'lowball':
        await tagBot(contactId, ['lowball-offer']);
        await taskBot(contactId, {
          title: `Lowball offer received — review`,
          body: `Message: "${inboundMessage}"`,
          assignedTo: ESTEBAN_USER_ID,
          dueDate: new Date(Date.now() + 4 * 60 * 60_000).toISOString(),
        });
        break;

      case 'pass':
        await tagBot(contactId, ['buyer-passed']);
        break;
    }
  }

  await emit({
    kind: 'buyer.response',
    tenantId,
    contactId,
    metadata: { intent: classification.intent, confidence: classification.confidence },
  });

  auditLog({
    agent: AGENT_ID,
    contactId,
    action: `buyer.response.${classification.intent}`,
    result: 'success',
    metadata: { intent: classification.intent, confidence: classification.confidence },
    durationMs: Date.now() - start,
  });
}
