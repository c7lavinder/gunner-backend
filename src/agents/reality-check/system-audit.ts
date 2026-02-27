/**
 * Reality Check — System Audit
 *
 * One job: check whether automations (scoring, outreach, tagging) actually fired.
 * All GHL reads go through bots.
 */

import { contactBot, taskBot, noteBot } from '../../bots';
import type { SystemIssue } from './types';

function hoursAgo(ms: number): string {
  const h = Math.round((ms / 3_600_000) * 10) / 10;
  return `${h}h ago`;
}

export async function runSystemAudit(
  _tenantId: string,
  playbook: any,
  windowStart: number,
  _windowEnd: number,
): Promise<{ issues: SystemIssue[]; leadsChecked: number }> {
  const issues: SystemIssue[] = [];
  const now = Date.now();

  // Fetch recent leads via contactBot (read-only bot)
  const recentLeads = await contactBot.search({
    query: '',
    filters: { dateAdded: { gte: new Date(windowStart).toISOString() } },
  }).catch(() => [] as any[]);

  for (const lead of recentLeads) {
    const contactId: string = lead.id;

    // 1. No score assigned → scoring agent didn't fire
    const hasScore = lead.customFields?.lead_score != null;
    if (!hasScore) {
      issues.push({
        contactId,
        issueType: 'no-score-assigned',
        details: `Lead created ${hoursAgo(now - new Date(lead.dateAdded).getTime())} with no score.`,
        detectedAt: now,
      });
    }

    // 2. No initial text → outreach agent didn't fire
    const hasInitialText = lead.customFields?.initial_sms_sent === 'true';
    if (!hasInitialText) {
      issues.push({
        contactId,
        issueType: 'no-initial-outreach',
        details: `Lead created ${hoursAgo(now - new Date(lead.dateAdded).getTime())} with no initial SMS.`,
        detectedAt: now,
      });
    }

    // 3. Pipeline stalled — in stage beyond SLA with no activity
    const stageSlaMs = (playbook?.sla?.maxStageTimeHours ?? 48) * 3_600_000;
    const stageEnteredAt: number | null = lead.customFields?.stage_entered_at
      ? new Date(lead.customFields.stage_entered_at).getTime()
      : null;
    if (stageEnteredAt && now - stageEnteredAt > stageSlaMs) {
      issues.push({
        contactId,
        issueType: 'pipeline-stalled',
        details: `Lead stuck in stage for ${hoursAgo(now - stageEnteredAt)} (SLA: ${playbook?.sla?.maxStageTimeHours ?? 48}h).`,
        detectedAt: now,
      });
    }

    // 4. Duplicate tasks
    const tasks = await taskBot.getByContact(contactId).catch(() => [] as any[]);
    const titleCounts = new Map<string, number>();
    for (const t of tasks) {
      titleCounts.set(t.title, (titleCounts.get(t.title) ?? 0) + 1);
    }
    for (const [title, count] of titleCounts) {
      if (count > 1) {
        issues.push({
          contactId,
          issueType: 'duplicate-tasks',
          details: `Task "${title}" appears ${count} times. Possible duplicate bug.`,
          detectedAt: now,
        });
      }
    }

    // 5. Stage moved but no corresponding note
    const notes = await noteBot.getByContact(contactId).catch(() => [] as any[]);
    if (stageEnteredAt && notes.length === 0) {
      issues.push({
        contactId,
        issueType: 'missing-stage-note-or-tag',
        details: `Stage changed but no notes logged. Agent may have skipped steps.`,
        detectedAt: now,
      });
    }
  }

  return { issues, leadsChecked: recentLeads.length };
}
