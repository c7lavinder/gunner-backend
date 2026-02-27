/**
 * Initial Outreach Agent
 *
 * Fires on: lead.new
 * Does: composes and sends the first AI-written SMS to a new lead from the LM's phone number.
 * Does NOT: template blast — every message is personalized to the individual.
 *
 * Rules:
 *   - Enforces send window from playbook.communication.send_window in the lead's timezone
 *   - Tone shifts by time of day: morning / afternoon / evening / overnight
 *   - Includes company name only for inbound leads (they came to us — we reinforce the brand)
 *   - Idempotent: skips if initial_sms_sent is already set on the contact
 *   - Uses smsBot for delivery, contactBot for lead data, fieldBot to mark sent, noteBot to log
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { smsBot } from '../bots/sms';
import { contactBot } from '../bots/contact';
import { fieldBot } from '../bots/field';
import { noteBot } from '../bots/note';
import { loadPlaybook } from '../config/loader';
import { aiWriterBot } from '../bots/ai-writer';
import { classifierBot } from '../bots/classifier';
import { templateBot } from '../bots/template';
import { schedulerBot } from '../bots/scheduler';
import { memoryWriterBot } from '../bots/memory-writer';

const AGENT_ID = 'initial-outreach';

type TimeTone = 'morning' | 'afternoon' | 'evening' | 'overnight';

const SMS_SYSTEM_PROMPT = `You are a real estate acquisitions rep writing an opening SMS. Rules: under 160 characters, no exclamation marks, sound like a real person not a script, no links or phone numbers. Output only the SMS text.`;

const SMS_FALLBACK = `Hey, saw you might be interested in selling — happy to chat whenever works for you.`;

export async function runInitialOutreach(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  try {
    const { contactId, opportunityId, tenantId } = event;
    const start = Date.now();
    const playbook = await loadPlaybook(tenantId);

    const contact = await contactBot(contactId).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'contactBot:failed', result: 'error', reason: err?.message });
      return null;
    });

    if (!contact) return;

    const cf = playbook.customFields;
    const alreadySent = ((contact.customFields as Record<string, string>) || {})[cf.initial_sms_sent];
    if (alreadySent) {
      auditLog({
        agent: AGENT_ID,
        contactId,
        opportunityId,
        action: 'outreach:skipped',
        result: 'skipped',
        reason: 'initial_sms_sent already set',
        durationMs: Date.now() - start,
      });
      return;
    }

    const localHour = schedulerBot.getLeadLocalHour(contact);
    if (!schedulerBot.isInLeadSendWindow(localHour, playbook)) {
      auditLog({
        agent: AGENT_ID,
        contactId,
        opportunityId,
        action: 'outreach:skipped',
        result: 'skipped',
        reason: `outside-send-window (lead local hour: ${localHour})`,
        durationMs: Date.now() - start,
      });
      return;
    }

    const tone = schedulerBot.getTimeTone(localHour);
    const inbound = classifierBot.isInboundLead(contact, playbook);
    const companyName = playbook.company?.name ?? 'our company';

    const prompt = templateBot.buildInitialOutreachPrompt(contact, tone, inbound, companyName, playbook);
    let message: string;
    try {
      const text = await aiWriterBot.writeText(prompt, SMS_SYSTEM_PROMPT);
      message = text.trim().replace(/^["']|["']$/g, '') || SMS_FALLBACK;
    } catch (err) {
      auditLog({ agent: AGENT_ID, contactId, action: 'aiWriterBot:failed', result: 'error', reason: (err as Error)?.message });
      message = SMS_FALLBACK;
    }

    if (!isDryRun()) {
      await smsBot(contactId, message).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'smsBot:failed', result: 'error', reason: err?.message });
      });

      await fieldBot(contactId, {
        [cf.initial_sms_sent]: new Date().toISOString(),
      }).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'fieldBot:failed', result: 'error', reason: err?.message });
      });

      await noteBot(contactId, `[initial-outreach] First SMS sent (tone: ${tone}, inbound: ${inbound}):\n\n${message}`).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'noteBot:failed', result: 'error', reason: err?.message });
      });
    }

    const defaultLM = playbook.team.routing.default_assignee;

    await memoryWriterBot.recordAction('sms-performance', { contactId, tone, inbound, localHour }, { message, sentAt: Date.now() }, tenantId).catch((err) => {
      auditLog({ agent: AGENT_ID, contactId, action: 'memoryWriterBot:failed', result: 'error', reason: (err as Error)?.message });
    });

    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'outreach:sent',
      result: isDryRun() ? 'skipped' : 'success',
      reason: isDryRun() ? 'dry-run' : undefined,
      durationMs: Date.now() - start,
      metadata: {
        tone,
        inbound,
        localHour,
        messageLength: message.length,
        lmUserId: defaultLM,
      },
    });
  } catch (err: any) {
    auditLog({ agent: AGENT_ID, contactId: event.contactId, action: 'agent:crashed', result: 'error', reason: err?.message });
  }
}
