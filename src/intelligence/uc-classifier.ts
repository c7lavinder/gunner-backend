/**
 * UC Message Classifier — AI-powered via Gemini.
 * Classifies messages from sellers who are under contract.
 */

import { generateText } from '../integrations/ai/gemini';
import { isDryRun } from '../core/dry-run';

export type MessageCategory = 'checkin' | 'closing_question' | 'concern' | 'other';

const SYSTEM_PROMPT = `You classify messages from sellers who are under contract in a real estate transaction. Return exactly one word — no punctuation, no explanation: checkin, closing_question, concern, or other`;

const VALID: Set<string> = new Set(['checkin', 'closing_question', 'concern', 'other']);

export async function classifyUCMessage(body: string): Promise<MessageCategory> {
  if (isDryRun()) return 'other';

  try {
    const raw = await generateText(`Classify this message:\n\n"${body}"`, SYSTEM_PROMPT);
    const word = raw.trim().toLowerCase().replace(/[^a-z_]/g, '');
    return VALID.has(word) ? (word as MessageCategory) : 'other';
  } catch (err) {
    console.error(`[uc-classifier] Gemini failed, returning fallback:`, (err as Error).message);
    return 'other';
  }
}
