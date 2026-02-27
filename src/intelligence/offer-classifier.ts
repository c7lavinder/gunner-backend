/**
 * Offer Classifier — AI-powered via Gemini.
 * Classifies seller responses to real estate offers.
 */

import { generateJSON } from '../integrations/ai/gemini';
import { isDryRun } from '../core/dry-run';

export interface ClassificationResult {
  outcome: 'accept' | 'counter' | 'stall' | 'reject' | 'unclear';
  confidence: number;
  counterAmount?: number;
  summary: string;
}

const SYSTEM_PROMPT = `You classify seller responses to real estate offers. Return JSON only, no other text: {"outcome": "accept"|"counter"|"stall"|"reject"|"unclear", "confidence": 0-100, "counterAmount": number or omit, "summary": "brief one-line summary"}`;

const FALLBACK: ClassificationResult = { outcome: 'unclear', confidence: 0, summary: '' };

export async function classifyOfferReply(message: string): Promise<ClassificationResult> {
  if (isDryRun()) {
    return { ...FALLBACK, summary: message.slice(0, 100) };
  }

  try {
    const result = await generateJSON<ClassificationResult>(
      `Classify this seller reply:\n\n"${message}"`,
      SYSTEM_PROMPT,
    );
    return result;
  } catch (err) {
    console.error(`[offer-classifier] Gemini failed, returning fallback:`, (err as Error).message);
    return { ...FALLBACK, summary: message.slice(0, 100) };
  }
}
