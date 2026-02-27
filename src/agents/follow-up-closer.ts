/**
 * Follow-Up Closer
 *
 * Fires on: inbound.message from a contact in a follow-up stage
 * Does: detects interest, moves to Warm, creates LM task, writes re-engagement note.
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { stageBot, taskBot, noteBot, tagBot } from '../bots';

const AGENT_ID = 'follow-up-closer';

interface CloserPlaybook {
  warmStageId: string;
  lmTaskDueMinutes: number;
  reEngagementTag: string;
  followUpStageIds: string[];
}

function detectsInterest(messageBody: string): boolean {
  const positive = [
    'interested', 'yes', 'ready', 'sell', 'offer', 'how much',
    'what can you', 'still buying', 'call me', 'let\'s talk',
  ];
  const lower = messageBody.toLowerCase();
  return positive.some((kw) => lower.includes(kw));
}

export async function runFollowUpCloser(event: GunnerEvent, playbook: CloserPlaybook): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, stageId } = event;
  const start = Date.now();

  if (!stageId || !playbook.followUpStageIds.includes(stageId)) return;

  const messageBody = (event.raw?.body as string) || '';

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

  await stageBot(contactId, playbook.warmStageId);

  const dueAt = new Date(Date.now() + playbook.lmTaskDueMinutes * 60 * 1000);
  await taskBot(contactId, {
    title: 'Follow-up lead re-engaged — call NOW',
    body: `Lead responded with interest from follow-up. Message: "${messageBody.slice(0, 200)}"`,
    dueDate: dueAt.toISOString(),
    assignedTo: 'lm',
  });

  await noteBot(contactId, [
    `🔥 RE-ENGAGED from follow-up`,
    `Stage was: ${event.stageName || stageId}`,
    `Message: "${messageBody.slice(0, 300)}"`,
    `Action: Moved to Warm. LM task created (due ${playbook.lmTaskDueMinutes}min).`,
  ].join('\n'));

  await tagBot(contactId, [playbook.reEngagementTag]);

  auditLog({
    agent: AGENT_ID,
    contactId,
    action: 'lead:re-engaged',
    result: 'success',
    durationMs: Date.now() - start,
    metadata: { fromStage: event.stageName, messageSnippet: messageBody.slice(0, 100) },
  });
}
