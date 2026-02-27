/**
 * Lead Tagger
 *
 * Fires on: lead.scored
 * Does: adds lead-tier tag to contact via tag-bot
 * Does NOT: anything else
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { tagBot } from '../bots/tag';
import { getTag } from '../config';

const AGENT_ID = 'lead-tagger';

export async function runLeadTagger(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  try {
    const { contactId, opportunityId, tenantId, score } = event;
    if (!score) return;

    const start = Date.now();
    const tag = await getTag(tenantId, score.tier === 'HOT' ? 'hot' : 'warm');
    await tagBot(contactId, [tag]).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'tagBot:failed', result: 'error', reason: err?.message });
    });

    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'lead:tagged',
      result: 'success',
      durationMs: Date.now() - start,
      metadata: { tier: score.tier },
    });
  } catch (err: any) {
    auditLog({ agent: AGENT_ID, contactId: event.contactId, action: 'agent:crashed', result: 'error', reason: err?.message });
  }
}
