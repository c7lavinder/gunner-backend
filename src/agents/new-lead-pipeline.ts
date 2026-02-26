/**
 * New Lead Pipeline Agent
 *
 * Fires when: opportunity enters New Lead stage
 * Does: scores the lead, writes score/tags/fields/task/note
 * Does NOT: move stages (that's stage-change-router's job)
 * Does NOT: send SMS (that's initial-outreach agent's job)
 *
 * Order:
 *   1. Fetch contact data
 *   2. Score lead (HOT/WARM)
 *   3. Write tier tag
 *   4. Write tier + score to custom fields
 *   5. Write score breakdown note
 *   6. Create call task for LM
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { getConfig } from '../playbook/config';
import { ghlGet } from '../integrations/ghl/client';
import { tagBot } from '../bots/tag';
import { fieldBot } from '../bots/field';
import { noteBot } from '../bots/note';
import { taskBot } from '../bots/task';
import { scoreLead, LeadScore } from '../intelligence/lead-scorer';

const AGENT_ID = 'new-lead-pipeline';

export async function runNewLeadPipeline(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, tenantId } = event;
  const config = getConfig();
  const start = Date.now();

  // 1. Fetch contact
  const contact = await ghlGet<any>(`/contacts/${contactId}`);
  const c = contact?.contact ?? contact;

  // 2. Score lead
  const score: LeadScore = await scoreLead(c);

  // 3. Tag with tier
  await tagBot(contactId, [`lead-tier:${score.tier.toLowerCase()}`]);

  // 4. Write fields
  await fieldBot(contactId, {
    lead_tier: score.tier,
    lead_score: score.score,
  });

  // 5. Write score note
  const noteLines = [
    `📊 Lead IQ Score: ${score.score}/100 — ${score.tier}`,
    '',
    ...score.factors.map((f) => `${f.passed ? '✅' : '❌'} ${f.name}: ${f.reason}`),
  ];
  await noteBot(contactId, noteLines.join('\n'));

  // 6. Create call task
  const dueDate = new Date(Date.now() + config.sla.initialCallMinutes * 60_000).toISOString();
  const emoji = score.tier === 'HOT' ? '🔴' : '🟡';
  await taskBot(contactId, {
    title: `${emoji} ${score.tier} LEAD — Call within ${config.sla.initialCallMinutes} min`,
    body: `Lead scored ${score.score}/100. Factors:\n${score.factors.map((f) => `• ${f.name}: ${f.reason}`).join('\n')}`,
    dueDate,
    assignedTo: config.team.defaultLM,
  });

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: 'new-lead:scored',
    result: 'success',
    durationMs: Date.now() - start,
    metadata: { tier: score.tier, score: score.score },
  });
}
