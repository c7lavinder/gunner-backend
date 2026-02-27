/**
 * Scorer Bot — runs lead scoring intelligence.
 * Agents call this. Agents never call AI directly.
 */

import { isEnabled } from '../core/toggles';
import { scoreLead, LeadScore } from '../intelligence/lead-scorer';

const BOT_ID = 'bot-scorer';

export async function scorerBot(contact: Record<string, any>): Promise<LeadScore> {
  if (!isEnabled(BOT_ID)) {
    console.log(`[bot-scorer] DISABLED — skipping`);
    return { tier: 'WARM', score: 0, factors: [] };
  }
  return scoreLead(contact);
}
