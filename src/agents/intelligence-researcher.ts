/**
 * Intelligence Researcher — runs weekly.
 * Calls bot-pattern-analyzer + bot-briefing-writer for deep analysis.
 * Toggle: intelligence-researcher
 *
 * NO logic here — only calls bots.
 */

import { isEnabled } from '../core/toggles';
import { auditLog } from '../core/audit';
import { patternAnalyzerBot } from '../bots/pattern-analyzer';
import { briefingWriterBot } from '../bots/briefing-writer';

const AGENT_ID = 'intelligence-researcher';
let intervalHandle: ReturnType<typeof setInterval> | null = null;

async function runCycle(): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const start = Date.now();
  const tenantId = 'default';

  try {
    const patterns = await patternAnalyzerBot.analyzeResponseRates(tenantId).catch((err) => {
      console.error(`[${AGENT_ID}] analyzeResponseRates failed:`, (err as Error).message);
      return { bestSendTimes: [], bestTones: [], bestDays: [], insights: [] };
    });

    const teamReport = await patternAnalyzerBot.analyzeTeamPerformance(tenantId).catch((err) => {
      console.error(`[${AGENT_ID}] analyzeTeamPerformance failed:`, (err as Error).message);
      return { memberStats: [], insights: [] };
    });

    const briefing = await briefingWriterBot.writeBriefing(tenantId).catch((err) => {
      console.error(`[${AGENT_ID}] writeBriefing failed:`, (err as Error).message);
      return '';
    });

    auditLog({
      agent: AGENT_ID,
      contactId: '',
      action: 'intelligence:weekly-research',
      result: 'success',
      reason: `patterns=${patterns.insights.length} team=${teamReport.memberStats.length} briefing=${briefing.length}chars`,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    auditLog({
      agent: AGENT_ID,
      contactId: '',
      action: 'intelligence:weekly-research',
      result: 'error',
      reason: (err as Error).message,
      durationMs: Date.now() - start,
    });
  }
}

const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;

export function startIntelligenceResearcher(): void {
  // First run after 2 minutes, then weekly
  setTimeout(() => {
    void runCycle();
    intervalHandle = setInterval(() => void runCycle(), ONE_WEEK);
  }, 120_000);
  console.log(`[${AGENT_ID}] scheduled (every 7d)`);
}

export function stopIntelligenceResearcher(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
