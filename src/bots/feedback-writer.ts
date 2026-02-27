/**
 * Feedback Writer Bot — ONE job: record human feedback on actions.
 * Toggle: bot-feedback-writer
 */

import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import * as memory from '../intelligence/memory';

const BOT_ID = 'bot-feedback-writer';

export async function recordFeedback(
  actionId: string,
  feedback: string,
  score?: number,
): Promise<void> {
  if (!isEnabled(BOT_ID)) return;
  if (isDryRun()) {
    console.log(`[${BOT_ID}] DRY RUN — would record feedback for ${actionId}`);
    return;
  }
  await memory.recordFeedback(actionId, feedback, score);
}

export const feedbackWriterBot = { recordFeedback };
