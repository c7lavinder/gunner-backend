/**
 * UC Message Classifier — stub for AI classification.
 * TODO: wire to Gemini.
 */

export type MessageCategory = 'checkin' | 'closing_question' | 'concern' | 'other';

export async function classifyUCMessage(body: string): Promise<MessageCategory> {
  // Stub — default to other until AI wired
  return 'other';
}
