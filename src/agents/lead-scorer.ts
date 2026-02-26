/**
 * Lead Scorer
 *
 * Fires on: lead.new
 * Does: scores HOT/WARM, writes score fields via field-bot, emits lead.scored
 * Does NOT: tag, note, create tasks
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { fieldBot } from '../bots/field';
import { scorerBot } from '../bots/scorer';

const AGENT_ID = 'lead-scorer';

export async function runLeadScorer(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, tenantId, contact } = event;
  const start = Date.now();

  const score = await scorerBot((contact as Record<string, any>) ?? {});

  await fieldBot(contactId, { lead_tier: score.tier, lead_score: score.score });

  await emit({
    kind: 'lead.scored',
    tenantId,
    contactId,
    opportunityId,
    contact,
    score,
    receivedAt: Date.now(),
  });

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: 'lead:scored',
    result: 'success',
    durationMs: Date.now() - start,
    metadata: { tier: score.tier, score: score.score },
  });
}
