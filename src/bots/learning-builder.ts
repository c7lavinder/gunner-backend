/**
 * Learning Builder Bot — ONE job: build learning context strings for AI prompts.
 * Toggle: bot-learning-builder
 */

import { isEnabled } from '../core/toggles';
import {
  buildLearningContext,
  getSmsLearnings,
  getScoringLearnings,
  getCoachingLearnings,
  getClassificationLearnings,
} from '../intelligence/learner';

const BOT_ID = 'bot-learning-builder';

export async function buildContext(category: string, limit = 5): Promise<string> {
  if (!isEnabled(BOT_ID)) return '';
  return buildLearningContext(category, limit);
}

export async function getSmsContext(tenantId: string): Promise<string> {
  if (!isEnabled(BOT_ID)) return '';
  return getSmsLearnings(tenantId);
}

export async function getScoringContext(tenantId: string): Promise<string> {
  if (!isEnabled(BOT_ID)) return '';
  return getScoringLearnings(tenantId);
}

export async function getCoachingContext(tenantId: string): Promise<string> {
  if (!isEnabled(BOT_ID)) return '';
  return getCoachingLearnings(tenantId);
}

export async function getClassificationContext(tenantId: string): Promise<string> {
  if (!isEnabled(BOT_ID)) return '';
  return getClassificationLearnings(tenantId);
}

/**
 * Convenience: get learnings by well-known category name (matches old intelligenceBot.getLearnings).
 */
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

export const learningBuilderBot = {
  buildContext,
  getLearnings,
  getSmsContext,
  getScoringContext,
  getCoachingContext,
  getClassificationContext,
};
