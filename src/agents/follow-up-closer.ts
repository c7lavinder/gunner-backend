/**
 * Follow-Up Closer — pure orchestration.
 * Fires on: inbound.message from follow-up stage contact
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { stageBot, taskBot, noteBot, tagBot } from '../bots';
import { classifierBot } from '../bots/classifier';
import { templateBot } from '../bots/template';
import { schedulerBot } from '../bots/scheduler';

const AGENT_ID = 'follow-up-closer';

interface CloserPlaybook {
  warmStageId: string;
  lmTaskDueMinutes: number;
  reEngagementTag: string;
  followUpStageIds: string[];
}

export async function runFollowUpCloser(event: GunnerEvent, playbook: CloserPlaybook): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  try {
    const { contactId, stageId } = event;
    const start = Date.now();

    if (!stageId || !playbook.followUpStageIds.includes(stageId)) return;

    const messageBody = (event.raw?.body as string) || '';

    if (!classifierBot.detectInterest(messageBody)) {
      auditLog({ agent: AGENT_ID, contactId, action: 'interest:none', result: 'skipped', reason: 'No interest keywords detected' });
      return;
    }

    await stageBot(contactId, playbook.warmStageId).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'stageBot:failed', result: 'error', reason: err?.message });
    });
    await taskBot(contactId, {
      title: 'Follow-up lead re-engaged — call NOW',
      body: `Lead responded with interest from follow-up. Message: "${messageBody.slice(0, 200)}"`,
      dueDate: schedulerBot.dueIn(playbook.lmTaskDueMinutes),
      assignedTo: 'lm',
    }).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'taskBot:failed', result: 'error', reason: err?.message });
    });
    await noteBot(contactId, templateBot.buildNote('followup:re-engaged', {
      fromStage: event.stageName || stageId,
      message: messageBody.slice(0, 300),
      lmTaskDueMinutes: String(playbook.lmTaskDueMinutes),
    })).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'noteBot:failed', result: 'error', reason: err?.message });
    });
    await tagBot(contactId, [playbook.reEngagementTag]).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'tagBot:failed', result: 'error', reason: err?.message });
    });

    auditLog({ agent: AGENT_ID, contactId, action: 'lead:re-engaged', result: 'success', durationMs: Date.now() - start, metadata: { fromStage: event.stageName, messageSnippet: messageBody.slice(0, 100) } });
  } catch (err: any) {
    auditLog({ agent: AGENT_ID, contactId: event.contactId, action: 'agent:crashed', result: 'error', reason: err?.message });
  }
}
