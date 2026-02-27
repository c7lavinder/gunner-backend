/**
 * AI Classifier Bot — wraps generateJSON from Gemini.
 * Agents call this instead of importing from integrations/ai/ directly.
 */

import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { generateJSON } from '../integrations/ai/gemini';
import { getLearnings } from './learning-builder';

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
    const learnings = await getLearnings(learningCategory);
    if (learnings) {
      enrichedSystemPrompt = enrichedSystemPrompt
        ? `${enrichedSystemPrompt}\n\n${learnings}`
        : learnings;
    }
  }

  return generateJSON<T>(prompt, enrichedSystemPrompt || undefined);
}

export const aiClassifierBot = { classifyJSON };
