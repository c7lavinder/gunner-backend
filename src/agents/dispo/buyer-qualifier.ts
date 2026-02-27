/**
 * Buyer Qualifier Agent
 *
 * Fires on: buyer.response (after enough activity) or periodic evaluation
 * Does: Scores buyers based on activity, proof of funds, past purchases.
 *       Moves to qualified/unqualified in buyer pipeline.
 */

import { GunnerEvent } from '../../core/event-bus';
import { auditLog } from '../../core/audit';
import { isEnabled } from '../../core/toggles';
import { isDryRun } from '../../core/dry-run';
import { loadPlaybook } from '../../config/loader';
import { contactBot, noteBot, tagBot, stageBot } from '../../bots';
import { aiClassifierBot } from '../../bots/ai-classifier';
import { memoryWriterBot } from '../../bots/memory-writer';

const AGENT_ID = 'buyer-qualifier';

interface QualificationResult {
  score: number;
  tier: 'qualified' | 'priority' | 'unqualified';
  reasons: string[];
}

export async function runBuyerQualifier(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  try {
    const { contactId, opportunityId, tenantId } = event;
    const start = Date.now();
    const playbook = await loadPlaybook(tenantId);
    const buyerStages = playbook?.crm?.pipelines?.buyer?.stages;

    const contact = await contactBot(contactId).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'contactBot:failed', result: 'error', reason: err?.message });
      return null;
    });
    const cf = (contact as any)?.customFields ?? {};
    const tags: string[] = (contact as any)?.tags ?? [];
    const firstName = (contact as any)?.firstName ?? 'Buyer';

    const proofOfFunds = cf.proof_of_funds || tags.includes('pof-on-file');
    const pastPurchases = parseInt(cf.past_purchases ?? '0') || 0;
    const showingsAttended = parseInt(cf.showings_attended ?? '0') || 0;
    const offersSubmitted = parseInt(cf.offers_submitted ?? '0') || 0;
    const responsiveness = cf.responsiveness ?? 'unknown'; // high, medium, low

    const result = await aiClassifierBot.classifyJSON<QualificationResult>(
      `Score this buyer for qualification.
Name: ${firstName}
Proof of Funds: ${proofOfFunds ? 'Yes' : 'No'}
Past Purchases: ${pastPurchases}
Showings Attended: ${showingsAttended}
Offers Submitted: ${offersSubmitted}
Responsiveness: ${responsiveness}
Tags: ${tags.join(', ')}

Scoring rules:
- POF on file: +25
- Past purchases: +15 per purchase (max +45)
- Showings attended: +5 each (max +20)
- Offers submitted: +10 each (max +30)
- High responsiveness: +10, Medium: +5

Tiers: priority (80+), qualified (50-79), unqualified (<50)
Return JSON: {score, tier, reasons: string[]}`,
      'You are a real estate buyer qualification engine. Return only valid JSON.'
    ).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'aiClassifierBot:failed', result: 'error', reason: err?.message });
      return null;
    });

    if (!result) return;

    if (!isDryRun()) {
      // Tag with qualification tier
      await tagBot(contactId, [`buyer-${result.tier}`]).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'tagBot:failed', result: 'error', reason: err?.message });
      });

      // Move to appropriate stage
      const buyerOppId = opportunityId ?? (event.metadata as any)?.buyerOpportunityId;
      if (buyerOppId && buyerStages) {
        const targetStage = result.tier === 'priority' ? buyerStages.priority_buyer
          : result.tier === 'qualified' ? buyerStages.qualified_buyer
          : buyerStages.unqualified_buyer;
        if (targetStage) {
          await stageBot(buyerOppId, targetStage).catch(err => {
            auditLog({ agent: AGENT_ID, contactId, action: 'stageBot:failed', result: 'error', reason: err?.message });
          });
        }
      }

      await noteBot(contactId, [
        `📊 Buyer Qualification Score`,
        `Score: ${result.score}/100 — ${result.tier.toUpperCase()}`,
        `---`,
        ...result.reasons.map(r => `• ${r}`),
      ].join('\n')).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'noteBot:failed', result: 'error', reason: err?.message });
      });
    }

    await memoryWriterBot.recordAction('buyer-qualification', { contactId, buyerName: firstName }, { score: result.score, tier: result.tier, reasons: result.reasons }, tenantId).catch(err => {
      console.error(`[${AGENT_ID}] memoryWriterBot:failed`, (err as Error).message);
    });

    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: `buyer.qualified.${result.tier}`,
      result: 'success',
      metadata: { score: result.score, tier: result.tier },
      durationMs: Date.now() - start,
    });
  } catch (err: any) {
    auditLog({ agent: AGENT_ID, contactId: event.contactId, action: 'agent:crashed', result: 'error', reason: err?.message });
  }
}
