/**
 * Reality Check Agent
 *
 * Fires on: cron (every 4-6 hours)
 * Does: audits what's ACTUALLY happening in GHL vs what the playbook says SHOULD happen.
 *
 * Two audit layers:
 *   1. System Audit  — are automations (scoring, outreach, tagging) actually firing?
 *   2. Team Audit    — is the human team following the playbook process?
 *
 * Output: a structured report with systemIssues[], teamIssues[], stats, timestamp.
 * Idempotent: tracks last audit window so it never re-checks the same window.
 */

import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { loadPlaybook } from '../config/loader';
import { contactBot, taskBot, noteBot, stageBot } from '../bots';

// ─── Constants ──────────────────────────────────────────────────────────────

const AGENT_ID = 'reality-check';
const DEFAULT_AUDIT_WINDOW_MS = 6 * 60 * 60_000; // 6 hours

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SystemIssue {
  contactId: string;
  issueType:
    | 'no-score-assigned'
    | 'no-initial-outreach'
    | 'pipeline-stalled'
    | 'duplicate-tasks'
    | 'missing-stage-note-or-tag';
  details: string;
  detectedAt: number;
}

export interface TeamIssue {
  contactId: string;
  assignee: string;
  issueType:
    | 'warm-no-call'
    | 'appointment-no-walkthrough-notes'
    | 'dead-zero-outreach'
    | 'slow-response-time'
    | 'overdue-tasks';
  details: string;
  detectedAt: number;
}

export interface RealityCheckReport {
  systemIssues: SystemIssue[];
  teamIssues: TeamIssue[];
  stats: {
    leadsChecked: number;
    systemIssuesFound: number;
    teamIssuesFound: number;
  };
  auditWindowStart: number;
  auditWindowEnd: number;
  timestamp: number;
}

// ─── State (in-memory, will move to DB later) ───────────────────────────────

let lastAuditEnd: number | null = null;

export function getLastAuditEnd(): number | null {
  return lastAuditEnd;
}

export function setLastAuditEnd(ts: number): void {
  lastAuditEnd = ts;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function hoursAgo(ms: number): string {
  const h = Math.round(ms / 3_600_000 * 10) / 10;
  return `${h}h ago`;
}

// ─── System Audit ───────────────────────────────────────────────────────────

async function runSystemAudit(
  _tenantId: string,
  _playbook: any,
  _windowStart: number,
  _windowEnd: number,
): Promise<{ issues: SystemIssue[]; leadsChecked: number }> {
  const issues: SystemIssue[] = [];
  const now = Date.now();

  // TODO: Replace with real GHL API call — fetch leads created in [windowStart, windowEnd]
  // const recentLeads = await contactBot.search({ createdAfter: windowStart, createdBefore: windowEnd });
  const recentLeads: any[] = []; // placeholder

  for (const lead of recentLeads) {
    const contactId: string = lead.id;

    // 1. Lead arrived but no score assigned → scoring agent didn't fire
    // TODO: Check lead.customFields for score field from playbook
    const hasScore = lead.customFields?.lead_score != null;
    if (!hasScore) {
      issues.push({
        contactId,
        issueType: 'no-score-assigned',
        details: `Lead created ${hoursAgo(now - lead.createdAt)} with no score. Scoring agent may not have fired.`,
        detectedAt: now,
      });
    }

    // 2. Lead arrived but no initial text sent → outreach agent didn't fire
    // TODO: Check conversation history via GHL conversations API
    const hasInitialText = false; // placeholder
    if (!hasInitialText) {
      issues.push({
        contactId,
        issueType: 'no-initial-outreach',
        details: `Lead created ${hoursAgo(now - lead.createdAt)} with no initial SMS. Outreach agent may not have fired.`,
        detectedAt: now,
      });
    }

    // 3. Pipeline stalled — lead in stage > SLA time with no activity
    // TODO: Pull stage timestamps + last activity from GHL
    const stageSlaMs = (_playbook?.sla?.maxStageTimeHours ?? 48) * 3_600_000;
    const stageEnteredAt: number | null = lead.customFields?.stage_entered_at ?? null;
    const lastActivityAt: number | null = lead.customFields?.last_activity_at ?? null;
    if (stageEnteredAt && now - stageEnteredAt > stageSlaMs) {
      if (!lastActivityAt || now - lastActivityAt > stageSlaMs) {
        issues.push({
          contactId,
          issueType: 'pipeline-stalled',
          details: `Lead stuck in "${lead.pipelineStage ?? 'unknown'}" for ${hoursAgo(now - stageEnteredAt)} with no activity.`,
          detectedAt: now,
        });
      }
    }

    // 4. Duplicate tasks on same contact
    // TODO: Fetch tasks via taskBot and check for duplicates
    // const tasks = await taskBot.getByContact(contactId);
    const tasks: any[] = []; // placeholder
    const titleCounts = new Map<string, number>();
    for (const t of tasks) {
      titleCounts.set(t.title, (titleCounts.get(t.title) ?? 0) + 1);
    }
    for (const [title, count] of titleCounts) {
      if (count > 1) {
        issues.push({
          contactId,
          issueType: 'duplicate-tasks',
          details: `Task "${title}" appears ${count} times on this contact. Possible duplicate bug.`,
          detectedAt: now,
        });
      }
    }

    // 5. Lead moved stages but no corresponding note/tag
    // TODO: Pull stage change history + notes + tags
    // const notes = await noteBot.getByContact(contactId);
    // const tags = lead.tags ?? [];
    // Check that each stage move has a matching note/tag
    const stageHistory: any[] = []; // placeholder
    const notes: any[] = []; // placeholder
    for (const move of stageHistory) {
      const hasNote = notes.some((n: any) => n.createdAt >= move.movedAt - 60_000 && n.createdAt <= move.movedAt + 300_000);
      if (!hasNote) {
        issues.push({
          contactId,
          issueType: 'missing-stage-note-or-tag',
          details: `Stage changed to "${move.toStage}" but no note or tag was logged. Agent may have skipped steps.`,
          detectedAt: now,
        });
      }
    }
  }

  return { issues, leadsChecked: recentLeads.length };
}

// ─── Team Audit ─────────────────────────────────────────────────────────────

async function runTeamAudit(
  _tenantId: string,
  _playbook: any,
  _windowStart: number,
  _windowEnd: number,
): Promise<TeamIssue[]> {
  const issues: TeamIssue[] = [];
  const now = Date.now();

  const warmCallSlaMins = _playbook?.sla?.warmCallMins ?? 30;
  const walkthroughNoteSlaMins = _playbook?.sla?.walkthroughNoteMins ?? 24 * 60;

  // TODO: Fetch leads that moved to "Warm" in the audit window
  // const warmLeads = await stageBot.getMovedTo('Warm', { after: windowStart, before: windowEnd });
  const warmLeads: any[] = []; // placeholder

  for (const lead of warmLeads) {
    const contactId: string = lead.id;
    const assignee: string = lead.assignedTo ?? 'unassigned';

    // 1. Warm but no call logged within SLA
    // TODO: Check call logs via GHL conversations/calls API
    const callLoggedWithinSla = false; // placeholder
    if (!callLoggedWithinSla) {
      issues.push({
        contactId,
        assignee,
        issueType: 'warm-no-call',
        details: `Lead moved to Warm but no call logged within ${warmCallSlaMins} min SLA.`,
        detectedAt: now,
      });
    }
  }

  // TODO: Fetch leads with appointments set in the audit window
  // const aptLeads = await contactBot.search({ hasAppointment: true, after: windowStart });
  const aptLeads: any[] = []; // placeholder

  for (const lead of aptLeads) {
    const contactId: string = lead.id;
    const assignee: string = lead.assignedTo ?? 'unassigned';

    // 2. Appointment set but no walkthrough notes within 24h
    // TODO: Check notes via noteBot
    const hasWalkthroughNotes = false; // placeholder
    const aptSetAt: number = lead.customFields?.appointment_set_at ?? 0;
    if (aptSetAt && now - aptSetAt > walkthroughNoteSlaMins * 60_000 && !hasWalkthroughNotes) {
      issues.push({
        contactId,
        assignee,
        issueType: 'appointment-no-walkthrough-notes',
        details: `Appointment set ${hoursAgo(now - aptSetAt)} but no walkthrough notes logged within ${walkthroughNoteSlaMins / 60}h.`,
        detectedAt: now,
      });
    }
  }

  // TODO: Fetch leads marked Dead in the audit window
  // const deadLeads = await stageBot.getMovedTo('Dead', { after: windowStart, before: windowEnd });
  const deadLeads: any[] = []; // placeholder

  for (const lead of deadLeads) {
    const contactId: string = lead.id;
    const assignee: string = lead.assignedTo ?? 'unassigned';

    // 3. Dead with zero outreach attempts
    // TODO: Check outreach count (SMS + calls)
    const outreachCount = 0; // placeholder
    if (outreachCount === 0) {
      issues.push({
        contactId,
        assignee,
        issueType: 'dead-zero-outreach',
        details: `Lead marked Dead with zero outreach attempts. Process violation.`,
        detectedAt: now,
      });
    }
  }

  // 4. Inconsistent response times across LMs
  // TODO: Pull average response times per assignee, flag outliers (>2x median)
  // const responseTimesByLM = await computeResponseTimes(windowStart, windowEnd);
  const responseTimesByLM: Record<string, number> = {}; // placeholder
  const times = Object.values(responseTimesByLM);
  if (times.length >= 2) {
    const sorted = [...times].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    for (const [lm, avgMs] of Object.entries(responseTimesByLM)) {
      if (avgMs > median * 2) {
        issues.push({
          contactId: '*',
          assignee: lm,
          issueType: 'slow-response-time',
          details: `${lm} avg response time (${Math.round(avgMs / 60_000)}min) is >2x team median (${Math.round(median / 60_000)}min).`,
          detectedAt: now,
        });
      }
    }
  }

  // 5. Overdue / incomplete tasks
  // TODO: Fetch overdue tasks via taskBot
  // const overdueTasks = await taskBot.getOverdue({ before: windowEnd });
  const overdueTasks: any[] = []; // placeholder

  for (const task of overdueTasks) {
    issues.push({
      contactId: task.contactId ?? '*',
      assignee: task.assignedTo ?? 'unassigned',
      issueType: 'overdue-tasks',
      details: `Task "${task.title}" overdue by ${hoursAgo(now - (task.dueAt ?? now))}. Not completed.`,
      detectedAt: now,
    });
  }

  return issues;
}

// ─── Report Generation ──────────────────────────────────────────────────────

export async function generateReport(tenantId: string): Promise<RealityCheckReport> {
  const now = Date.now();
  const playbook = await loadPlaybook(tenantId);
  const auditWindowMs = (playbook?.realityCheck?.windowHours ?? 6) * 3_600_000;

  const windowEnd = now;
  const windowStart = lastAuditEnd ?? now - auditWindowMs;

  const { issues: systemIssues, leadsChecked } = await runSystemAudit(tenantId, playbook, windowStart, windowEnd);
  const teamIssues = await runTeamAudit(tenantId, playbook, windowStart, windowEnd);

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
    timestamp: now,
  };

  // Advance the window
  setLastAuditEnd(windowEnd);

  return report;
}

/**
 * Format the structured report into a human-readable summary.
 */
export function formatReportText(report: RealityCheckReport): string {
  const lines: string[] = [];
  const windowMins = Math.round((report.auditWindowEnd - report.auditWindowStart) / 60_000);
  const windowHours = Math.round(windowMins / 60 * 10) / 10;

  lines.push(`📋 Reality Check Report`);
  lines.push(`Window: last ${windowHours} hours`);
  lines.push(`Leads checked: ${report.stats.leadsChecked}`);
  lines.push('');

  // System issues
  if (report.systemIssues.length === 0) {
    lines.push(`✅ No system issues — all automations appear healthy.`);
  } else {
    lines.push(`⚠️ ${report.systemIssues.length} system issue(s) found:`);
    for (const issue of report.systemIssues) {
      lines.push(`  • [${issue.issueType}] ${issue.details} (contact: ${issue.contactId})`);
    }
  }

  lines.push('');

  // Team issues
  if (report.teamIssues.length === 0) {
    lines.push(`✅ No team issues — everyone's following the playbook.`);
  } else {
    lines.push(`⚠️ ${report.teamIssues.length} team issue(s) found:`);
    for (const issue of report.teamIssues) {
      lines.push(`  • [${issue.issueType}] ${issue.details} (${issue.assignee}, contact: ${issue.contactId})`);
    }
  }

  lines.push('');
  lines.push(`Generated: ${new Date(report.timestamp).toLocaleString()}`);

  return lines.join('\n');
}

// ─── Main Entry ─────────────────────────────────────────────────────────────

export async function runRealityCheck(tenantId: string): Promise<RealityCheckReport> {
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

  const report = await generateReport(tenantId);

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
      windowStart: report.auditWindowStart,
      windowEnd: report.auditWindowEnd,
    },
  });

  // Log individual issues for traceability
  for (const issue of report.systemIssues) {
    auditLog({
      agent: AGENT_ID,
      contactId: issue.contactId,
      action: `system-issue:${issue.issueType}`,
      result: 'success',
      metadata: { details: issue.details },
    });
  }

  for (const issue of report.teamIssues) {
    auditLog({
      agent: AGENT_ID,
      contactId: issue.contactId,
      action: `team-issue:${issue.issueType}`,
      result: 'success',
      metadata: { details: issue.details, assignee: issue.assignee },
    });
  }

  return report;
}
