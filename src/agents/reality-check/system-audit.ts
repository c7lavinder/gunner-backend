/**
 * Reality Check — System Audit
 *
 * Checks whether automations (scoring, outreach, tagging) actually fired.
 * Uses GHL API directly for read operations (auditing only).
 */

import { ghlGet } from '../../integrations/ghl/client';
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

  // Fetch recent leads via GHL search
  const res = await ghlGet<any>(`/contacts/search?query=&dateAdded_gte=${new Date(windowStart).toISOString()}`).catch(() => ({ contacts: [] }));
  const recentLeads: any[] = res?.contacts ?? [];

  for (const lead of recentLeads) {
    const contactId: string = lead.id;
    const cf = lead.customFields ?? {};

    // 1. No score assigned
    if (cf.lead_score == null) {
      issues.push({
        contactId,
        issueType: 'no-score-assigned',
        details: `Lead created ${hoursAgo(now - new Date(lead.dateAdded).getTime())} with no score.`,
        detectedAt: now,
      });
    }

    // 2. No initial text
    if (cf.initial_sms_sent !== 'true') {
      issues.push({
        contactId,
        issueType: 'no-initial-outreach',
        details: `Lead created ${hoursAgo(now - new Date(lead.dateAdded).getTime())} with no initial SMS.`,
        detectedAt: now,
      });
    }

    // 3. Pipeline stalled
    const stageSlaMs = (playbook?.sla?.maxStageTimeHours ?? 48) * 3_600_000;
    const stageEnteredAt = cf.stage_entered_at ? new Date(cf.stage_entered_at).getTime() : null;
    if (stageEnteredAt && now - stageEnteredAt > stageSlaMs) {
      issues.push({
        contactId,
        issueType: 'pipeline-stalled',
        details: `Lead stuck in stage for ${hoursAgo(now - stageEnteredAt)} (SLA: ${playbook?.sla?.maxStageTimeHours ?? 48}h).`,
        detectedAt: now,
      });
    }

    // 4. Duplicate tasks
    const tasksRes = await ghlGet<any>(`/contacts/${contactId}/tasks`).catch(() => ({ tasks: [] }));
    const tasks: any[] = tasksRes?.tasks ?? [];
    const titleCounts = new Map<string, number>();
    for (const t of tasks) {
      titleCounts.set(t.title, (titleCounts.get(t.title) ?? 0) + 1);
    }
    for (const [title, count] of titleCounts) {
      if (count > 1) {
        issues.push({
          contactId,
          issueType: 'duplicate-tasks',
          details: `Task "${title}" appears ${count} times.`,
          detectedAt: now,
        });
      }
    }

    // 5. Stage moved but no notes
    const notesRes = await ghlGet<any>(`/contacts/${contactId}/notes`).catch(() => ({ notes: [] }));
    const notes: any[] = notesRes?.notes ?? [];
    if (stageEnteredAt && notes.length === 0) {
      issues.push({
        contactId,
        issueType: 'missing-stage-note-or-tag',
        details: `Stage changed but no notes logged.`,
        detectedAt: now,
      });
    }
  }

  return { issues, leadsChecked: recentLeads.length };
}
