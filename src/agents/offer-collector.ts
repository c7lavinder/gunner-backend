/**
 * Offer Collector Agent
 *
 * Fires on: dispo stage → offers_received
 * Does: Logs offer, ranks against others, creates comparison note, tasks Esteban
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { loadPlaybook } from '../config/loader';
import { contactBot, noteBot, taskBot } from '../bots';

const AGENT_ID = 'offer-collector';
const ESTEBAN_USER_ID = 'BhVAeJjAfojeX9AJdqbf';

interface Offer {
  buyerName: string;
  buyerId: string;
  price: number;
  terms: string;
  proofOfFunds: boolean;
  closingTimeline: string;
}

export async function runOfferCollector(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, tenantId } = event;
  const start = Date.now();
  const playbook = await loadPlaybook(tenantId);

  const contact = await contactBot(contactId);
  const cf = (contact as any)?.customFields ?? {};
  const propertyAddress = cf.property_address ?? 'N/A';

  // Offers come from event metadata (populated by webhook or manual entry)
  const offers: Offer[] = (event.metadata as any)?.offers ?? [];
  const newOffer: Partial<Offer> = (event.metadata as any)?.newOffer ?? {};

  // Sort offers by price descending
  const allOffers = [...offers];
  if (newOffer.price) {
    allOffers.push({
      buyerName: newOffer.buyerName ?? 'Unknown',
      buyerId: newOffer.buyerId ?? '',
      price: newOffer.price,
      terms: newOffer.terms ?? 'Cash',
      proofOfFunds: newOffer.proofOfFunds ?? false,
      closingTimeline: newOffer.closingTimeline ?? 'TBD',
    });
  }

  allOffers.sort((a, b) => b.price - a.price);

  if (!isDryRun()) {
    // Create comparison note
    const highest = allOffers[0];
    const noteLines = [
      `💰 Offer Summary — ${propertyAddress}`,
      `${allOffers.length} offer(s) received — highest: $${highest?.price?.toLocaleString() ?? 'N/A'} from ${highest?.buyerName ?? 'N/A'}`,
      `---`,
      ...allOffers.map((o, i) => [
        `${i + 1}. ${o.buyerName}: $${o.price.toLocaleString()}`,
        `   Terms: ${o.terms} | POF: ${o.proofOfFunds ? '✅' : '❌'} | Close: ${o.closingTimeline}`,
      ].join('\n')),
    ];
    await noteBot(contactId, noteLines.join('\n'));

    // Create review task for Esteban
    await taskBot(contactId, {
      title: `📋 Review ${allOffers.length} offer(s) on ${propertyAddress}`,
      body: `Highest: $${highest?.price?.toLocaleString() ?? 'N/A'} from ${highest?.buyerName ?? 'N/A'}\nTotal offers: ${allOffers.length}`,
      assignedTo: ESTEBAN_USER_ID,
      dueDate: new Date(Date.now() + 4 * 60 * 60_000).toISOString(),
    });
  }

  await emit({
    kind: 'dispo.offer.received',
    tenantId,
    contactId,
    opportunityId,
    metadata: { offerCount: allOffers.length, highestPrice: allOffers[0]?.price },
  });

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: 'dispo.offer.collected',
    result: 'success',
    metadata: { offerCount: allOffers.length },
    durationMs: Date.now() - start,
  });
}
