/**
 * Under Contract Monitor Agent
 *
 * Fires on: cron (every 30 min) for contacts in UC stage
 * Does: routes unread seller messages by type
 *   Check-ins → AI auto-reply via smsBot
 *   Closing questions → TC task
 *   Concerns → AM task (30 min)
 *   Quiet 5+ days → proactive check-in SMS
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { loadPlaybook } from '../config/loader';
import { smsBot, taskBot } from '../bots';

const AGENT_ID = 'uc-monitor';

type MessageCategory = 'checkin' | 'closing_question' | 'concern' | 'other';

interface UCMessage {
  messageId: string;
  contactId: string;
  opportunityId: string;
  body: string;
  category?: MessageCategory;
  receivedAt: number;
}

async function classifyUCMessage(body: string): Promise<MessageCategory> {
  const { classifyUCMessage: classify } = await import('../intelligence/uc-classifier');
  return classify(body);
}

export async function runUCMonitor(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { tenantId } = event;
  const start = Date.now();
  const playbook = await loadPlaybook(tenantId);
  const am = playbook?.roles?.acquisitionManager ?? 'am';
  const tc = playbook?.roles?.transactionCoordinator ?? 'tc';
  const quietDays = playbook?.ucMonitor?.quietDaysThreshold ?? 5;

  const unreadMessages: UCMessage[] = event.metadata?.unreadMessages ?? [];
  const quietContacts: Array<{ contactId: string; opportunityId: string; daysSilent: number }> =
    event.metadata?.quietContacts ?? [];

  // Process unread messages
  for (const msg of unreadMessages) {
    const category = await classifyUCMessage(msg.body);

    if (!isDryRun()) {
      switch (category) {
        case 'checkin':
          await smsBot({
            contactId: msg.contactId,
            tenantId,
            templateKey: 'uc_auto_reply_checkin',
            context: { opportunityId: msg.opportunityId, inboundMessage: msg.body },
          });
          break;

        case 'closing_question':
          await taskBot({
            contactId: msg.contactId,
            opportunityId: msg.opportunityId,
            tenantId,
            title: `Closing question from seller: "${msg.body.slice(0, 80)}"`,
            assignTo: tc,
            dueMins: 120,
          });
          break;

        case 'concern':
          await taskBot({
            contactId: msg.contactId,
            opportunityId: msg.opportunityId,
            tenantId,
            title: `Seller concern in UC: "${msg.body.slice(0, 80)}"`,
            assignTo: am,
            dueMins: 30,
          });
          break;

        default:
          await taskBot({
            contactId: msg.contactId,
            opportunityId: msg.opportunityId,
            tenantId,
            title: `Unread UC message needs review: "${msg.body.slice(0, 80)}"`,
            assignTo: am,
            dueMins: 60,
          });
          break;
      }
    }

    auditLog({
      agent: AGENT_ID,
      contactId: msg.contactId,
      opportunityId: msg.opportunityId,
      action: `uc.message.${category}`,
      result: isDryRun() ? 'dry_run' : 'routed',
      durationMs: Date.now() - start,
    });
  }

  // Proactive check-in for quiet sellers
  for (const quiet of quietContacts) {
    if (quiet.daysSilent < quietDays) continue;

    // Guard: don't double-send check-in
    const guardKey = `uc_checkin_${quiet.contactId}_${Math.floor(Date.now() / 86400000)}`;
    if (event.metadata?.sentGuards?.includes(guardKey)) continue;

    if (!isDryRun()) {
      await smsBot({
        contactId: quiet.contactId,
        tenantId,
        templateKey: 'uc_proactive_checkin',
        context: { opportunityId: quiet.opportunityId, daysSilent: quiet.daysSilent },
      });
    }

    auditLog({
      agent: AGENT_ID,
      contactId: quiet.contactId,
      opportunityId: quiet.opportunityId,
      action: 'uc.proactive_checkin',
      result: `silent_${quiet.daysSilent}_days`,
      durationMs: Date.now() - start,
    });
  }
}
