/**
 * Lead Task Creator
 *
 * Fires on: lead.scored
 * Does: creates the initial call task for the LM via task-bot
 * Does NOT: anything else
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { taskBot } from '../bots/task';
import {
  getTaskTemplate,
  getSla,
  getFieldNames,
  getLmIds,
  getAmIds,
  getDefaultAssignee,
  renderTemplate,
} from '../config';

const AGENT_ID = 'lead-task-creator';

/** Resolve a role string ('lm' | 'am') to a GHL user ID via playbook routing. */
async function resolveAssignee(role: string, tenantId: string): Promise<string> {
  const defaultAssignee = (await getDefaultAssignee(tenantId)) ?? '';
  if (role === 'lm') {
    const ids = await getLmIds(tenantId);
    return ids[0] ?? defaultAssignee;
  }
  if (role === 'am') {
    const ids = await getAmIds(tenantId);
    return ids[0] ?? defaultAssignee;
  }
  return defaultAssignee;
}

export async function runLeadTaskCreator(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, tenantId, score, contact } = event;
  if (!score) return;

  const start = Date.now();

  const taskTemplate = await getTaskTemplate(tenantId, 'qualify_new_lead');
  if (!taskTemplate) return;

  const deadlineMinutes =
    taskTemplate.deadline_minutes ?? (await getSla(tenantId, 'lm_first_call_minutes')) ?? 30;
  const dueDate = new Date(Date.now() + deadlineMinutes * 60_000).toISOString();

  const cf = await getFieldNames(tenantId);
  const contactRecord = (contact as Record<string, any>) ?? {};
  const name = (contactRecord.firstName as string) ?? (contactRecord.name as string) ?? '';
  const address = ((contactRecord.customFields as Record<string, string>) ?? {})[cf.property_address] ?? '';

  const vars = { tier: score.tier, name, score: String(score.score), address };
  const assignedTo = await resolveAssignee(taskTemplate.assign_to, tenantId);

  await taskBot(contactId, {
    title: renderTemplate(taskTemplate.title, vars),
    body: renderTemplate(taskTemplate.body ?? '', vars),
    dueDate,
    assignedTo,
  });

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: 'lead:task-created',
    result: 'success',
    durationMs: Date.now() - start,
    metadata: { tier: score.tier, assignedTo },
  });
}
