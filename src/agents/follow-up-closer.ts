/**
 * Follow-Up Closer
 *
 * Fires on: inbound.message from a contact in a follow-up stage
 * Does: detects interest, moves to Warm, creates LM task, writes re-engagement note.
 * Agents used: stageBot, taskBot, noteBot
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { stageBot, taskBot, noteBot, tagBot } from '../bots';

const AGENT_ID = 'follow-up-closer';

interface CloserPlaybook {
  warmStageId: string;
  lmTaskDueMinutes: number; // 30
  reEngagementTag: string;
  followUpStageIds: string[]; // stages this agent monitors
}

/**
 * Simple interest detection — replace with AI classification later.
 */
function detectsInterest(messageBody: string): boolean {
  const positive = [
    'interested', 'yes', 'ready', 'sell', 'offer', 'how much',
    'what can you', 'still buying', 'call me', 'let\'s talk',
  ];
  const lower = messageBody.toLowerCase();
  return positive.some((kw) => lower.includes(kw));
}

export async function runFollowUpCloser(
  event: GunnerEvent,
  playbook: CloserPlaybook
): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, stageId } = event;
  const start = Date.now();

  // Guard: only act on contacts in follow-up stages
  if (!stageId || !playbook.followUpStageIds.includes(stageId)) {
    return;
  }

  const messageBody = (event.raw?.body as string) || '';

  // Guard: no interest detected → skip
  if (!detectsInterest(messageBody)) {
    auditLog({
      agent: AGENT_ID,
      contactId,
      action: 'interest:none',
      result: 'skipped',
      reason: 'No interest keywords detected',
    });
    return;
  }

  // Guard: check if already moved to warm (idempotency)
  // stageBot returns current stage; skip if already warm
  // (In practice, the stage check above already filters this — belt-and-suspenders)

  // 1. Move to Warm stage
  await stageBot(contactId, playbook.warmStageId);

  // 2. Create LM task due in 30 minutes
  const dueAt = new Date(Date.now() + playbook.lmTaskDueMinutes * 60 * 1000);
  await taskBot(contactId, {
    title: 'Follow-up lead re-engaged — call NOW',
    description: `Lead responded with interest from follow-up. Message: "${messageBody.slice(0, 200)}"`,
    dueDate: dueAt.toISOString(),
    assignedTo: 'lm', // Lead Manager
  });

  // 3. Write re-engagement note
  await noteBot(contactId, [
    `🔥 RE-ENGAGED from follow-up`,
    `Stage was: ${event.stageName || stageId}`,
    `Message: "${messageBody.slice(0, 300)}"`,
    `Action: Moved to Warm. LM task created (due ${playbook.lmTaskDueMinutes}min).`,
  ].join('\n'));

  // 4. Tag for tracking
  await tagBot(contactId, playbook.reEngagementTag);

  auditLog({
    agent: AGENT_ID,
    contactId,
    action: 'lead:re-engaged',
    result: 'success',
    durationMs: Date.now() - start,
    metadata: { fromStage: event.stageName, messageSnippet: messageBody.slice(0, 100) },
  });
}
