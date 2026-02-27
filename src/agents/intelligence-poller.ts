/**
 * Intelligence Poller — runs every 24 hours.
 * Matches actions to outcomes, generates daily briefing, identifies trends.
 * Toggle: intelligence-poller
 */

import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { auditLog } from '../core/audit';
import { getRecentByCategory, getStats, getAllCategories } from '../intelligence/memory';
import { generateBriefing, analyzePatterns } from '../intelligence/researcher';

const AGENT_ID = 'intelligence-poller';
let intervalHandle: ReturnType<typeof setInterval> | null = null;

async function runCycle(): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const start = Date.now();
  console.log('[intelligence-poller] starting daily cycle');

  try {
    const categories = await getAllCategories();
    const statsReport: string[] = [];

    for (const cat of categories) {
      const stats = await getStats(cat);
      statsReport.push(`${cat}: ${stats.total} entries, avg ${stats.avgScore}/100, improving=${stats.improvedOverTime}`);

      // Find unscored entries that might have outcomes by now
      const recent = await getRecentByCategory(cat, 50);
      const unscored = recent.filter((e) => e.score === null && e.outcome === null);
      if (unscored.length > 0) {
        console.log(`[intelligence-poller] ${cat}: ${unscored.length} entries awaiting outcomes`);
      }
    }

    // Generate patterns for SMS
    const patterns = await analyzePatterns('default');
    if (patterns.insights.length > 0) {
      console.log('[intelligence-poller] SMS insights:', patterns.insights.join('; '));
    }

    // Generate briefing
    if (!isDryRun()) {
      const briefing = await generateBriefing('default');
      console.log('[intelligence-poller] briefing generated, length:', briefing.length);
    }

    auditLog({
      agent: AGENT_ID,
      contactId: '',
      action: 'intelligence:daily-cycle',
      result: 'success',
      reason: statsReport.join(' | '),
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
  // Run first cycle after 60s, then every 24h
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
