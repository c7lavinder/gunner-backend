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
import { loadPlaybook } from '../config/loader';

const AGENT_ID = 'lead-scorer';

export async function runLeadScorer(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  try {
    const { contactId, opportunityId, tenantId, contact } = event;
    const start = Date.now();
    const playbook = await loadPlaybook(tenantId);

    const score = await scorerBot((contact as Record<string, any>) ?? {}).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'scorerBot:failed', result: 'error', reason: err?.message });
      return { tier: 'WARM' as const, score: 0, factors: [] };
    });

    const cf = playbook.customFields;
    await fieldBot(contactId, {
      [cf.lead_tier]: score.tier,
      [cf.lead_score]: score.score,
    }).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'fieldBot:failed', result: 'error', reason: err?.message });
    });

    await emit({
      kind: 'lead.scored',
      tenantId,
      contactId,
      opportunityId,
      contact,
      score,
      receivedAt: Date.now(),
    }).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'emit:lead.scored:failed', result: 'error', reason: err?.message });
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
  } catch (err: any) {
    auditLog({ agent: AGENT_ID, contactId: event.contactId, action: 'agent:crashed', result: 'error', reason: err?.message });
  }
}
