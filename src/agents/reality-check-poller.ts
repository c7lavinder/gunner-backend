/**
 * Reality Check Poller
 *
 * Polls: every 4 hours (configurable)
 * Does: runs the Reality Check agent and logs the report.
 * Pattern: mirrors apt-reminder-poller.ts
 */

import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { runRealityCheck, formatReportText } from './reality-check';

const AGENT_ID = 'reality-check-poller';
const DEFAULT_INTERVAL_MS = 4 * 60 * 60_000; // 4 hours
const DEFAULT_TENANT_ID = 'nah'; // New Again Houses

let pollerHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Single poll cycle — called by the interval or manually.
 */
export async function pollOnce(tenantId: string = DEFAULT_TENANT_ID): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const start = Date.now();

  try {
    const report = await runRealityCheck(tenantId);
    const summary = formatReportText(report);

    // TODO: Send summary to Slack/Telegram/notification channel
    // For now, just log it
    console.log(summary);

    auditLog({
      agent: AGENT_ID,
      contactId: '*',
      action: 'poll:complete',
      result: 'success',
      durationMs: Date.now() - start,
      metadata: {
        systemIssues: report.stats.systemIssuesFound,
        teamIssues: report.stats.teamIssuesFound,
        leadsChecked: report.stats.leadsChecked,
      },
    });
  } catch (err: any) {
    auditLog({
      agent: AGENT_ID,
      contactId: '*',
      action: 'poll:error',
      result: 'error',
      reason: err?.message ?? String(err),
      durationMs: Date.now() - start,
    });
  }
}

/**
 * Start the recurring poller.
 */
export function startRealityCheckPoller(
  intervalMs: number = DEFAULT_INTERVAL_MS,
  tenantId: string = DEFAULT_TENANT_ID,
): void {
  if (pollerHandle) {
    console.warn('[reality-check-poller] Already running. Stop first.');
    return;
  }

  console.log(`[reality-check-poller] Starting — interval ${intervalMs / 3_600_000}h`);

  // Run immediately on start, then on interval
  pollOnce(tenantId);
  pollerHandle = setInterval(() => pollOnce(tenantId), intervalMs);
}

/**
 * Stop the recurring poller.
 */
export function stopRealityCheckPoller(): void {
  if (pollerHandle) {
    clearInterval(pollerHandle);
    pollerHandle = null;
    console.log('[reality-check-poller] Stopped.');
  }
}
