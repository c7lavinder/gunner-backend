/**
 * Initial Outreach Agent
 *
 * Fires on: lead.new
 * Does: composes and sends the first AI-written SMS to a new lead from the LM's phone number.
 * Does NOT: template blast — every message is personalized to the individual.
 *
 * Rules:
 *   - Enforces 9AM–6PM send window in the lead's timezone (skips if outside)
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
import { getConfig } from '../playbook/config';

const AGENT_ID = 'initial-outreach';

// Lead's local hour → tone label
type TimeTone = 'morning' | 'afternoon' | 'evening' | 'overnight';

function getTimeTone(localHour: number): TimeTone {
  if (localHour >= 6 && localHour < 12) return 'morning';
  if (localHour >= 12 && localHour < 17) return 'afternoon';
  if (localHour >= 17 && localHour < 21) return 'evening';
  return 'overnight';
}

/**
 * Resolve the lead's local hour from GHL timezone field.
 * Falls back to server time if no timezone is on the contact.
 */
function getLeadLocalHour(contact: Record<string, unknown>): number {
  const tz = (contact.timezone as string) || (contact.timeZone as string) || null;
  if (tz) {
    try {
      const localTime = new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false });
      return parseInt(localTime, 10);
    } catch {
      // Unknown timezone string — fall through to server time
    }
  }
  return new Date().getHours();
}

/**
 * Returns true when the lead's local time is inside the 9AM–6PM send window.
 */
function isInLeadSendWindow(localHour: number): boolean {
  const config = getConfig();
  return localHour >= config.sendWindow.startHour && localHour < config.sendWindow.endHour;
}

/**
 * Determines whether this is an inbound lead.
 * GHL surfaces this as the lead's source. Treat any form/web/chat/referral as inbound.
 */
function isInboundLead(contact: Record<string, unknown>): boolean {
  const source = ((contact.source as string) || '').toLowerCase();
  const inboundSources = ['website', 'web', 'form', 'chat', 'referral', 'google', 'facebook', 'seo'];
  return inboundSources.some((s) => source.includes(s));
}

/**
 * Builds the AI prompt for the opening SMS.
 * Produces a short, conversational, non-template message.
 */
function buildPrompt(
  contact: Record<string, unknown>,
  tone: TimeTone,
  includeCompanyName: boolean,
  companyName: string
): string {
  const firstName = (contact.firstName as string) || '';
  const address = ((contact.customFields as Record<string, string>) || {}).property_address || '';
  const motivation = ((contact.customFields as Record<string, string>) || {}).motivation || '';

  const lines = [
    `You are a real estate acquisitions rep texting a seller lead for the first time.`,
    `Write ONE conversational SMS opener — under 160 characters. No exclamation marks. Sound like a real person, not a script.`,
    ``,
    `Tone: ${tone}. Adjust warmth/energy to match the time of day.`,
    firstName ? `Lead's first name: ${firstName}.` : `Do not use a name — we don't have one yet.`,
    address ? `Property they may want to sell: ${address}.` : '',
    motivation ? `Their stated motivation: ${motivation}.` : '',
    includeCompanyName
      ? `Close with something natural that references "${companyName}" since they reached out to us.`
      : `Do NOT mention the company name.`,
    `Do NOT include a phone number, link, or opt-out language in the message body.`,
    `Output only the SMS text — no quotes, no labels.`,
  ].filter(Boolean);

  return lines.join('\n');
}

/**
 * Placeholder AI generation — wire to Gemini/OpenAI in production.
 */
async function generateSMS(prompt: string): Promise<string> {
  // TODO: replace with real AI call
  void prompt;
  return `Hey, saw you might be interested in selling — happy to chat whenever works for you.`;
}

export async function runInitialOutreach(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId } = event;
  const start = Date.now();

  // Fetch full lead data
  const contact = await contactBot(contactId);

  // Idempotency guard — don't double-send
  const alreadySent = ((contact.customFields as Record<string, string>) || {}).initial_sms_sent;
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

  // Enforce 9AM–6PM in lead's timezone
  const localHour = getLeadLocalHour(contact);
  if (!isInLeadSendWindow(localHour)) {
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

  const tone = getTimeTone(localHour);
  const inbound = isInboundLead(contact);
  const config = getConfig();
  // Company name lives in env; fall back gracefully
  const companyName = process.env.COMPANY_NAME ?? 'our company';

  const prompt = buildPrompt(contact, tone, inbound, companyName);
  const message = await generateSMS(prompt);

  if (!isDryRun()) {
    await smsBot(contactId, message);

    await fieldBot(contactId, {
      initial_sms_sent: new Date().toISOString(),
    });

    await noteBot(contactId, `[initial-outreach] First SMS sent (tone: ${tone}, inbound: ${inbound}):\n\n${message}`);
  }

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
      lmUserId: config.team.defaultLM,
    },
  });
}
