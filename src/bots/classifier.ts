/**
 * Classifier Bot — consolidates ALL classification/detection logic.
 * Agents call this bot instead of embedding business rules.
 * Toggle: bot-classifier
 */

import { isEnabled } from '../core/toggles';
import { GunnerEvent } from '../core/event-bus';
import { aiClassifierBot } from './ai-classifier';

const BOT_ID = 'bot-classifier';

// ─── Types ───
export type MessageClassification = 'real-engagement' | 'push-off' | 'dnc' | 'unknown';
export type SoldClassification = 'under-contract' | 'fully-sold' | 'unclear';
export type CallDisposition = 'conversation' | 'voicemail' | 'missed' | 'short-call' | 'appointment';
export type AMOutcome = 'no-show' | 'accepted' | 'pending' | 'rejected';
export type Bucket = '1-month' | '4-month' | '1-year';
export type Tone = 'check-in' | 'time-sensitive' | 'empathetic' | 'rekindle' | 'final-touch';

type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface ScoringFactor {
  name: string;
  grade: Grade;
  notes: string;
}

export interface CallScore {
  callId: string;
  contactId: string;
  overall: Grade;
  factors: ScoringFactor[];
  summary: string;
  coachingFlags: string[];
}

const SCORING_FACTORS = [
  'rapport-building',
  'motivation-discovery',
  'timeline-urgency',
  'objection-handling',
  'closing-technique',
  'script-adherence',
] as const;

// ─── Classification Functions ───

export function classifyMessage(message: string, playbook: any): MessageClassification {
  if (!isEnabled(BOT_ID)) return 'unknown';

  const lower = message.toLowerCase().trim();

  const dncKeywords = playbook?.sms?.dncKeywords ?? ['stop', 'unsubscribe', 'remove me', 'do not contact', 'dnc'];
  if (dncKeywords.some((kw: string) => lower.includes(kw))) return 'dnc';

  const pushOffPatterns = playbook?.sms?.pushOffPatterns ?? ['not interested', 'no thanks', 'not right now', 'maybe later'];
  if (pushOffPatterns.some((p: string) => lower.includes(p))) return 'push-off';

  if (lower.length > 10 && (lower.includes('?') || lower.split(' ').length > 3)) {
    return 'real-engagement';
  }

  return 'unknown';
}

export function classifySoldType(transcript: string, playbook: any): SoldClassification {
  if (!isEnabled(BOT_ID)) return 'unclear';

  const lower = transcript.toLowerCase();
  const ucIndicators = playbook?.sold?.ucIndicators ?? [
    'under contract', 'pending', 'in escrow', 'not closed yet',
  ];
  const soldIndicators = playbook?.sold?.soldIndicators ?? [
    'fully sold', 'already closed', 'sold it', 'closed last',
  ];

  const hasUc = ucIndicators.some((p: string) => lower.includes(p));
  const hasSold = soldIndicators.some((p: string) => lower.includes(p));

  if (hasUc && !hasSold) return 'under-contract';
  if (hasSold && !hasUc) return 'fully-sold';
  return 'unclear';
}

export function classifyDisposition(event: GunnerEvent, thresholdSec: number): CallDisposition {
  if (!isEnabled(BOT_ID)) return 'missed';

  const duration = (event.raw?.duration as number) || 0;
  const notes = ((event.raw?.notes as string) || '').toLowerCase();
  const disposition = ((event.raw?.disposition as string) || '').toLowerCase();

  if (
    notes.includes('appointment') ||
    notes.includes('walkthrough') ||
    notes.includes('scheduled') ||
    disposition.includes('appointment')
  ) return 'appointment';

  if (duration < thresholdSec) return 'short-call';
  return 'conversation';
}

export function classifyOutcome(event: GunnerEvent): AMOutcome {
  if (!isEnabled(BOT_ID)) return 'pending';

  const duration = (event.raw?.duration as number) || 0;
  const disposition = ((event.raw?.disposition as string) || '').toLowerCase();
  const notes = ((event.raw?.notes as string) || '').toLowerCase();

  if (duration < 30 || disposition.includes('no-show') || disposition.includes('no answer')) return 'no-show';
  if (disposition.includes('accepted') || notes.includes('accepted') || notes.includes('signed')) return 'accepted';
  if (disposition.includes('rejected') || notes.includes('not interested') || notes.includes('declined')) return 'rejected';
  return 'pending';
}

export function detectInterest(messageBody: string): boolean {
  if (!isEnabled(BOT_ID)) return false;

  const positive = [
    'interested', 'yes', 'ready', 'sell', 'offer', 'how much',
    'what can you', 'still buying', 'call me', 'let\'s talk',
  ];
  const lower = messageBody.toLowerCase();
  return positive.some((kw) => lower.includes(kw));
}

export function determineBucket(text: string, playbook: any): Bucket {
  if (!isEnabled(BOT_ID)) return '4-month';

  const lower = text.toLowerCase();

  const shortTermPatterns = playbook?.buckets?.shortTerm ?? [
    'few weeks', 'next month', 'couple weeks', 'soon', 'thinking about it',
    'after the holidays', 'end of the month',
  ];
  if (shortTermPatterns.some((p: string) => lower.includes(p))) return '1-month';

  const midTermPatterns = playbook?.buckets?.midTerm ?? [
    'few months', 'spring', 'summer', 'fall', 'winter', 'next quarter',
    'after tax season', 'not sure when',
  ];
  if (midTermPatterns.some((p: string) => lower.includes(p))) return '4-month';

  return '4-month';
}

export function selectTone(bucketName: string, touchNumber: number, daysSinceLastTouch: number): Tone {
  if (!isEnabled(BOT_ID)) return 'check-in';

  if (bucketName.includes('1-year') && touchNumber >= 3) return 'final-touch';
  if (daysSinceLastTouch > 90) return 'rekindle';
  if (touchNumber === 1) return 'check-in';
  if (touchNumber === 2) return 'empathetic';
  return 'time-sensitive';
}

export function checkAskedUcQuestion(transcript: string, playbook: any): boolean {
  if (!isEnabled(BOT_ID)) return false;

  const ucPatterns = playbook?.coaching?.ucPatterns ?? [
    'under contract', 'fully sold', 'closed on it', 'still under contract',
  ];
  const lower = transcript.toLowerCase();
  return ucPatterns.some((p: string) => lower.includes(p));
}

// ─── Call Coaching (complex AI-based scoring) ───

export async function scoreCall(
  callId: string,
  contactId: string,
  transcript: string,
  playbook: any,
): Promise<CallScore> {
  if (!isEnabled(BOT_ID)) {
    return { callId, contactId, overall: 'B', factors: [], summary: 'Classifier disabled', coachingFlags: [] };
  }

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
  const summary = buildCoachingSummary(factors, coachingFlags);

  return { callId, contactId, overall, factors, summary, coachingFlags };
}

async function evaluateFactor(
  name: string,
  transcript: string,
  criteria: any,
): Promise<ScoringFactor> {
  const systemPrompt = `You grade real estate sales calls. Grade this call on the factor "${name}" from A to F. ${criteria ? `Criteria: ${JSON.stringify(criteria)}` : ''} Return JSON only: {"grade": "A"|"B"|"C"|"D"|"F", "notes": "brief explanation"}`;

  try {
    const result = await aiClassifierBot.classifyJSON<{ grade: Grade; notes: string }>(
      `Grade this call transcript on "${name}":\n\n${transcript.slice(0, 4000)}`,
      systemPrompt,
    );
    const grade = result && (['A', 'B', 'C', 'D', 'F'] as Grade[]).includes(result.grade) ? result.grade : 'B';
    return { name, grade, notes: result?.notes || '' };
  } catch (err) {
    console.error(`[classifier] Gemini failed for ${name}:`, (err as Error).message);
    return { name, grade: 'B', notes: 'AI scoring unavailable — default grade' };
  }
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

function buildCoachingSummary(factors: ScoringFactor[], flags: string[]): string {
  const lines = factors.map((f) => `  ${f.name}: ${f.grade}`);
  const flagSection = flags.length ? `\nCoaching flags:\n${flags.map((f) => `  ⚠️ ${f}`).join('\n')}` : '';
  return `Scores:\n${lines.join('\n')}${flagSection}`;
}

// ─── UC Message Classification (stub) ───

export type UCMessageCategory = 'checkin' | 'closing_question' | 'concern' | 'other';

export async function classifyUCMessage(_body: string): Promise<UCMessageCategory> {
  // TODO: wire to AI intelligence service
  return 'other';
}

// ─── Offer Reply Classification (stub) ───

export type OfferOutcome = 'accept' | 'counter' | 'stall' | 'reject' | 'unclear';

export interface OfferClassificationResult {
  outcome: OfferOutcome;
  confidence: number;
  counterAmount?: number;
  summary: string;
}

export async function classifyOfferReply(message: string, _tenantId: string): Promise<OfferClassificationResult> {
  // TODO: wire to AI intelligence service
  return { outcome: 'unclear', confidence: 0, summary: message.slice(0, 100) };
}

// ─── Lead Source Classification ───

const INBOUND_FALLBACK_PATTERNS = ['website', 'web', 'form', 'chat', 'referral', 'google', 'facebook', 'seo'];

export function isInboundLead(contact: Record<string, unknown>, playbook: any): boolean {
  const source = ((contact.source as string) || '').toLowerCase();
  const inboundKeys = Object.entries(playbook.leadSources ?? {})
    .filter(([, cfg]: [string, any]) => cfg.type === 'inbound')
    .map(([key]) => key.toLowerCase());
  return [...inboundKeys, ...INBOUND_FALLBACK_PATTERNS].some((s) => source.includes(s));
}

export const classifierBot = {
  classifyMessage,
  classifySoldType,
  classifyDisposition,
  classifyOutcome,
  detectInterest,
  determineBucket,
  selectTone,
  checkAskedUcQuestion,
  scoreCall,
  classifyUCMessage,
  classifyOfferReply,
  isInboundLead,
};
