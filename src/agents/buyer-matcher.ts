/**
 * Buyer Matcher Agent
 *
 * Fires on: dispo stage → new_deal
 * Does: Scores buyers against deal criteria, creates ranked list note, tags top matches
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { loadPlaybook } from '../config/loader';
import { contactBot, noteBot, tagBot } from '../bots';
import { aiClassifierBot } from '../bots/ai-classifier';

const AGENT_ID = 'buyer-matcher';

interface BuyerScore {
  buyerId: string;
  name: string;
  score: number;
  reasons: string[];
}

export async function runBuyerMatcher(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, tenantId } = event;
  const start = Date.now();
  const playbook = await loadPlaybook(tenantId);

  const contact = await contactBot(contactId);
  const cf = (contact as any)?.customFields ?? {};

  const propertyAddress = cf.property_address ?? 'N/A';
  const arv = cf.arv ?? 'N/A';
  const contractPrice = cf.contract_price ?? 'N/A';
  const propertyType = cf.property_type ?? 'SFR';
  const area = cf.city ?? cf.county ?? 'Nashville';

  // Buyer list comes from event metadata (populated by webhook/poller that fetches buyer pipeline contacts)
  const buyers: Array<{
    id: string;
    name: string;
    tier: string;
    buyBox?: { areas?: string[]; propertyTypes?: string[]; maxPrice?: number; minPrice?: number };
  }> = (event.metadata as any)?.buyers ?? [];

  if (buyers.length === 0) {
    auditLog({
      agent: AGENT_ID,
      contactId,
      action: 'buyer.match.skipped',
      result: 'no-buyers',
      durationMs: Date.now() - start,
    });
    return;
  }

  // AI-score buyers against deal
  const scoredBuyers = await aiClassifierBot.classifyJSON<BuyerScore[]>(
    `Score these buyers against this deal. Return JSON array of {buyerId, name, score (0-100), reasons: string[]}.
Deal: ${propertyAddress}, ARV: ${arv}, Price: ${contractPrice}, Type: ${propertyType}, Area: ${area}
Buyers: ${JSON.stringify(buyers.map(b => ({ id: b.id, name: b.name, tier: b.tier, buyBox: b.buyBox })))}
Score higher for: tier match (priority_buyer=+30, qualified_buyer=+20, new_buyer=+10), area match (+25), property type match (+20), price range match (+25).
Return top matches sorted by score descending.`,
    'You are a real estate deal matching engine. Return only valid JSON.'
  ) || [];

  const topBuyers = scoredBuyers.slice(0, 20);

  if (!isDryRun()) {
    // Create ranked buyer list note
    const noteLines = [
      `🎯 Buyer Match Results — ${propertyAddress}`,
      `Deal: ${contractPrice} | ARV: ${arv} | Type: ${propertyType}`,
      `---`,
      ...topBuyers.map((b, i) => `${i + 1}. ${b.name} (Score: ${b.score}) — ${b.reasons.join(', ')}`),
      `---`,
      `Total matched: ${scoredBuyers.length} buyers`,
    ];
    await noteBot(contactId, noteLines.join('\n'));

    // Tag top 5 matches
    for (const buyer of topBuyers.slice(0, 5)) {
      await tagBot(buyer.buyerId, ['matched-deal']);
    }
  }

  await emit({
    kind: 'buyer.matched',
    tenantId,
    contactId,
    opportunityId,
    metadata: { matchCount: topBuyers.length, topBuyerIds: topBuyers.map(b => b.buyerId) },
  });

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: 'buyer.matched',
    result: 'success',
    metadata: { matchCount: topBuyers.length },
    durationMs: Date.now() - start,
  });
}
