/**
 * Offer Classifier — stub for AI classification.
 * TODO: wire to Gemini.
 */

export interface ClassificationResult {
  outcome: 'accept' | 'counter' | 'stall' | 'reject' | 'unclear';
  confidence: number;
  counterAmount?: number;
  summary: string;
}

export async function classifyOfferReply(message: string): Promise<ClassificationResult> {
  // Stub — default to unclear until AI wired
  return { outcome: 'unclear', confidence: 0, summary: message.slice(0, 100) };
}
