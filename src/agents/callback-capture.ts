/**
 * Callback Capture
 *
 * Fires on: call.inbound (seller calls back)
 * Does: classify call disposition, delegate to named handler.
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { stageBot, taskBot, noteBot, tagBot, fieldBot, contactBot } from '../bots';
import { getTag, getFieldName } from '../config/helpers';

const AGENT_ID = 'callback-capture';

interface CallbackPlaybook {
  shortCallThresholdSec: number;
  lmTaskDueMinutes: number;
  warmStageId: string;
  appointmentStageId: string;
  dripCancelTag: string;
}

type Disposition = 'short-call' | 'conversation' | 'appointment';

function classifyDisposition(event: GunnerEvent, thresholdSec: number): Disposition {
  const duration = (event.raw?.duration as number) || 0;
  const notes = ((event.raw?.notes as string) || '').toLowerCase();
  const disposition = ((event.raw?.disposition as string) || '').toLowerCase();

  if (
    notes.includes('appointment') ||
    notes.includes('walkthrough') ||
    notes.includes('scheduled') ||
    disposition.includes('appointment')
  ) return 'appointment';

  if (duration < thresholdSec) return 'short-call';
  return 'conversation';
}

async function handleShortCall(contactId: string, duration: number, notes: string): Promise<void> {
  await noteBot(contactId, [
    `📞 Inbound callback (${duration}s) — short call.`,
    notes ? `Notes: ${notes.slice(0, 300)}` : 'No notes captured.',
  ].join('\n'));
}

async function handleConversation(contactId: string, duration: number, notes: string, playbook: CallbackPlaybook): Promise<void> {
  await stageBot(contactId, playbook.warmStageId);
  const taskDue = new Date(Date.now() + playbook.lmTaskDueMinutes * 60 * 1000);
  await taskBot(contactId, {
    title: 'Seller called back — follow up NOW',
    body: `Inbound call ${duration}s. ${notes ? 'Notes: ' + notes.slice(0, 200) : 'Review call recording.'}`,
    dueDate: taskDue.toISOString(),
    assignedTo: 'lm',
  });
  await noteBot(contactId, [
    `📞 Inbound callback (${duration}s) — real conversation.`,
    `Moved to Warm. LM task created (${playbook.lmTaskDueMinutes}min).`,
    notes ? `Notes: ${notes.slice(0, 300)}` : '',
  ].filter(Boolean).join('\n'));
}

async function handleAppointment(contactId: string, duration: number, notes: string, playbook: CallbackPlaybook): Promise<void> {
  await tagBot(contactId, [playbook.dripCancelTag]);
  await stageBot(contactId, playbook.appointmentStageId);
  await noteBot(contactId, [
    `📞 Inbound callback (${duration}s) — APPOINTMENT SET.`,
    `Drip cancelled. Moved to appointment stage.`,
    notes ? `Notes: ${notes.slice(0, 300)}` : '',
  ].filter(Boolean).join('\n'));
  await tagBot(contactId, ['callback-appointment']);
}

export async function runCallbackCapture(event: GunnerEvent, playbook: CallbackPlaybook): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;
  if (event.kind !== 'call.inbound') return;

  const callId = event.callId || (event.raw?.callId as string);
  if (!callId) return;

  const { contactId } = event;
  const start = Date.now();

  const contact = await contactBot(contactId) as Record<string, any>;
  if (contact.customFields?.last_processed_callback === callId) {
    auditLog({
      agent: AGENT_ID,
      contactId,
      action: 'callback:skipped',
      result: 'skipped',
      reason: 'Call already processed',
    });
    return;
  }

  const disposition = classifyDisposition(event, playbook.shortCallThresholdSec);
  const duration = (event.raw?.duration as number) || 0;
  const notes = (event.raw?.notes as string) || '';

  await fieldBot(contactId, { last_processed_callback: callId });

  if (disposition === 'short-call') {
    await handleShortCall(contactId, duration, notes);
  } else if (disposition === 'conversation') {
    await handleConversation(contactId, duration, notes, playbook);
  } else {
    await handleAppointment(contactId, duration, notes, playbook);
  }

  auditLog({
    agent: AGENT_ID,
    contactId,
    action: `callback:${disposition}`,
    result: 'success',
    durationMs: Date.now() - start,
    metadata: { disposition, duration, callId },
  });
}
