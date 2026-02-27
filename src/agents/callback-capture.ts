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

  try {
    const { contactId } = event;
    const start = Date.now();

    const contact = await contactBot(contactId).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'contactBot:failed', result: 'error', reason: err?.message });
      return null;
    }) as Record<string, any> | null;

    if (!contact) return;

    if (contact.customFields?.last_processed_callback === callId) {
      auditLog({ agent: AGENT_ID, contactId, action: 'callback:skipped', result: 'skipped', reason: 'Call already processed' });
      return;
    }

    const disposition = classifierBot.classifyDisposition(event, playbook.shortCallThresholdSec);
    const duration = (event.raw?.duration as number) || 0;
    const notes = (event.raw?.notes as string) || '';
    const notesSnippet = notes ? `Notes: ${notes.slice(0, 300)}` : 'No notes captured.';

    await fieldBot(contactId, { last_processed_callback: callId }).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'fieldBot:failed', result: 'error', reason: err?.message });
    });

    if (disposition === 'short-call') {
      await noteBot(contactId, templateBot.buildNote('callback:short-call', { duration: String(duration), notes: notesSnippet })).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'noteBot:failed', result: 'error', reason: err?.message });
      });
    } else if (disposition === 'conversation') {
      await stageBot(contactId, playbook.warmStageId).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'stageBot:failed', result: 'error', reason: err?.message });
      });
      await taskBot(contactId, {
        title: 'Seller called back — follow up NOW',
        body: `Inbound call ${duration}s. ${notes ? 'Notes: ' + notes.slice(0, 200) : 'Review call recording.'}`,
        dueDate: schedulerBot.dueIn(playbook.lmTaskDueMinutes),
        assignedTo: 'lm',
      }).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'taskBot:failed', result: 'error', reason: err?.message });
      });
      await noteBot(contactId, templateBot.buildNote('callback:conversation', { duration: String(duration), lmTaskDueMinutes: String(playbook.lmTaskDueMinutes), notes: notes ? `Notes: ${notes.slice(0, 300)}` : '' })).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'noteBot:failed', result: 'error', reason: err?.message });
      });
    } else {
      await tagBot(contactId, [playbook.dripCancelTag]).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'tagBot:failed', result: 'error', reason: err?.message });
      });
      await stageBot(contactId, playbook.appointmentStageId).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'stageBot:failed', result: 'error', reason: err?.message });
      });
      await noteBot(contactId, templateBot.buildNote('callback:appointment', { duration: String(duration), notes: notes ? `Notes: ${notes.slice(0, 300)}` : '' })).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'noteBot:failed', result: 'error', reason: err?.message });
      });
      await tagBot(contactId, ['callback-appointment']).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'tagBot:failed', result: 'error', reason: err?.message });
      });
    }

    auditLog({ agent: AGENT_ID, contactId, action: `callback:${disposition}`, result: 'success', durationMs: Date.now() - start, metadata: { disposition, duration, callId } });
  } catch (err: any) {
    auditLog({ agent: AGENT_ID, contactId: event.contactId, action: 'agent:crashed', result: 'error', reason: err?.message });
  }
}
