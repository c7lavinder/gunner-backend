/**
 * Learning Engine — builds context from past performance to improve future AI calls.
 * Returns prompt-ready strings that agents inject into AI system prompts.
 */

import { getTopPerformers, getWorstPerformers, getRecentByCategory } from './memory';

function summarizeEntries(entries: Array<{ input: Record<string, any>; output: Record<string, any>; score: number | null; feedback: string | null }>): string {
  return entries
    .map((e, i) => {
      const parts: string[] = [`${i + 1}.`];
      if (e.output.message) parts.push(`Message: "${e.output.message}"`);
      if (e.input.tone) parts.push(`Tone: ${e.input.tone}`);
      if (e.input.bucket) parts.push(`Bucket: ${e.input.bucket}`);
      if (e.score !== null) parts.push(`Score: ${e.score}/100`);
      if (e.feedback) parts.push(`Feedback: "${e.feedback}"`);
      return parts.join(' | ');
    })
    .join('\n');
}

export async function buildLearningContext(category: string, limit = 5): Promise<string> {
  const [winners, losers] = await Promise.all([
    getTopPerformers(category, limit),
    getWorstPerformers(category, limit),
  ]);

  if (winners.length === 0 && losers.length === 0) return '';

  const sections: string[] = [];

  if (winners.length > 0) {
    sections.push(
      `## What Works (from experience)\nThese past actions scored highest:\n${summarizeEntries(winners)}`,
    );
  }

  if (losers.length > 0 && losers.some((e) => (e.score ?? 100) < 50)) {
    const actualLosers = losers.filter((e) => (e.score ?? 100) < 50);
    if (actualLosers.length > 0) {
      sections.push(
        `## What Doesn't Work\nThese past actions scored lowest — avoid these patterns:\n${summarizeEntries(actualLosers)}`,
      );
    }
  }

  return sections.join('\n\n');
}

export async function getSmsLearnings(_tenantId: string): Promise<string> {
  return buildLearningContext('sms-performance', 5);
}

export async function getScoringLearnings(_tenantId: string): Promise<string> {
  return buildLearningContext('scoring-accuracy', 5);
}

export async function getCoachingLearnings(_tenantId: string): Promise<string> {
  return buildLearningContext('coaching-patterns', 5);
}

export async function getClassificationLearnings(_tenantId: string): Promise<string> {
  const corrections = await getRecentByCategory('classification-corrections', 20);
  if (corrections.length === 0) return '';

  const lines = corrections.map((e) => {
    const original = e.output.classification ?? 'unknown';
    const corrected = e.outcome?.correctedTo ?? e.feedback ?? 'unknown';
    const msg = e.input.message ?? '';
    return `- "${msg}" → was "${original}", should be "${corrected}"`;
  });

  return `## Classification Corrections (learn from these)\n${lines.join('\n')}`;
}
