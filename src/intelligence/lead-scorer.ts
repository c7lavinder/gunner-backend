/**
 * Lead Scorer — pure logic, no side effects.
 * Takes contact data + a Playbook, returns a score and tier.
 * Called by agents. Never calls GHL directly.
 *
 * Now fully config-driven: scoring factors come from the active Playbook.
 */

import { aiComplete } from '../integrations/ai/client';
import type { Playbook, ScoringFactor } from '../playbook/types';
import { buildDefaultPlaybook } from '../playbook/default';

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

/** Active playbook — defaults to Wholesale RE, swappable at runtime. */
let activePlaybook: Playbook | null = null;

export function setPlaybook(pb: Playbook): void {
  activePlaybook = pb;
}

function getPlaybook(): Playbook {
  if (!activePlaybook) activePlaybook = buildDefaultPlaybook();
  return activePlaybook;
}

// ── Public API ──────────────────────────────────────────────

export async function scoreLead(contact: Record<string, any>): Promise<LeadScore> {
  const playbook = getPlaybook();
  try {
    return await aiScoreLead(contact, playbook);
  } catch {
    return ruleBasedScore(contact, playbook);
  }
}

// ── AI Scorer ───────────────────────────────────────────────

function buildFactorList(factors: ScoringFactor[]): string {
  return factors.map((f) => `- ${f.name}: ${f.prompt}`).join('\n');
}

function buildExampleJson(factors: ScoringFactor[]): string {
  const examples = factors.map((f) => `    { "name": "${f.name}", "passed": true, "reason": "..." }`);
  return `{\n  "factors": [\n${examples.join(',\n')}\n  ]\n}`;
}

async function aiScoreLead(contact: Record<string, any>, playbook: Playbook): Promise<LeadScore> {
  const { factors } = playbook.scoring;

  const prompt = `
You are a lead scorer for the ${playbook.industry} industry. Score this lead.

Contact data:
${JSON.stringify(contact, null, 2)}

Score on these ${factors.length} factors:
${buildFactorList(factors)}

Each factor is either passed (true) or failed (false) with a short reason.

Respond ONLY with valid JSON in this exact format:
${buildExampleJson(factors)}`;

  const raw = await aiComplete(prompt);
  const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
  const scored: ScoreFactor[] = parsed.factors;
  return buildScore(scored);
}

// ── Rule-Based Fallback ─────────────────────────────────────

function ruleBasedScore(contact: Record<string, any>, playbook: Playbook): LeadScore {
  const notes = (contact.notes ?? '').toLowerCase();
  const { factors } = playbook.scoring;

  const scored: ScoreFactor[] = factors.map((f) => {
    if (!f.fallbackKeywords || f.fallbackKeywords.length === 0) {
      return { name: f.name, passed: true, reason: 'Default pass — evaluated on call' };
    }
    const hit = f.fallbackKeywords.some((kw) => notes.includes(kw));
    return {
      name: f.name,
      passed: hit,
      reason: hit ? 'Matched keyword in notes' : 'No matching keywords found',
    };
  });

  return buildScore(scored);
}

// ── Shared ──────────────────────────────────────────────────

function buildScore(factors: ScoreFactor[]): LeadScore {
  const passed = factors.filter((f) => f.passed).length;
  const score = Math.round((passed / factors.length) * 100);
  const tier = passed >= Math.ceil(factors.length / 2) ? 'HOT' : 'WARM';
  return { tier, score, factors };
}
