/**
 * AI Writer Bot — wraps generateText from Gemini.
 * Agents call this instead of importing from integrations/ai/ directly.
 */

import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { generateText } from '../integrations/ai/gemini';

const BOT_ID = 'bot-ai-writer';

export async function writeText(prompt: string, systemPrompt?: string): Promise<string> {
  if (!isEnabled(BOT_ID)) {
    console.log(`[bot-ai-writer] DISABLED — skipping`);
    return '';
  }
  if (isDryRun()) {
    console.log(`[bot-ai-writer] DRY RUN — returning placeholder`);
    return '[AI placeholder — dry run]';
  }
  return generateText(prompt, systemPrompt);
}

export const aiWriterBot = { writeText };
