/**
 * Deal Blaster Agent
 *
 * Fires on: dispo stage → clear_to_send
 * Does: AI-writes deal blast message, sends to qualified/priority buyers,
 *       creates note, moves to sent_to_buyers, tags deal "blasted"
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { loadPlaybook } from '../config/loader';
import { contactBot, noteBot, smsBot, stageBot, tagBot } from '../bots';
import { aiWriterBot } from '../bots/ai-writer';
import { intelligenceBot } from '../bots/intelligence';

const AGENT_ID = 'deal-blaster';

export async function runDealBlaster(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  try {
    const { contactId, opportunityId, tenantId } = event;
    const start = Date.now();
    const playbook = await loadPlaybook(tenantId);

    const contact = await contactBot(contactId).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'contactBot:failed', result: 'error', reason: err?.message });
      return null;
    });
    const cf = (contact as any)?.customFields ?? {};

    const propertyAddress = cf.property_address ?? 'N/A';
    const arv = cf.arv ?? 'N/A';
    const contractPrice = cf.contract_price ?? 'N/A';
    const repairs = cf.repair_estimate ?? 'N/A';
    const bedsBaths = cf.beds_baths ?? '';
    const sqft = cf.sqft ?? '';
    const photosLink = cf.photos_link ?? '';

    const blastMessage = await aiWriterBot.writeText(
      `Write a short, punchy deal blast SMS for real estate investors. Keep it under 300 chars.
Property: ${propertyAddress}
ARV: ${arv} | Price: ${contractPrice} | Repairs: ${repairs}
${bedsBaths ? `Beds/Baths: ${bedsBaths}` : ''}${sqft ? ` | Sqft: ${sqft}` : ''}
${photosLink ? `Photos: ${photosLink}` : ''}
End with "Reply INTERESTED or call us"`,
      'You are a real estate wholesaler writing deal blast texts to cash buyers. Be direct, highlight the spread/ROI.'
    ).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'aiWriterBot:failed', result: 'error', reason: err?.message });
      return '';
    }) || `🏠 NEW DEAL: ${propertyAddress}\nARV: ${arv} | Price: ${contractPrice} | Repairs: ${repairs}\n${photosLink ? `Photos: ${photosLink}\n` : ''}Reply INTERESTED or call us`;

    const buyerContactIds: string[] = (event.metadata as any)?.qualifiedBuyerIds ?? [];

    if (!isDryRun()) {
      for (const buyerId of buyerContactIds) {
        await smsBot(buyerId, blastMessage).catch(err => {
          auditLog({ agent: AGENT_ID, contactId: buyerId, action: 'smsBot:failed', result: 'error', reason: err?.message });
        });
      }

      await noteBot(contactId, [
        `📢 Deal Blast Sent`,
        `Property: ${propertyAddress}`,
        `Sent to ${buyerContactIds.length} qualified buyers`,
        `Message: ${blastMessage}`,
      ].join('\n')).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'noteBot:failed', result: 'error', reason: err?.message });
      });

      const sentStageId = playbook?.crm?.pipelines?.dispo?.stages?.sent_to_buyers;
      if (opportunityId && sentStageId) {
        await stageBot(opportunityId, sentStageId).catch(err => {
          auditLog({ agent: AGENT_ID, contactId, action: 'stageBot:failed', result: 'error', reason: err?.message });
        });
      }

      await tagBot(contactId, ['blasted']).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'tagBot:failed', result: 'error', reason: err?.message });
      });
    }

    await emit({
      kind: 'dispo.blast.sent',
      tenantId,
      contactId,
      opportunityId,
      metadata: { buyerCount: buyerContactIds.length },
    }).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'emit:dispo.blast.sent:failed', result: 'error', reason: err?.message });
    });

    await intelligenceBot.recordAction('sms-performance', { contactId, context: 'deal-blast', propertyAddress }, { message: blastMessage, buyerCount: buyerContactIds.length, sentAt: Date.now() }, tenantId);

    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'dispo.blast.sent',
      result: 'success',
      metadata: { buyerCount: buyerContactIds.length, address: propertyAddress },
      durationMs: Date.now() - start,
    });
  } catch (err: any) {
    auditLog({ agent: AGENT_ID, contactId: event.contactId, action: 'agent:crashed', result: 'error', reason: err?.message });
  }
}
