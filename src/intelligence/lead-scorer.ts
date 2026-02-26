/**
 * Lead Scorer — pure logic, no side effects.
 * Takes contact data, returns a score and tier.
 * Called by agents. Never calls GHL directly.
 */

import { aiComplete } from '../integrations/ai/client';

export interface ScoreFactor {
  name: string;
  passed: boolean;
  reason: string;
}

export interface LeadScore {
  tier: 'HOT' | 'WARM';
  score: number;
  factors: ScoreFactor[];
}

const FACTORS = ['Timeline', 'Motivation', 'Condition', 'Price', 'Source'];

export async function scoreLead(contact: Record<string, any>): Promise<LeadScore> {
  try {
    return await aiScoreLead(contact);
  } catch {
    return ruleBasedScore(contact);
  }
}

async function aiScoreLead(contact: Record<string, any>): Promise<LeadScore> {
  const prompt = `
You are a wholesale real estate lead scorer. Score this seller lead.

Contact data:
${JSON.stringify(contact, null, 2)}

Score on these 5 factors: Timeline, Motivation, Condition, Price, Source.
Each factor is either passed (true) or failed (false) with a short reason.

Respond ONLY with valid JSON in this exact format:
{
  "factors": [
    { "name": "Timeline", "passed": true, "reason": "Needs to sell within 60 days" },
    { "name": "Motivation", "passed": false, "reason": "No clear distress signal" },
    { "name": "Condition", "passed": true, "reason": "Mentioned major repairs needed" },
    { "name": "Price", "passed": true, "reason": "Below market ask likely" },
    { "name": "Source", "passed": true, "reason": "PPL source — pre-qualified intent" }
  ]
}`;

  const raw = await aiComplete(prompt);
  const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
  const factors: ScoreFactor[] = parsed.factors;
  return buildScore(factors);
}

function ruleBasedScore(contact: Record<string, any>): LeadScore {
  const fields = contact.customFields ?? {};
  const notes = (contact.notes ?? '').toLowerCase();

  const factors: ScoreFactor[] = [
    {
      name: 'Timeline',
      passed: notes.includes('asap') || notes.includes('urgent') || notes.includes('90 day') || notes.includes('60 day'),
      reason: 'Based on notes keyword scan',
    },
    {
      name: 'Motivation',
      passed: notes.includes('divorce') || notes.includes('foreclosure') || notes.includes('inherit') || notes.includes('behind'),
      reason: 'Based on distress keyword scan',
    },
    {
      name: 'Condition',
      passed: notes.includes('repair') || notes.includes('fix') || notes.includes('damage') || notes.includes('update'),
      reason: 'Based on condition keyword scan',
    },
    {
      name: 'Price',
      passed: true,
      reason: 'Default pass — price negotiated on call',
    },
    {
      name: 'Source',
      passed: true,
      reason: 'Inbound lead — assumed intent',
    },
  ];

  return buildScore(factors);
}

function buildScore(factors: ScoreFactor[]): LeadScore {
  const passed = factors.filter((f) => f.passed).length;
  const score = Math.round((passed / factors.length) * 100);
  const tier = passed >= 3 ? 'HOT' : 'WARM';
  return { tier, score, factors };
}
