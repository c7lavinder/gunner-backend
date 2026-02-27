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

const AGENT_ID = 'deal-blaster';

export async function runDealBlaster(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, tenantId } = event;
  const start = Date.now();
  const playbook = await loadPlaybook(tenantId);

  const contact = await contactBot(contactId);
  const cf = (contact as any)?.customFields ?? {};

  const propertyAddress = cf.property_address ?? 'N/A';
  const arv = cf.arv ?? 'N/A';
  const contractPrice = cf.contract_price ?? 'N/A';
  const repairs = cf.repair_estimate ?? 'N/A';
  const bedsBaths = cf.beds_baths ?? '';
  const sqft = cf.sqft ?? '';
  const photosLink = cf.photos_link ?? '';

  // AI-generate the blast message
  const blastMessage = await aiWriterBot.writeText(
    `Write a short, punchy deal blast SMS for real estate investors. Keep it under 300 chars.
Property: ${propertyAddress}
ARV: ${arv} | Price: ${contractPrice} | Repairs: ${repairs}
${bedsBaths ? `Beds/Baths: ${bedsBaths}` : ''}${sqft ? ` | Sqft: ${sqft}` : ''}
${photosLink ? `Photos: ${photosLink}` : ''}
End with "Reply INTERESTED or call us"`,
    'You are a real estate wholesaler writing deal blast texts to cash buyers. Be direct, highlight the spread/ROI.'
  ) || `🏠 NEW DEAL: ${propertyAddress}\nARV: ${arv} | Price: ${contractPrice} | Repairs: ${repairs}\n${photosLink ? `Photos: ${photosLink}\n` : ''}Reply INTERESTED or call us`;

  // Get buyer list from playbook/metadata
  const buyerContactIds: string[] = (event.metadata as any)?.qualifiedBuyerIds ?? [];

  if (!isDryRun()) {
    // Send blast to all qualified buyers
    for (const buyerId of buyerContactIds) {
      await smsBot(buyerId, blastMessage);
    }

    // Note on dispo opportunity
    await noteBot(contactId, [
      `📢 Deal Blast Sent`,
      `Property: ${propertyAddress}`,
      `Sent to ${buyerContactIds.length} qualified buyers`,
      `Message: ${blastMessage}`,
    ].join('\n'));

    // Move to sent_to_buyers
    const sentStageId = playbook?.crm?.pipelines?.dispo?.stages?.sent_to_buyers;
    if (opportunityId && sentStageId) {
      await stageBot(opportunityId, sentStageId);
    }

    // Tag deal
    await tagBot(contactId, ['blasted']);
  }

  await emit({
    kind: 'dispo.blast.sent',
    tenantId,
    contactId,
    opportunityId,
    metadata: { buyerCount: buyerContactIds.length },
  });

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: 'dispo.blast.sent',
    result: 'success',
    metadata: { buyerCount: buyerContactIds.length, address: propertyAddress },
    durationMs: Date.now() - start,
  });
}
