/**
 * Pattern Analyzer Bot — ONE job: analyze patterns from intelligence memory.
 * Toggle: bot-pattern-analyzer
 */

import { isEnabled } from '../core/toggles';
import { analyzePatterns, analyzeTeamPatterns } from '../intelligence/researcher';
import type { PatternReport, TeamReport } from '../intelligence/researcher';

const BOT_ID = 'bot-pattern-analyzer';

export async function analyzeResponseRates(tenantId: string): Promise<PatternReport> {
  if (!isEnabled(BOT_ID)) return { bestSendTimes: [], bestTones: [], bestDays: [], insights: [] };
  return analyzePatterns(tenantId);
}

export async function analyzeTeamPerformance(tenantId: string): Promise<TeamReport> {
  if (!isEnabled(BOT_ID)) return { memberStats: [], insights: [] };
  return analyzeTeamPatterns(tenantId);
}

export const patternAnalyzerBot = { analyzeResponseRates, analyzeTeamPerformance };
