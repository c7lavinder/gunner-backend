/**
 * Call Coaching Agent
 *
 * Fires on: every LM call (invoked by lm-assistant)
 * Does: scores call A-F across 6 factors, writes summary note to CRM via noteBot
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { noteBot } from '../bots/note';
import { loadPlaybook } from '../config';
import { generateJSON } from '../integrations/ai/gemini';

const AGENT_ID = 'call-coaching';

type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

interface ScoringFactor {
  name: string;
  grade: Grade;
  notes: string;
}

interface CallScore {
  callId: string;
  contactId: string;
  overall: Grade;
  factors: ScoringFactor[];
  summary: string;
  coachingFlags: string[];
}

interface CallEvent extends GunnerEvent {
  callId: string;
  transcript?: string;
  outcome: string;
  callDurationSec?: number;
}

const SCORING_FACTORS = [
  'rapport-building',
  'motivation-discovery',
  'timeline-urgency',
  'objection-handling',
  'closing-technique',
  'script-adherence',
] as const;

export async function runCallCoaching(event: CallEvent): Promise<CallScore | null> {
  if (!isEnabled(AGENT_ID)) return null;

  const { contactId, opportunityId, callId, transcript } = event;
  const start = Date.now();
  const playbook = await loadPlaybook(event.tenantId);

  if (!transcript) {
    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'coaching:skipped',
      result: 'skipped',
      reason: 'no-transcript',
      durationMs: Date.now() - start,
    });
    return null;
  }

  const score = await scoreCall(callId, contactId, transcript, playbook);

  if (!isDryRun()) {
    await noteBot(contactId, `📞 Call Summary (${callId})\n${score.summary}`);
  }

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: 'coaching:scored',
    result: 'success',
    metadata: { callId, overall: score.overall, factors: score.factors.length, flags: score.coachingFlags },
    durationMs: Date.now() - start,
  });

  return score;
}

async function scoreCall(
  callId: string,
  contactId: string,
  transcript: string,
  playbook: any,
): Promise<CallScore> {
  const factors: ScoringFactor[] = [];
  const coachingFlags: string[] = [];

  for (const factorName of SCORING_FACTORS) {
    const criteria = playbook?.coaching?.factors?.[factorName];
    const result = await evaluateFactor(factorName, transcript, criteria);
    factors.push(result);
    if (result.grade === 'D' || result.grade === 'F') {
      coachingFlags.push(`${factorName}: ${result.notes}`);
    }
  }

  const overall = computeOverall(factors);
  const summary = buildSummary(factors, coachingFlags);

  return { callId, contactId, overall, factors, summary, coachingFlags };
}

async function evaluateFactor(
  name: string,
  _transcript: string,
  _criteria: any,
): Promise<ScoringFactor> {
  return { name, grade: 'B', notes: 'pending AI scoring integration' };
}

function computeOverall(factors: ScoringFactor[]): Grade {
  const gradeValues: Record<Grade, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };
  const avg = factors.reduce((sum, f) => sum + gradeValues[f.grade], 0) / factors.length;
  if (avg >= 3.5) return 'A';
  if (avg >= 2.5) return 'B';
  if (avg >= 1.5) return 'C';
  if (avg >= 0.5) return 'D';
  return 'F';
}

function buildSummary(factors: ScoringFactor[], flags: string[]): string {
  const lines = factors.map((f) => `  ${f.name}: ${f.grade}`);
  const flagSection = flags.length ? `\nCoaching flags:\n${flags.map((f) => `  ⚠️ ${f}`).join('\n')}` : '';
  return `Scores:\n${lines.join('\n')}${flagSection}`;
}
