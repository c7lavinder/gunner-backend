/**
 * Lead Noter
 *
 * Fires on: lead.scored
 * Does: writes score breakdown note to contact via note-bot
 * Does NOT: anything else
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { noteBot } from '../bots/note';

const AGENT_ID = 'lead-noter';

export async function runLeadNoter(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, score } = event;
  if (!score) return;

  const start = Date.now();

  const lines = [
    `📊 Lead Score: ${score.score}/100 — ${score.tier}`,
    '',
    ...score.factors.map((f) => `${f.passed ? '✅' : '❌'} ${f.name}: ${f.reason}`),
  ];

  await noteBot(contactId, lines.join('\n'));

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: 'lead:noted',
    result: 'success',
    durationMs: Date.now() - start,
  });
}
