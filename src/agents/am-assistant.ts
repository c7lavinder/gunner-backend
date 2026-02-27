/**
 * AM Assistant (Acquisition Manager)
 *
 * Fires on: call.completed for walkthrough or offer calls
 * Does: classifies outcome (no-show, accepted, pending, rejected), routes accordingly.
 * Routes: UC stage, Offer stage, bucket placement, AM follow-up task.
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { stageBot, taskBot, noteBot, tagBot } from '../bots';

const AGENT_ID = 'am-assistant';

type Outcome = 'no-show' | 'accepted' | 'pending' | 'rejected';

interface AMPlaybook {
  offerStageId: string;
  ucStageId: string;         // Under Contract
  followUp1MonthStageId: string;
  deadStageId: string;
  walkthroughStageIds: string[];
  offerCallStageIds: string[];
  amTaskDueHours: number;    // 24
}

/**
 * Classify call outcome from call data.
 * TODO: replace with AI classification from transcript.
 */
function classifyOutcome(event: GunnerEvent): Outcome {
  const duration = (event.raw?.duration as number) || 0;
  const disposition = ((event.raw?.disposition as string) || '').toLowerCase();
  const notes = ((event.raw?.notes as string) || '').toLowerCase();

  // No-show: very short call or explicit disposition
  if (duration < 30 || disposition.includes('no-show') || disposition.includes('no answer')) {
    return 'no-show';
  }

  // Accepted: disposition or notes indicate acceptance
  if (disposition.includes('accepted') || notes.includes('accepted') || notes.includes('signed')) {
    return 'accepted';
  }

  // Rejected: explicit rejection
  if (disposition.includes('rejected') || notes.includes('not interested') || notes.includes('declined')) {
    return 'rejected';
  }

  // Default: pending (needs follow-up)
  return 'pending';
}

export async function runAMAssistant(
  event: GunnerEvent,
  playbook: AMPlaybook
): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, stageId } = event;
  const start = Date.now();

  // Guard: only process walkthrough or offer call stages
  const isWalkthrough = stageId && playbook.walkthroughStageIds.includes(stageId);
  const isOfferCall = stageId && playbook.offerCallStageIds.includes(stageId);
  if (!isWalkthrough && !isOfferCall) return;

  const outcome = classifyOutcome(event);
  const callType = isWalkthrough ? 'walkthrough' : 'offer-call';

  switch (outcome) {
    case 'accepted':
      await stageBot(contactId, playbook.ucStageId);
      await noteBot(contactId, `✅ Offer ACCEPTED after ${callType}. Moved to Under Contract.`);
      await tagBot(contactId, 'offer-accepted');
      break;

    case 'no-show':
      // Create reschedule task
      const rescheduleDue = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2h
      await taskBot(contactId, {
        title: `${callType.toUpperCase()} no-show — reschedule`,
        description: `Seller did not show for ${callType}. Attempt to reschedule.`,
        dueDate: rescheduleDue.toISOString(),
        assignedTo: 'am',
      });
      await noteBot(contactId, `❌ No-show for ${callType}. Reschedule task created.`);
      await tagBot(contactId, 'no-show');
      break;

    case 'rejected':
      await stageBot(contactId, playbook.followUp1MonthStageId);
      await noteBot(contactId, `🚫 Offer REJECTED after ${callType}. Moved to 1-month follow-up.`);
      await tagBot(contactId, 'offer-rejected');
      break;

    case 'pending':
      // Walkthrough with no same-day offer → AM task 24h
      if (isWalkthrough) {
        await stageBot(contactId, playbook.offerStageId);
        const offerDue = new Date(Date.now() + playbook.amTaskDueHours * 60 * 60 * 1000);
        await taskBot(contactId, {
          title: 'Walkthrough complete — send offer',
          description: `Walkthrough done, no same-day offer. Prepare and send offer within ${playbook.amTaskDueHours}h.`,
          dueDate: offerDue.toISOString(),
          assignedTo: 'am',
        });
        await noteBot(contactId, `🏠 Walkthrough complete. Pending offer. AM task created (${playbook.amTaskDueHours}h).`);
      } else {
        // Offer call pending — follow-up task
        const followUpDue = new Date(Date.now() + playbook.amTaskDueHours * 60 * 60 * 1000);
        await taskBot(contactId, {
          title: 'Offer call — seller thinking. Follow up.',
          description: `Offer presented, seller wants time. Follow up within ${playbook.amTaskDueHours}h.`,
          dueDate: followUpDue.toISOString(),
          assignedTo: 'am',
        });
        await noteBot(contactId, `⏳ Offer pending after offer call. AM follow-up task created.`);
      }
      break;
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
