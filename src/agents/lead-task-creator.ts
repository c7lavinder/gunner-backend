/**
 * Lead Task Creator
 *
 * Fires on: lead.scored
 * Does: creates the initial call task for the LM via task-bot
 * Does NOT: anything else
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { taskBot } from '../bots/task';
import { getConfig } from '../playbook/config';

const AGENT_ID = 'lead-task-creator';

export async function runLeadTaskCreator(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, score } = event;
  if (!score) return;

  const start = Date.now();
  const config = getConfig();

  const emoji = score.tier === 'HOT' ? '🔴' : '🟡';
  const dueDate = new Date(Date.now() + config.sla.initialCallMinutes * 60_000).toISOString();

  await taskBot(contactId, {
    title: `${emoji} ${score.tier} LEAD — Call within ${config.sla.initialCallMinutes} min`,
    body: score.factors.map((f) => `• ${f.name}: ${f.reason}`).join('\n'),
    dueDate,
    assignedTo: config.team.defaultLM,
  });

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: 'lead:task-created',
    result: 'success',
    durationMs: Date.now() - start,
    metadata: { tier: score.tier },
  });
}
