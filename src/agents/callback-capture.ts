/**
 * Callback Capture
 *
 * Fires on: call.inbound (seller calls back)
 * Does: same disposition analysis as LM Assistant.
 * Short call → note. Real conversation → LM task (30 min).
 * Appointment set → cancel drip, confirm, move stage.
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { stageBot, taskBot, noteBot, tagBot, fieldBot } from '../bots';

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

  // Appointment keywords
  if (
    notes.includes('appointment') ||
    notes.includes('walkthrough') ||
    notes.includes('scheduled') ||
    disposition.includes('appointment')
  ) {
    return 'appointment';
  }

  // Short call
  if (duration < thresholdSec) return 'short-call';

  // Real conversation
  return 'conversation';
}

export async function runCallbackCapture(
  event: GunnerEvent,
  playbook: CallbackPlaybook
): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId } = event;
  const start = Date.now();

  // Guard: must be an inbound call
  if (event.kind !== 'call.inbound') return;

  // Guard: idempotency — check if we already processed this call
  const callId = event.callId || (event.raw?.callId as string);
  if (!callId) return;

  const contact = await (await import('../bots')).contactBot(contactId) as Record<string, any>;
  const lastProcessedCall = contact.customFields?.last_processed_callback;
  if (lastProcessedCall === callId) {
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

  // Mark call as processed
  await fieldBot(contactId, { last_processed_callback: callId });

  switch (disposition) {
    case 'short-call':
      await noteBot(contactId, [
        `📞 Inbound callback (${duration}s) — short call.`,
        notes ? `Notes: ${notes.slice(0, 300)}` : 'No notes captured.',
      ].join('\n'));
      break;

    case 'conversation':
      // Real conversation → LM task 30 min
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
      break;

    case 'appointment':
      // Cancel drip, move to appointment stage
      await tagBot(contactId, playbook.dripCancelTag);
      await stageBot(contactId, playbook.appointmentStageId);
      await noteBot(contactId, [
        `📞 Inbound callback (${duration}s) — APPOINTMENT SET.`,
        `Drip cancelled. Moved to appointment stage.`,
        notes ? `Notes: ${notes.slice(0, 300)}` : '',
      ].filter(Boolean).join('\n'));
      await tagBot(contactId, 'callback-appointment');
      break;
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
