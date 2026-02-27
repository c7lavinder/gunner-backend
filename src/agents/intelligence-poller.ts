/**
 * Intelligence Poller — runs every 24 hours.
 * Matches actions to outcomes, generates daily briefing, identifies trends.
 * Toggle: intelligence-poller
 *
 * NO logic here — only calls bots.
 */

import { isEnabled } from '../core/toggles';
import { auditLog } from '../core/audit';
import { outcomeTrackerBot } from '../bots/outcome-tracker';
import { learningBuilderBot } from '../bots/learning-builder';
import { briefingWriterBot } from '../bots/briefing-writer';
import { patternAnalyzerBot } from '../bots/pattern-analyzer';

const AGENT_ID = 'intelligence-poller';
let intervalHandle: ReturnType<typeof setInterval> | null = null;

async function runCycle(): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const start = Date.now();
  console.log('[intelligence-poller] starting daily cycle');

  try {
    const tenantId = 'default';

    // Match outcomes
    const { matched, unmatched } = await outcomeTrackerBot.matchOutcomes(tenantId).catch((err) => {
      console.error('[intelligence-poller] matchOutcomes failed:', (err as Error).message);
      return { matched: 0, unmatched: 0 };
    });

    // Build learnings
    const learnings = await learningBuilderBot.buildContext('all').catch((err) => {
      console.error('[intelligence-poller] buildContext failed:', (err as Error).message);
      return '';
    });

    // Analyze patterns
    const patterns = await patternAnalyzerBot.analyzeResponseRates(tenantId).catch((err) => {
      console.error('[intelligence-poller] analyzeResponseRates failed:', (err as Error).message);
      return { bestSendTimes: [], bestTones: [], bestDays: [], insights: [] };
    });

    if (patterns.insights.length > 0) {
      console.log('[intelligence-poller] SMS insights:', patterns.insights.join('; '));
    }

    // Generate briefing
    const briefing = await briefingWriterBot.writeBriefing(tenantId).catch((err) => {
      console.error('[intelligence-poller] writeBriefing failed:', (err as Error).message);
      return '';
    });

    console.log(`[intelligence-poller] briefing length: ${briefing.length}`);

    auditLog({
      agent: AGENT_ID,
      contactId: '',
      action: 'intelligence:daily-cycle',
      result: 'success',
      reason: `matched=${matched} unmatched=${unmatched} learnings=${learnings.length}chars briefing=${briefing.length}chars`,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    console.error('[intelligence-poller] cycle failed:', (err as Error).message);
    auditLog({
      agent: AGENT_ID,
      contactId: '',
      action: 'intelligence:daily-cycle',
      result: 'error',
      reason: (err as Error).message,
      durationMs: Date.now() - start,
    });
  }
}

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

export function startIntelligencePoller(): void {
  setTimeout(() => {
    void runCycle();
    intervalHandle = setInterval(() => void runCycle(), TWENTY_FOUR_HOURS);
  }, 60_000);
  console.log('[intelligence-poller] scheduled (every 24h)');
}

export function stopIntelligencePoller(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
