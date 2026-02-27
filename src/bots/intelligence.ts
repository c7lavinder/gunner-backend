/**
 * Intelligence Bot — the interface agents use to interact with the intelligence layer.
 * Toggle: bot-intelligence
 */

import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import * as memory from '../intelligence/memory';
import { buildLearningContext, getSmsLearnings, getScoringLearnings, getCoachingLearnings, getClassificationLearnings } from '../intelligence/learner';
import { generateBriefing } from '../intelligence/researcher';

const BOT_ID = 'bot-intelligence';

export async function recordAction(
  category: string,
  input: Record<string, any>,
  output: Record<string, any>,
  tenantId?: string,
): Promise<string> {
  if (!isEnabled(BOT_ID)) return '';
  if (isDryRun()) {
    console.log(`[bot-intelligence] DRY RUN — would record ${category} action`);
    return 'dry-run';
  }
  return memory.recordAction(category, input, output, tenantId);
}

export async function getLearnings(category: string, tenantId?: string): Promise<string> {
  if (!isEnabled(BOT_ID)) return '';
  switch (category) {
    case 'sms-performance':
      return getSmsLearnings(tenantId ?? '');
    case 'scoring-accuracy':
      return getScoringLearnings(tenantId ?? '');
    case 'coaching-patterns':
      return getCoachingLearnings(tenantId ?? '');
    case 'classification-corrections':
      return getClassificationLearnings(tenantId ?? '');
    default:
      return buildLearningContext(category);
  }
}

export async function recordFeedback(
  actionId: string,
  feedback: string,
  score?: number,
): Promise<void> {
  if (!isEnabled(BOT_ID)) return;
  if (isDryRun()) {
    console.log(`[bot-intelligence] DRY RUN — would record feedback for ${actionId}`);
    return;
  }
  await memory.recordFeedback(actionId, feedback, score);
}

export async function recordOutcome(
  actionId: string,
  outcome: Record<string, any>,
  score?: number,
): Promise<void> {
  if (!isEnabled(BOT_ID)) return;
  if (isDryRun()) {
    console.log(`[bot-intelligence] DRY RUN — would record outcome for ${actionId}`);
    return;
  }
  await memory.recordOutcome(actionId, outcome, score);
}

export async function getBriefing(tenantId: string): Promise<string> {
  if (!isEnabled(BOT_ID)) return 'Intelligence bot is disabled.';
  return generateBriefing(tenantId);
}

export const intelligenceBot = {
  recordAction,
  getLearnings,
  recordFeedback,
  recordOutcome,
  getBriefing,
};
