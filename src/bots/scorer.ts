/**
 * Scorer Bot — runs lead scoring intelligence.
 * Agents call this. Agents never call AI directly.
 */

import { scoreLead, LeadScore } from '../intelligence/lead-scorer';

export async function scorerBot(contact: Record<string, any>): Promise<LeadScore> {
  return scoreLead(contact);
}
