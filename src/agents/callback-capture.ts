/**
 * Callback Capture — pure orchestration.
 * Fires on: call.inbound
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { stageBot, taskBot, noteBot, tagBot, fieldBot, contactBot } from '../bots';
import { classifierBot } from '../bots/classifier';
import { templateBot } from '../bots/template';
import { schedulerBot } from '../bots/scheduler';

const AGENT_ID = 'callback-capture';

interface CallbackPlaybook {
  shortCallThresholdSec: number;
  lmTaskDueMinutes: number;
  warmStageId: string;
  appointmentStageId: string;
  dripCancelTag: string;
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
    auditLog({ agent: AGENT_ID, contactId, action: 'callback:skipped', result: 'skipped', reason: 'Call already processed' });
    return;
  }

  const disposition = classifierBot.classifyDisposition(event, playbook.shortCallThresholdSec);
  const duration = (event.raw?.duration as number) || 0;
  const notes = (event.raw?.notes as string) || '';
  const notesSnippet = notes ? `Notes: ${notes.slice(0, 300)}` : 'No notes captured.';

  await fieldBot(contactId, { last_processed_callback: callId });

  if (disposition === 'short-call') {
    await noteBot(contactId, templateBot.buildNote('callback:short-call', { duration: String(duration), notes: notesSnippet }));
  } else if (disposition === 'conversation') {
    await stageBot(contactId, playbook.warmStageId);
    await taskBot(contactId, {
      title: 'Seller called back — follow up NOW',
      body: `Inbound call ${duration}s. ${notes ? 'Notes: ' + notes.slice(0, 200) : 'Review call recording.'}`,
      dueDate: schedulerBot.dueIn(playbook.lmTaskDueMinutes),
      assignedTo: 'lm',
    });
    await noteBot(contactId, templateBot.buildNote('callback:conversation', { duration: String(duration), lmTaskDueMinutes: String(playbook.lmTaskDueMinutes), notes: notes ? `Notes: ${notes.slice(0, 300)}` : '' }));
  } else {
    await tagBot(contactId, [playbook.dripCancelTag]);
    await stageBot(contactId, playbook.appointmentStageId);
    await noteBot(contactId, templateBot.buildNote('callback:appointment', { duration: String(duration), notes: notes ? `Notes: ${notes.slice(0, 300)}` : '' }));
    await tagBot(contactId, ['callback-appointment']);
  }

  auditLog({ agent: AGENT_ID, contactId, action: `callback:${disposition}`, result: 'success', durationMs: Date.now() - start, metadata: { disposition, duration, callId } });
}
