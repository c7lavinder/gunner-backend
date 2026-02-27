/**
 * Reality Check Agent — Orchestrator
 *
 * Fires on: cron (every 4-6 hours)
 * Does: coordinates system audit + team audit, builds report.
 *
 * This file is the orchestrator only. Actual audit logic lives in:
 *   - system-audit.ts (are automations working?)
 *   - team-audit.ts (is the team following process?)
 *   - report.ts (formatting)
 */

import { auditLog } from '../../core/audit';
import { isEnabled } from '../../core/toggles';
import { loadPlaybook } from '../../config/loader';
import { runSystemAudit } from './system-audit';
import { runTeamAudit } from './team-audit';
import { formatReportText } from './report';
import type { RealityCheckReport } from './types';

export type { RealityCheckReport, SystemIssue, TeamIssue } from './types';
export { formatReportText } from './report';

// ─── Constants ──────────────────────────────────────────────────────────────

const AGENT_ID = 'reality-check';

// ─── State (in-memory, will move to DB later) ──────────────────────────────

let lastAuditEnd: number | null = null;

export function getLastAuditEnd(): number | null {
  return lastAuditEnd;
}

export function setLastAuditEnd(ts: number): void {
  lastAuditEnd = ts;
}

// ─── Main Entry ─────────────────────────────────────────────────────────────

export async function runRealityCheck(
  tenantId: string,
): Promise<RealityCheckReport> {
  if (!isEnabled(AGENT_ID)) {
    auditLog({
      agent: AGENT_ID,
      contactId: '*',
      action: 'run:skipped',
      result: 'skipped',
      reason: 'Agent disabled via toggle',
    });
    return {
      systemIssues: [],
      teamIssues: [],
      stats: { leadsChecked: 0, systemIssuesFound: 0, teamIssuesFound: 0 },
      auditWindowStart: 0,
      auditWindowEnd: 0,
      timestamp: Date.now(),
    };
  }

  const start = Date.now();

  auditLog({
    agent: AGENT_ID,
    contactId: '*',
    action: 'audit:start',
    result: 'success',
  });

  const playbook = await loadPlaybook(tenantId);
  const auditWindowMs =
    (playbook?.realityCheck?.windowHours ?? 6) * 3_600_000;

  const windowEnd = Date.now();
  const windowStart = lastAuditEnd ?? windowEnd - auditWindowMs;

  // Run both audits
  const { issues: systemIssues, leadsChecked } = await runSystemAudit(
    tenantId,
    playbook,
    windowStart,
    windowEnd,
  );
  const teamIssues = await runTeamAudit(
    tenantId,
    playbook,
    windowStart,
    windowEnd,
  );

  const report: RealityCheckReport = {
    systemIssues,
    teamIssues,
    stats: {
      leadsChecked,
      systemIssuesFound: systemIssues.length,
      teamIssuesFound: teamIssues.length,
    },
    auditWindowStart: windowStart,
    auditWindowEnd: windowEnd,
    timestamp: Date.now(),
  };

  // Advance the window
  setLastAuditEnd(windowEnd);

  auditLog({
    agent: AGENT_ID,
    contactId: '*',
    action: 'audit:complete',
    result: 'success',
    durationMs: Date.now() - start,
    metadata: {
      leadsChecked: report.stats.leadsChecked,
      systemIssues: report.stats.systemIssuesFound,
      teamIssues: report.stats.teamIssuesFound,
    },
  });

  // Log individual issues
  for (const issue of report.systemIssues) {
    auditLog({
      agent: AGENT_ID,
      contactId: issue.contactId,
      action: `system-issue:${issue.issueType}`,
      result: 'error',
      metadata: { details: issue.details },
    });
  }

  for (const issue of report.teamIssues) {
    auditLog({
      agent: AGENT_ID,
      contactId: issue.contactId,
      action: `team-issue:${issue.issueType}`,
      result: 'error',
      metadata: { details: issue.details, assignee: issue.assignee },
    });
  }

  return report;
}
