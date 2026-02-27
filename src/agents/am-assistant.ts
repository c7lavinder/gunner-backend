/**
 * AM Assistant — pure orchestration.
 * Fires on: call.completed for walkthrough or offer calls
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { stageBot, taskBot, noteBot, tagBot } from '../bots';
import { classifierBot } from '../bots/classifier';
import { templateBot } from '../bots/template';
import { schedulerBot } from '../bots/scheduler';

const AGENT_ID = 'am-assistant';

type CallType = 'walkthrough' | 'offer-call';

interface AMPlaybook {
  offerStageId: string;
  ucStageId: string;
  followUp1MonthStageId: string;
  deadStageId: string;
  walkthroughStageIds: string[];
  offerCallStageIds: string[];
  amTaskDueHours: number;
}

export async function runAMAssistant(event: GunnerEvent, playbook: AMPlaybook): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  try {
    const { contactId, stageId } = event;
    const start = Date.now();

    const isWalkthrough = stageId && playbook.walkthroughStageIds.includes(stageId);
    const isOfferCall = stageId && playbook.offerCallStageIds.includes(stageId);
    if (!isWalkthrough && !isOfferCall) return;

    const outcome = classifierBot.classifyOutcome(event);
    const callType: CallType = isWalkthrough ? 'walkthrough' : 'offer-call';

    switch (outcome) {
      case 'accepted':
        await stageBot(contactId, playbook.ucStageId).catch(err => {
          auditLog({ agent: AGENT_ID, contactId, action: 'stageBot:failed', result: 'error', reason: err?.message });
        });
        await noteBot(contactId, templateBot.buildNote('am:accepted', { callType })).catch(err => {
          auditLog({ agent: AGENT_ID, contactId, action: 'noteBot:failed', result: 'error', reason: err?.message });
        });
        await tagBot(contactId, ['offer-accepted']).catch(err => {
          auditLog({ agent: AGENT_ID, contactId, action: 'tagBot:failed', result: 'error', reason: err?.message });
        });
        break;
      case 'no-show':
        await taskBot(contactId, {
          title: `${callType.toUpperCase()} no-show — reschedule`,
          body: `Seller did not show for ${callType}. Attempt to reschedule.`,
          dueDate: schedulerBot.dueInHours(2),
          assignedTo: 'am',
        }).catch(err => {
          auditLog({ agent: AGENT_ID, contactId, action: 'taskBot:failed', result: 'error', reason: err?.message });
        });
        await noteBot(contactId, templateBot.buildNote('am:no-show', { callType })).catch(err => {
          auditLog({ agent: AGENT_ID, contactId, action: 'noteBot:failed', result: 'error', reason: err?.message });
        });
        await tagBot(contactId, ['no-show']).catch(err => {
          auditLog({ agent: AGENT_ID, contactId, action: 'tagBot:failed', result: 'error', reason: err?.message });
        });
        break;
      case 'rejected':
        await stageBot(contactId, playbook.followUp1MonthStageId).catch(err => {
          auditLog({ agent: AGENT_ID, contactId, action: 'stageBot:failed', result: 'error', reason: err?.message });
        });
        await noteBot(contactId, templateBot.buildNote('am:rejected', { callType })).catch(err => {
          auditLog({ agent: AGENT_ID, contactId, action: 'noteBot:failed', result: 'error', reason: err?.message });
        });
        await tagBot(contactId, ['offer-rejected']).catch(err => {
          auditLog({ agent: AGENT_ID, contactId, action: 'tagBot:failed', result: 'error', reason: err?.message });
        });
        break;
      case 'pending':
        if (callType === 'walkthrough') {
          await stageBot(contactId, playbook.offerStageId).catch(err => {
            auditLog({ agent: AGENT_ID, contactId, action: 'stageBot:failed', result: 'error', reason: err?.message });
          });
          await taskBot(contactId, {
            title: 'Walkthrough complete — send offer',
            body: `Walkthrough done, no same-day offer. Prepare and send offer within ${playbook.amTaskDueHours}h.`,
            dueDate: schedulerBot.dueInHours(playbook.amTaskDueHours),
            assignedTo: 'am',
          }).catch(err => {
            auditLog({ agent: AGENT_ID, contactId, action: 'taskBot:failed', result: 'error', reason: err?.message });
          });
        } else {
          await taskBot(contactId, {
            title: 'Offer call — seller thinking. Follow up.',
            body: `Offer presented, seller wants time. Follow up within ${playbook.amTaskDueHours}h.`,
            dueDate: schedulerBot.dueInHours(playbook.amTaskDueHours),
            assignedTo: 'am',
          }).catch(err => {
            auditLog({ agent: AGENT_ID, contactId, action: 'taskBot:failed', result: 'error', reason: err?.message });
          });
        }
        await noteBot(contactId, templateBot.buildNote('am:pending', { callType })).catch(err => {
          auditLog({ agent: AGENT_ID, contactId, action: 'noteBot:failed', result: 'error', reason: err?.message });
        });
        break;
    }

    auditLog({ agent: AGENT_ID, contactId, action: `${callType}:${outcome}`, result: 'success', durationMs: Date.now() - start, metadata: { outcome, callType, stageId } });
  } catch (err: any) {
    auditLog({ agent: AGENT_ID, contactId: event.contactId, action: 'agent:crashed', result: 'error', reason: err?.message });
  }
}
