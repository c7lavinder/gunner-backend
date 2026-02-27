/**
 * AM Assistant (Acquisition Manager)
 *
 * Fires on: call.completed for walkthrough or offer calls
 * Does: classifies outcome, routes accordingly.
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { stageBot, taskBot, noteBot, tagBot } from '../bots';
import { getTag } from '../config/helpers';

const AGENT_ID = 'am-assistant';

type Outcome = 'no-show' | 'accepted' | 'pending' | 'rejected';
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

function classifyOutcome(event: GunnerEvent): Outcome {
  const duration = (event.raw?.duration as number) || 0;
  const disposition = ((event.raw?.disposition as string) || '').toLowerCase();
  const notes = ((event.raw?.notes as string) || '').toLowerCase();

  if (duration < 30 || disposition.includes('no-show') || disposition.includes('no answer')) return 'no-show';
  if (disposition.includes('accepted') || notes.includes('accepted') || notes.includes('signed')) return 'accepted';
  if (disposition.includes('rejected') || notes.includes('not interested') || notes.includes('declined')) return 'rejected';
  return 'pending';
}

async function handleAccepted(contactId: string, callType: CallType, playbook: AMPlaybook) {
  await stageBot(contactId, playbook.ucStageId);
  await noteBot(contactId, `Offer ACCEPTED after ${callType}. Moved to Under Contract.`);
  await tagBot(contactId, ['offer-accepted']);
}

async function handleNoShow(contactId: string, callType: CallType) {
  const due = new Date(Date.now() + 2 * 60 * 60 * 1000);
  await taskBot(contactId, {
    title: `${callType.toUpperCase()} no-show — reschedule`,
    body: `Seller did not show for ${callType}. Attempt to reschedule.`,
    dueDate: due.toISOString(),
    assignedTo: 'am',
  });
  await noteBot(contactId, `No-show for ${callType}. Reschedule task created.`);
  await tagBot(contactId, ['no-show']);
}

async function handleRejected(contactId: string, callType: CallType, playbook: AMPlaybook) {
  await stageBot(contactId, playbook.followUp1MonthStageId);
  await noteBot(contactId, `Offer REJECTED after ${callType}. Moved to 1-month follow-up.`);
  await tagBot(contactId, ['offer-rejected']);
}

async function handlePending(contactId: string, callType: CallType, playbook: AMPlaybook) {
  const due = new Date(Date.now() + playbook.amTaskDueHours * 60 * 60 * 1000);

  if (callType === 'walkthrough') {
    await stageBot(contactId, playbook.offerStageId);
    await taskBot(contactId, {
      title: 'Walkthrough complete — send offer',
      body: `Walkthrough done, no same-day offer. Prepare and send offer within ${playbook.amTaskDueHours}h.`,
      dueDate: due.toISOString(),
      assignedTo: 'am',
    });
    await noteBot(contactId, `Walkthrough complete. Pending offer. AM task created (${playbook.amTaskDueHours}h).`);
  } else {
    await taskBot(contactId, {
      title: 'Offer call — seller thinking. Follow up.',
      body: `Offer presented, seller wants time. Follow up within ${playbook.amTaskDueHours}h.`,
      dueDate: due.toISOString(),
      assignedTo: 'am',
    });
    await noteBot(contactId, `Offer pending after offer call. AM follow-up task created.`);
  }
}

export async function runAMAssistant(
  event: GunnerEvent,
  playbook: AMPlaybook
): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, stageId } = event;
  const start = Date.now();

  const isWalkthrough = stageId && playbook.walkthroughStageIds.includes(stageId);
  const isOfferCall = stageId && playbook.offerCallStageIds.includes(stageId);
  if (!isWalkthrough && !isOfferCall) return;

  const outcome = classifyOutcome(event);
  const callType: CallType = isWalkthrough ? 'walkthrough' : 'offer-call';

  switch (outcome) {
    case 'accepted': await handleAccepted(contactId, callType, playbook); break;
    case 'no-show':  await handleNoShow(contactId, callType); break;
    case 'rejected': await handleRejected(contactId, callType, playbook); break;
    case 'pending':  await handlePending(contactId, callType, playbook); break;
  }

  auditLog({
    agent: AGENT_ID,
    contactId,
    action: `${callType}:${outcome}`,
    result: 'success',
    durationMs: Date.now() - start,
    metadata: { outcome, callType, stageId },
  });
}
