/**
 * Reality Check — Team Audit
 *
 * One job: check whether the human team is following the playbook process.
 * All GHL reads go through bots.
 */

import { contactBot, taskBot, noteBot, stageBot } from '../../bots';
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
  const walkthroughNoteSlaMins = playbook?.sla?.walkthroughNoteMins ?? 24 * 60;

  // 1. Warm leads with no call logged within SLA
  const warmLeads = await stageBot.getByStage('Warm', {
    after: new Date(windowStart).toISOString(),
  }).catch(() => [] as any[]);

  for (const lead of warmLeads) {
    const contactId: string = lead.id;
    const assignee: string = lead.assignedTo ?? 'unassigned';

    const callLogged = lead.customFields?.last_call_at != null;
    if (!callLogged) {
      issues.push({
        contactId,
        assignee,
        issueType: 'warm-no-call',
        details: `Lead moved to Warm but no call logged within ${warmCallSlaMins} min SLA.`,
        detectedAt: now,
      });
    }
  }

  // 2. Appointment set but no walkthrough notes within 24h
  const aptLeads = await contactBot.search({
    query: '',
    filters: { customField: { appointment_set: 'true' }, dateAdded: { gte: new Date(windowStart).toISOString() } },
  }).catch(() => [] as any[]);

  for (const lead of aptLeads) {
    const contactId: string = lead.id;
    const assignee: string = lead.assignedTo ?? 'unassigned';

    const notes = await noteBot.getByContact(contactId).catch(() => [] as any[]);
    const hasWalkthroughNotes = notes.some((n: any) =>
      n.body?.toLowerCase().includes('walkthrough'),
    );

    const aptSetAt = lead.customFields?.appointment_set_at
      ? new Date(lead.customFields.appointment_set_at).getTime()
      : 0;

    if (aptSetAt && now - aptSetAt > walkthroughNoteSlaMins * 60_000 && !hasWalkthroughNotes) {
      issues.push({
        contactId,
        assignee,
        issueType: 'appointment-no-walkthrough-notes',
        details: `Appointment set ${hoursAgo(now - aptSetAt)} but no walkthrough notes within ${walkthroughNoteSlaMins / 60}h.`,
        detectedAt: now,
      });
    }
  }

  // 3. Dead leads with zero outreach
  const deadLeads = await stageBot.getByStage('Dead', {
    after: new Date(windowStart).toISOString(),
  }).catch(() => [] as any[]);

  for (const lead of deadLeads) {
    const contactId: string = lead.id;
    const assignee: string = lead.assignedTo ?? 'unassigned';

    const outreachCount = parseInt(lead.customFields?.outreach_count ?? '0', 10);
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

  // 4. Slow response times (compare LMs)
  // Aggregate from all warm leads
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
          contactId: '*',
          assignee: lm,
          issueType: 'slow-response-time',
          details: `${lm} avg response (${Math.round(avgMs / 60_000)}min) is >2x team median (${Math.round(median / 60_000)}min).`,
          detectedAt: now,
        });
      }
    }
  }

  // 5. Overdue tasks
  const overdueTasks = await taskBot.getOverdue().catch(() => [] as any[]);

  for (const task of overdueTasks) {
    issues.push({
      contactId: task.contactId ?? '*',
      assignee: task.assignedTo ?? 'unassigned',
      issueType: 'overdue-tasks',
      details: `Task "${task.title}" overdue by ${hoursAgo(now - (new Date(task.dueDate).getTime()))}. Not completed.`,
      detectedAt: now,
    });
  }

  return issues;
}
