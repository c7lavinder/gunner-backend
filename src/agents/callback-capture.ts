/**
 * Callback Capture
 *
 * Fires on: call.inbound (seller calls back)
 * Does: classify call disposition, delegate to named handler.
 * Short call → note. Real conversation → LM task (30 min).
 * Appointment set → cancel drip, confirm, move stage.
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { stageBot, taskBot, noteBot, tagBot, fieldBot, contactBot } from '../bots';

const AGENT_ID = 'callback-capture';

interface CallbackPlaybook {
  shortCallThresholdSec: number;  // e.g. 60
  lmTaskDueMinutes: number;       // 30
  warmStageId: string;
  appointmentStageId: string;
  dripCancelTag: string;          // tag that signals drip cancellation
}

type Disposition = 'short-call' | 'conversation' | 'appointment';

/**
 * Classify call disposition — mirrors LM Assistant logic.
 * TODO: replace with AI transcript analysis.
 */
function classifyDisposition(event: GunnerEvent, thresholdSec: number): Disposition {
  const duration = (event.raw?.duration as number) || 0;
  const notes = ((event.raw?.notes as string) || '').toLowerCase();
  const disposition = ((event.raw?.disposition as string) || '').toLowerCase();

  if (
    notes.includes('appointment') ||
    notes.includes('walkthrough') ||
    notes.includes('scheduled') ||
    disposition.includes('appointment')
  ) {
    return 'appointment';
  }

  if (duration < thresholdSec) return 'short-call';

  return 'conversation';
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleShortCall(
  contactId: string,
  duration: number,
  notes: string
): Promise<void> {
  await noteBot(contactId, [
    `📞 Inbound callback (${duration}s) — short call.`,
    notes ? `Notes: ${notes.slice(0, 300)}` : 'No notes captured.',
  ].join('\n'));
}

async function handleConversation(
  contactId: string,
  duration: number,
  notes: string,
  playbook: CallbackPlaybook
): Promise<void> {
  await stageBot(contactId, playbook.warmStageId);

  const taskDue = new Date(Date.now() + playbook.lmTaskDueMinutes * 60 * 1000);
  await taskBot(contactId, {
    title: 'Seller called back — follow up NOW',
    description: `Inbound call ${duration}s. ${notes ? 'Notes: ' + notes.slice(0, 200) : 'Review call recording.'}`,
    dueDate: taskDue.toISOString(),
    assignedTo: 'lm',
  });

  await noteBot(contactId, [
    `📞 Inbound callback (${duration}s) — real conversation.`,
    `Moved to Warm. LM task created (${playbook.lmTaskDueMinutes}min).`,
    notes ? `Notes: ${notes.slice(0, 300)}` : '',
  ].filter(Boolean).join('\n'));
}

async function handleAppointment(
  contactId: string,
  duration: number,
  notes: string,
  playbook: CallbackPlaybook
): Promise<void> {
  await tagBot(contactId, playbook.dripCancelTag);
  await stageBot(contactId, playbook.appointmentStageId);
  await noteBot(contactId, [
    `📞 Inbound callback (${duration}s) — APPOINTMENT SET.`,
    `Drip cancelled. Moved to appointment stage.`,
    notes ? `Notes: ${notes.slice(0, 300)}` : '',
  ].filter(Boolean).join('\n'));
  await tagBot(contactId, 'callback-appointment');
}

// ── Router ────────────────────────────────────────────────────────────────────

export async function runCallbackCapture(
  event: GunnerEvent,
  playbook: CallbackPlaybook
): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;
  if (event.kind !== 'call.inbound') return;

  const callId = event.callId || (event.raw?.callId as string);
  if (!callId) return;

  const { contactId } = event;
  const start = Date.now();

  // Idempotency — skip if we already processed this call
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

  // Mark call as processed before delegating
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
