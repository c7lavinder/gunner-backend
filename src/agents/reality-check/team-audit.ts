/**
 * Reality Check — Team Audit
 *
 * Checks whether the human team is following the playbook process.
 * Uses GHL API directly for read operations (auditing only).
 */

import { searchBot } from '../../bots/contact-search';
import { taskReaderBot } from '../../bots/task-reader';
import type { TeamIssue } from './types';

function hoursAgo(ms: number): string {
  const h = Math.round((ms / 3_600_000) * 10) / 10;
  return `${h}h ago`;
}

export async function runTeamAudit(
  _tenantId: string,
  playbook: any,
  windowStart: number,
  _windowEnd: number,
): Promise<TeamIssue[]> {
  const issues: TeamIssue[] = [];
  const now = Date.now();

  const warmCallSlaMins = playbook?.sla?.warmCallMins ?? 30;

  // 1. Warm leads with no call logged within SLA
  // Search for warm leads — using searchBot with stage filter
  const warmLeads = await searchBot.searchContacts('', { pipelineStageId: 'warm', startAfter: new Date(windowStart).toISOString() });

  for (const lead of warmLeads) {
    const contactId: string = lead.id;
    const assignee: string = lead.assignedTo ?? 'unassigned';

    if (lead.customFields?.last_call_at == null) {
      issues.push({
        contactId, assignee,
        issueType: 'warm-no-call',
        details: `Lead moved to Warm but no call logged within ${warmCallSlaMins} min SLA.`,
        detectedAt: now,
      });
    }
  }

  // 2. Slow response times (compare LMs)
  const responseTimesByLM: Record<string, number[]> = {};
  for (const lead of warmLeads) {
    const assignee = lead.assignedTo;
    const responseMs = lead.customFields?.first_response_ms
      ? parseInt(lead.customFields.first_response_ms, 10)
      : null;
    if (assignee && responseMs) {
      if (!responseTimesByLM[assignee]) responseTimesByLM[assignee] = [];
      responseTimesByLM[assignee].push(responseMs);
    }
  }

  const avgByLM: Record<string, number> = {};
  for (const [lm, times] of Object.entries(responseTimesByLM)) {
    avgByLM[lm] = times.reduce((a, b) => a + b, 0) / times.length;
  }

  const allAvgs = Object.values(avgByLM);
  if (allAvgs.length >= 2) {
    const sorted = [...allAvgs].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    for (const [lm, avgMs] of Object.entries(avgByLM)) {
      if (avgMs > median * 2) {
        issues.push({
          contactId: '*', assignee: lm,
          issueType: 'slow-response-time',
          details: `${lm} avg response (${Math.round(avgMs / 60_000)}min) is >2x team median (${Math.round(median / 60_000)}min).`,
          detectedAt: now,
        });
      }
    }
  }

  // 3. Overdue tasks
  const overdueTasks = await taskReaderBot.getOverdueTasks();

  for (const task of overdueTasks) {
    issues.push({
      contactId: task.contactId ?? '*',
      assignee: task.assignedTo ?? 'unassigned',
      issueType: 'overdue-tasks',
      details: `Task "${task.title}" overdue by ${hoursAgo(now - new Date(task.dueDate).getTime())}.`,
      detectedAt: now,
    });
  }

  return issues;
}
