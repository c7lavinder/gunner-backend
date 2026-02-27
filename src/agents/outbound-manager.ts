/**
 * Outbound Manager Agent
 *
 * The single gatekeeper for every outgoing SMS.
 * All agents that want to send a text call sendOutbound() here
 * instead of calling smsBot directly.
 *
 * Responsibilities:
 *   - Enforce 9AM–6PM send window in the lead's timezone
 *   - Enforce per-contact rate limits (max N messages per rolling 24h window)
 *   - Route approved messages through smsBot
 *   - Log every decision — sent, blocked, or rate-limited — to the audit log
 *
 * What it does NOT do:
 *   - Write to the CRM (that's smsBot's job)
 *   - Compose message content (that's each agent's job)
 *   - Know anything about leads beyond contactId + timezone
 */

import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { smsBot } from '../bots/sms';
import { contactBot } from '../bots/contact';
import { getConfig } from '../playbook/config';

const AGENT_ID = 'outbound-manager';

// Per-contact rate limit: max messages in a rolling 24-hour window
const MAX_PER_24H = Number(process.env.SMS_RATE_LIMIT_PER_24H ?? 3);

// In-memory rate limit store: contactId → timestamps of recent sends
// In production this should be backed by Redis or the CRM's conversation log.
const sendHistory = new Map<string, number[]>();

function pruneHistory(contactId: string): number[] {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const times = (sendHistory.get(contactId) ?? []).filter((t) => t > cutoff);
  sendHistory.set(contactId, times);
  return times;
}

function recordSend(contactId: string): void {
  const times = pruneHistory(contactId);
  times.push(Date.now());
  sendHistory.set(contactId, times);
}

function isRateLimited(contactId: string): boolean {
  const times = pruneHistory(contactId);
  return times.length >= MAX_PER_24H;
}

/**
 * Resolve the lead's local hour from their GHL timezone field.
 * Falls back to server local time if no timezone is present.
 */
function getLeadLocalHour(contact: Record<string, unknown>): number {
  const tz = (contact.timezone as string) || (contact.timeZone as string) || null;
  if (tz) {
    try {
      const localTime = new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false });
      return parseInt(localTime, 10);
    } catch {
      // Unknown timezone — fall through to server time
    }
  }
  return new Date().getHours();
}

export interface OutboundRequest {
  contactId: string;
  opportunityId?: string;
  message: string;
  /** Which agent is requesting the send — logged for auditability */
  fromAgent: string;
}

export interface OutboundResult {
  result: 'sent' | 'dry-run' | 'outside-window' | 'rate-limited' | 'disabled';
  reason?: string;
}

export async function sendOutbound(req: OutboundRequest): Promise<OutboundResult> {
  const { contactId, opportunityId, message, fromAgent } = req;
  const start = Date.now();

  if (!isEnabled(AGENT_ID)) {
    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'outbound:blocked',
      result: 'skipped',
      reason: `agent-disabled (requested by ${fromAgent})`,
      durationMs: Date.now() - start,
    });
    return { result: 'disabled', reason: 'outbound-manager is disabled' };
  }

  // Rate limit check first — fast path, no network call needed
  if (isRateLimited(contactId)) {
    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'outbound:blocked',
      result: 'skipped',
      reason: `rate-limited (>${MAX_PER_24H} messages in 24h, requested by ${fromAgent})`,
      durationMs: Date.now() - start,
    });
    return { result: 'rate-limited', reason: `max ${MAX_PER_24H} messages per 24h exceeded` };
  }

  // Fetch contact for timezone — needed before send window check
  const contact = await contactBot(contactId);
  const localHour = getLeadLocalHour(contact);
  const config = getConfig();

  if (localHour < config.sendWindow.startHour || localHour >= config.sendWindow.endHour) {
    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'outbound:blocked',
      result: 'skipped',
      reason: `outside-send-window (lead local hour: ${localHour}, window: ${config.sendWindow.startHour}–${config.sendWindow.endHour}, requested by ${fromAgent})`,
      durationMs: Date.now() - start,
    });
    return { result: 'outside-window', reason: `lead local hour ${localHour} is outside send window` };
  }

  if (isDryRun()) {
    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'outbound:sent',
      result: 'skipped',
      reason: `dry-run (requested by ${fromAgent})`,
      durationMs: Date.now() - start,
      metadata: { messageLength: message.length, localHour },
    });
    return { result: 'dry-run' };
  }

  await smsBot(contactId, message);
  recordSend(contactId);

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: 'outbound:sent',
    result: 'success',
    durationMs: Date.now() - start,
    metadata: {
      fromAgent,
      messageLength: message.length,
      localHour,
      recentSendCount: pruneHistory(contactId).length,
    },
  });

  return { result: 'sent' };
}
