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

/** Parse "HH:MM" string → integer hour. */
function parseHour(timeStr: string): number {
  return parseInt(timeStr.split(':')[0], 10);
}

/**
 * Returns true when the lead's local time is inside the playbook send window.
 */
function isInLeadSendWindow(localHour: number, playbook: any): boolean {
  const sw = playbook.communication?.send_window ?? { start: '09:00', end: '18:00' };
  return localHour >= parseHour(sw.start) && localHour < parseHour(sw.end);
}

/**
 * Determines whether this is an inbound lead by checking playbook leadSources.
 */
function isInboundLead(contact: Record<string, unknown>, playbook: any): boolean {
  const source = ((contact.source as string) || '').toLowerCase();
  const inboundKeys = Object.entries(playbook.leadSources ?? {})
    .filter(([, cfg]: [string, any]) => cfg.type === 'inbound')
    .map(([key]) => key.toLowerCase());
  // Also keep fallback web/form/chat/google/facebook/seo patterns
  const fallback = ['website', 'web', 'form', 'chat', 'referral', 'google', 'facebook', 'seo'];
  return [...inboundKeys, ...fallback].some((s) => source.includes(s));
}

/**
 * Builds the AI prompt for the opening SMS.
 * Produces a short, conversational, non-template message.
 */
function buildPrompt(
  contact: Record<string, unknown>,
  tone: TimeTone,
  includeCompanyName: boolean,
  companyName: string,
  playbook: any
): string {
  const cf = playbook.customFields;
  const firstName = (contact.firstName as string) || '';
  const customFields = (contact.customFields as Record<string, string>) || {};
  const address = customFields[cf.property_address] || '';
  const motivation = customFields[cf.motivation] || '';

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

const SMS_SYSTEM_PROMPT = `You are a real estate acquisitions rep writing an opening SMS. Rules: under 160 characters, no exclamation marks, sound like a real person not a script, no links or phone numbers. Output only the SMS text.`;

const SMS_FALLBACK = `Hey, saw you might be interested in selling — happy to chat whenever works for you.`;

async function generateSMS(prompt: string): Promise<string> {
  try {
    const text = await aiWriterBot.writeText(prompt, SMS_SYSTEM_PROMPT);
    const cleaned = text.trim().replace(/^["']|["']$/g, '');
    return cleaned || SMS_FALLBACK;
  } catch (err) {
    console.error(`[initial-outreach] Gemini failed, using fallback:`, (err as Error).message);
    return SMS_FALLBACK;
  }
}

export async function runInitialOutreach(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, tenantId } = event;
  const start = Date.now();
  const playbook = await loadPlaybook(tenantId);

  // Fetch full lead data
  const contact = await contactBot(contactId);

  // Idempotency guard — don't double-send
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

  // Enforce send window in lead's timezone
  const localHour = getLeadLocalHour(contact);
  if (!isInLeadSendWindow(localHour, playbook)) {
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
  const inbound = isInboundLead(contact, playbook);
  const companyName = playbook.company?.name ?? 'our company';

  const prompt = buildPrompt(contact, tone, inbound, companyName, playbook);
  const message = await generateSMS(prompt);

  if (!isDryRun()) {
    await smsBot(contactId, message);

    await fieldBot(contactId, {
      [cf.initial_sms_sent]: new Date().toISOString(),
    });

    await noteBot(contactId, `[initial-outreach] First SMS sent (tone: ${tone}, inbound: ${inbound}):\n\n${message}`);
  }

  const defaultLM = playbook.team.routing.default_assignee;

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
}
