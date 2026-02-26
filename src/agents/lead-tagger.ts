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

const AGENT_ID = 'lead-tagger';

export async function runLeadTagger(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, score } = event;
  if (!score) return;

  const start = Date.now();

  await tagBot(contactId, [`lead-tier:${score.tier.toLowerCase()}`]);

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: 'lead:tagged',
    result: 'success',
    durationMs: Date.now() - start,
    metadata: { tier: score.tier },
  });
}
