/**
 * AI Classifier Bot — wraps generateJSON from Gemini.
 * Agents call this instead of importing from integrations/ai/ directly.
 */

import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { generateJSON } from '../integrations/ai/gemini';
import { buildLearningContext, getSmsLearnings, getScoringLearnings, getCoachingLearnings, getClassificationLearnings } from '../intelligence/learner';

const BOT_ID = 'bot-ai-classifier';

export async function classifyJSON<T>(prompt: string, systemPrompt?: string, learningCategory?: string): Promise<T | null> {
  if (!isEnabled(BOT_ID)) {
    console.log(`[bot-ai-classifier] DISABLED — skipping`);
    return null;
  }
  if (isDryRun()) {
    console.log(`[bot-ai-classifier] DRY RUN — returning null`);
    return null;
  }

  // Inject learnings into system prompt if category provided
  let enrichedSystemPrompt = systemPrompt ?? '';
  if (learningCategory) {
    const learnings = await resolveLearnings(learningCategory);
    if (learnings) {
      enrichedSystemPrompt = enrichedSystemPrompt
        ? `${enrichedSystemPrompt}\n\n${learnings}`
        : learnings;
    }
  }

  return generateJSON<T>(prompt, enrichedSystemPrompt || undefined);
}

async function resolveLearnings(category: string): Promise<string> {
  switch (category) {
    case 'sms-performance': return getSmsLearnings('');
    case 'scoring-accuracy': return getScoringLearnings('');
    case 'coaching-patterns': return getCoachingLearnings('');
    case 'classification-corrections': return getClassificationLearnings('');
    default: return buildLearningContext(category);
  }
}

export const aiClassifierBot = { classifyJSON };
