/**
 * AI Writer Bot — wraps generateText from Gemini.
 * Agents call this instead of importing from integrations/ai/ directly.
 */

import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { generateText } from '../integrations/ai/gemini';
import { buildLearningContext, getSmsLearnings, getScoringLearnings, getCoachingLearnings, getClassificationLearnings } from '../intelligence/learner';

const BOT_ID = 'bot-ai-writer';

export async function writeText(prompt: string, systemPrompt?: string, learningCategory?: string): Promise<string> {
  if (!isEnabled(BOT_ID)) {
    console.log(`[bot-ai-writer] DISABLED — skipping`);
    return '';
  }
  if (isDryRun()) {
    console.log(`[bot-ai-writer] DRY RUN — returning placeholder`);
    return '[AI placeholder — dry run]';
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

  return generateText(prompt, enrichedSystemPrompt || undefined);
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

export const aiWriterBot = { writeText };
