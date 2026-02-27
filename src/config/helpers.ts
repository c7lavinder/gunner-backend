/**
 * Playbook Helpers
 *
 * Convenience functions so agents don't dig through raw JSON.
 * All read from the loaded playbook — zero hardcoded values.
 */

import { loadPlaybook } from './loader';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TaskTemplate {
  title: string;
  assign_to: string;
  deadline_minutes?: number;
  deadline_hours?: number;
  deadline_hours_before?: number;
  body?: string;
  urgency?: string;
}

export interface NoteTemplate {
  template: string;
}

// ─── Stage Helpers ──────────────────────────────────────────────────────────

export async function getStageId(
  tenantId: string,
  pipeline: string,
  stageKey: string,
): Promise<string | null> {
  const pb = await loadPlaybook(tenantId);
  return pb?.crm?.pipelines?.[pipeline]?.stages?.[stageKey] ?? null;
}

export async function getPipelineId(
  tenantId: string,
  pipeline: string,
): Promise<string | null> {
  const pb = await loadPlaybook(tenantId);
  return pb?.crm?.pipelines?.[pipeline]?.pipelineId ?? null;
}

// ─── Custom Field Helpers ───────────────────────────────────────────────────

export async function getFieldName(
  tenantId: string,
  fieldKey: string,
): Promise<string> {
  const pb = await loadPlaybook(tenantId);
  return pb?.customFields?.[fieldKey] ?? fieldKey;
}

export async function getFieldNames(
  tenantId: string,
): Promise<Record<string, string>> {
  const pb = await loadPlaybook(tenantId);
  return pb?.customFields ?? {};
}

// ─── Tag Helpers ────────────────────────────────────────────────────────────

export async function getTag(
  tenantId: string,
  tagKey: string,
): Promise<string> {
  const pb = await loadPlaybook(tenantId);
  return pb?.tags?.[tagKey] ?? tagKey;
}

// ─── Task Template Helpers ──────────────────────────────────────────────────

export async function getTaskTemplate(
  tenantId: string,
  taskKey: string,
): Promise<TaskTemplate | null> {
  const pb = await loadPlaybook(tenantId);
  return pb?.tasks?.[taskKey] ?? null;
}

/**
 * Render a task template with variables.
 * Replaces {{var}} with values from the vars object.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

// ─── Note Template Helpers ──────────────────────────────────────────────────

export async function getNoteTemplate(
  tenantId: string,
  noteKey: string,
): Promise<string | null> {
  const pb = await loadPlaybook(tenantId);
  return pb?.notes?.[noteKey] ?? null;
}

// ─── Team Helpers ───────────────────────────────────────────────────────────

export async function getTeamMember(
  tenantId: string,
  role: string,
): Promise<{ name: string; ghlUserId: string; email?: string } | null> {
  const pb = await loadPlaybook(tenantId);
  const members = pb?.team?.members ?? [];
  return members.find((m: any) => m.role === role) ?? null;
}

export async function getLmIds(tenantId: string): Promise<string[]> {
  const pb = await loadPlaybook(tenantId);
  return pb?.team?.routing?.lm_ids ?? [];
}

export async function getAmIds(tenantId: string): Promise<string[]> {
  const pb = await loadPlaybook(tenantId);
  return pb?.team?.routing?.am_ids ?? [];
}

export async function getDefaultAssignee(tenantId: string): Promise<string | null> {
  const pb = await loadPlaybook(tenantId);
  return pb?.team?.routing?.default_assignee ?? null;
}

export async function getEscalationUser(
  tenantId: string,
  level: 'yellow' | 'orange' | 'red',
): Promise<string | null> {
  const pb = await loadPlaybook(tenantId);
  const tiers = pb?.accountability?.tiers ?? [];
  const tier = tiers.find((t: any) => t.level === level);
  return tier?.notify_user ?? null;
}

// ─── SLA Helpers ────────────────────────────────────────────────────────────

export async function getSla(
  tenantId: string,
  key: string,
): Promise<number | null> {
  const pb = await loadPlaybook(tenantId);
  return pb?.sla?.[key] ?? null;
}

// ─── Drip Helpers ───────────────────────────────────────────────────────────

export async function getDripSchedule(
  tenantId: string,
): Promise<{ days: number[]; totalTouches: number; ghostedDay: number }> {
  const pb = await loadPlaybook(tenantId);
  const schedule = pb?.drip_schedule ?? {};
  return {
    days: schedule.days ?? [],
    totalTouches: schedule.total_touches ?? 24,
    ghostedDay: schedule.ghosted_check_day ?? 14,
  };
}

// ─── Communication Helpers ──────────────────────────────────────────────────

export async function getSendWindow(
  tenantId: string,
): Promise<{ start: string; end: string; fallbackTz: string; skipDays: string[] }> {
  const pb = await loadPlaybook(tenantId);
  const comm = pb?.communication ?? {};
  return {
    start: comm.send_window?.start ?? '09:00',
    end: comm.send_window?.end ?? '18:00',
    fallbackTz: comm.send_window?.fallback_timezone ?? 'America/Chicago',
    skipDays: comm.skip_days ?? ['Sunday'],
  };
}

// ─── AI Prompt Helpers ──────────────────────────────────────────────────────

export async function getAiPrompt(
  tenantId: string,
  promptKey: string,
): Promise<string | null> {
  const pb = await loadPlaybook(tenantId);
  return pb?.ai?.prompts?.[promptKey] ?? null;
}

export async function getAiConfig(
  tenantId: string,
): Promise<{ provider: string; model: string }> {
  const pb = await loadPlaybook(tenantId);
  return {
    provider: pb?.ai?.provider ?? 'gemini',
    model: pb?.ai?.model ?? 'gemini-1.5-flash',
  };
}

// ─── Trigger Helpers ────────────────────────────────────────────────────────

export async function getTriggersForStage(
  tenantId: string,
  stageId: string,
): Promise<string[]> {
  const pb = await loadPlaybook(tenantId);
  const triggers = pb?.crm?.triggers ?? {};
  for (const trigger of Object.values(triggers) as any[]) {
    if (trigger.stageId === stageId) {
      return trigger.fires ?? [];
    }
  }
  return [];
}

export async function getTriggersForEvent(
  tenantId: string,
  eventType: string,
): Promise<string[]> {
  const pb = await loadPlaybook(tenantId);
  const triggers = pb?.crm?.triggers ?? {};
  const agents: string[] = [];
  for (const trigger of Object.values(triggers) as any[]) {
    if (trigger.type === eventType) {
      agents.push(...(trigger.fires ?? []));
    }
  }
  return agents;
}

// ─── Follow-Up Helpers ──────────────────────────────────────────────────────

export async function getFollowUpBucket(
  tenantId: string,
  bucketKey: string,
): Promise<any | null> {
  const pb = await loadPlaybook(tenantId);
  return pb?.followUp?.buckets?.[bucketKey] ?? null;
}

export async function getFollowUpTones(tenantId: string): Promise<string[]> {
  const pb = await loadPlaybook(tenantId);
  return pb?.followUp?.tones ?? [];
}
