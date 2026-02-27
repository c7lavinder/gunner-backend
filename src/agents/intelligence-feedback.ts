/**
 * Intelligence Feedback Agent — receives human feedback from the API, routes to bot-feedback-writer.
 * Toggle: intelligence-feedback
 *
 * NO logic here — only calls bots.
 */

import { isEnabled } from '../core/toggles';
import { auditLog } from '../core/audit';
import { feedbackWriterBot } from '../bots/feedback-writer';

const AGENT_ID = 'intelligence-feedback';

export async function runIntelligenceFeedback(actionId: string, feedback: string, score?: number): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const start = Date.now();

  await feedbackWriterBot.recordFeedback(actionId, feedback, score).catch((err) => {
    console.error(`[${AGENT_ID}] recordFeedback failed:`, (err as Error).message);
  });

  auditLog({
    agent: AGENT_ID,
    contactId: '',
    action: 'intelligence:feedback-recorded',
    result: 'success',
    reason: `actionId=${actionId} score=${score ?? 'none'}`,
    durationMs: Date.now() - start,
  });
}
