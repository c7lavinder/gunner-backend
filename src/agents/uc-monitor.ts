/**
 * Under Contract Monitor Agent — pure orchestration.
 * Fires on: cron (every 30 min) for contacts in UC stage
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { loadPlaybook } from '../config';
import { smsBot, taskBot } from '../bots';
import { classifierBot } from '../bots/classifier';
import { schedulerBot } from '../bots/scheduler';

const AGENT_ID = 'uc-monitor';

interface UCMessage {
  messageId: string;
  contactId: string;
  opportunityId: string;
  body: string;
  receivedAt: number;
}

export async function runUCMonitor(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { tenantId } = event;
  const start = Date.now();
  const playbook = await loadPlaybook(tenantId);
  const am = playbook?.roles?.acquisitionManager ?? 'am';
  const tc = playbook?.roles?.transactionCoordinator ?? 'tc';
  const quietDays = playbook?.ucMonitor?.quietDaysThreshold ?? 5;

  const unreadMessages: UCMessage[] = (event.metadata?.unreadMessages as UCMessage[]) ?? [];
  const quietContacts: Array<{ contactId: string; opportunityId: string; daysSilent: number }> =
    (event.metadata?.quietContacts as Array<{ contactId: string; opportunityId: string; daysSilent: number }>) ?? [];

  for (const msg of unreadMessages) {
    const category = await classifierBot.classifyUCMessage(msg.body);

    if (!isDryRun()) {
      switch (category) {
        case 'checkin':
          await smsBot(msg.contactId, `Thanks for checking in! Everything is moving along. We'll keep you posted.`);
          break;
        case 'closing_question':
          await taskBot(msg.contactId, { title: `Closing question from seller: "${msg.body.slice(0, 80)}"`, assignedTo: tc, dueDate: schedulerBot.dueIn(120) });
          break;
        case 'concern':
          await taskBot(msg.contactId, { title: `Seller concern in UC: "${msg.body.slice(0, 80)}"`, assignedTo: am, dueDate: schedulerBot.dueIn(30) });
          break;
        default:
          await taskBot(msg.contactId, { title: `Unread UC message needs review: "${msg.body.slice(0, 80)}"`, assignedTo: am, dueDate: schedulerBot.dueIn(60) });
          break;
      }
    }

    auditLog({ agent: AGENT_ID, contactId: msg.contactId, opportunityId: msg.opportunityId, action: `uc.message.${category}`, result: 'success', durationMs: Date.now() - start });
  }

  for (const quiet of quietContacts) {
    if (quiet.daysSilent < quietDays) continue;

    if (!isDryRun()) {
      await smsBot(quiet.contactId, `Hey, just checking in on things. Everything still on track? Let us know if you need anything.`);
    }

    auditLog({ agent: AGENT_ID, contactId: quiet.contactId, opportunityId: quiet.opportunityId, action: 'uc.proactive_checkin', result: 'success', metadata: { daysSilent: quiet.daysSilent }, durationMs: Date.now() - start });
  }
}
