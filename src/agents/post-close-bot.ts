/**
 * Post-Close Bot (Agent)
 *
 * Fires on: opportunity.stage.purchased
 * Does: 3-touch sequence, all AI-written via smsBot
 *   Touch 1 (24h): thank-you
 *   Touch 2 (48h): review request
 *   Touch 3 (7d): referral ask
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { loadPlaybook } from '../config/loader';
import { smsBot, fieldBot } from '../bots';

const AGENT_ID = 'post-close-bot';

interface PostCloseTouchConfig {
  touchNumber: number;
  delayHours: number;
  templateKey: string;
}

const DEFAULT_SEQUENCE: PostCloseTouchConfig[] = [
  { touchNumber: 1, delayHours: 24, templateKey: 'post_close_thankyou' },
  { touchNumber: 2, delayHours: 48, templateKey: 'post_close_review' },
  { touchNumber: 3, delayHours: 168, templateKey: 'post_close_referral' },
];

export async function runPostCloseBot(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, tenantId } = event;
  const start = Date.now();
  const playbook = await loadPlaybook(tenantId);
  const sequence = playbook?.postClose?.sequence ?? DEFAULT_SEQUENCE;
  const currentTouch = event.metadata?.touchNumber ?? 1;

  const touchConfig = sequence.find((t: PostCloseTouchConfig) => t.touchNumber === currentTouch);
  if (!touchConfig) {
    auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'sequence.complete', result: 'all_touches_sent', durationMs: 0 });
    return;
  }

  // Guard: don't double-send
  const guardKey = `post_close_t${currentTouch}`;
  if (event.metadata?.sentGuards?.includes(guardKey)) {
    auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'skip', result: 'already_sent', durationMs: 0 });
    return;
  }

  if (!isDryRun()) {
    await smsBot({
      contactId,
      tenantId,
      templateKey: touchConfig.templateKey,
      context: { opportunityId, touchNumber: currentTouch },
    });

    await fieldBot({
      contactId,
      tenantId,
      fields: {
        post_close_touch: String(currentTouch),
        post_close_last_sent: new Date().toISOString(),
      },
    });
  }

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: `post_close.touch_${currentTouch}`,
    result: 'sms_sent',
    durationMs: Date.now() - start,
  });

  // Schedule next touch
  const nextTouch = currentTouch + 1;
  const nextConfig = sequence.find((t: PostCloseTouchConfig) => t.touchNumber === nextTouch);
  if (nextConfig) {
    await emit({
      kind: 'post_close.scheduled',
      tenantId,
      contactId,
      opportunityId,
      metadata: { touchNumber: nextTouch, delayHours: nextConfig.delayHours },
    });
  }
}
