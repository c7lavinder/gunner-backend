/**
 * AI Classifier Bot — wraps generateJSON from Gemini.
 * Agents call this instead of importing from integrations/ai/ directly.
 */

import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { generateJSON } from '../integrations/ai/gemini';

const BOT_ID = 'bot-ai-classifier';

export async function classifyJSON<T>(prompt: string, systemPrompt?: string): Promise<T | null> {
  if (!isEnabled(BOT_ID)) {
    console.log(`[bot-ai-classifier] DISABLED — skipping`);
    return null;
  }
  if (isDryRun()) {
    console.log(`[bot-ai-classifier] DRY RUN — returning null`);
    return null;
  }
  return generateJSON<T>(prompt, systemPrompt);
}

export const aiClassifierBot = { classifyJSON };
