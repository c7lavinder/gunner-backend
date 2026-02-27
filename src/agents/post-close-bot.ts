/**
 * Post-Close Bot (Agent)
 *
 * Fires on: opportunity.stage.purchased
 * Does: 3-touch sequence via smsBot
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { loadPlaybook } from '../config';
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

  try {
    const { contactId, opportunityId, tenantId } = event;
    const start = Date.now();
    const playbook = await loadPlaybook(tenantId);
    const sequence = playbook?.postClose?.sequence ?? DEFAULT_SEQUENCE;
    const currentTouch = (event.metadata?.touchNumber as number) ?? 1;

    const touchConfig = sequence.find((t: PostCloseTouchConfig) => t.touchNumber === currentTouch);
    if (!touchConfig) {
      auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'sequence.complete', result: 'success', durationMs: 0 });
      return;
    }

    const sentGuards = (event.metadata?.sentGuards as string[]) ?? [];
    const guardKey = `post_close_t${currentTouch}`;
    if (sentGuards.includes(guardKey)) {
      auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'skip', result: 'skipped', durationMs: 0 });
      return;
    }

    if (!isDryRun()) {
      await smsBot(contactId, `Post-close touch ${currentTouch}`).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'smsBot:failed', result: 'error', reason: err?.message });
      });
      await fieldBot(contactId, { post_close_touch: String(currentTouch), post_close_last_sent: new Date().toISOString() }).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'fieldBot:failed', result: 'error', reason: err?.message });
      });
    }

    auditLog({ agent: AGENT_ID, contactId, opportunityId, action: `post_close.touch_${currentTouch}`, result: 'success', durationMs: Date.now() - start });

    const nextTouch = currentTouch + 1;
    const nextConfig = sequence.find((t: PostCloseTouchConfig) => t.touchNumber === nextTouch);
    if (nextConfig) {
      await emit({ kind: 'post_close.scheduled', tenantId, contactId, opportunityId, metadata: { touchNumber: nextTouch, delayHours: nextConfig.delayHours } }).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'emit:post_close.scheduled:failed', result: 'error', reason: err?.message });
      });
    }
  } catch (err: any) {
    auditLog({ agent: AGENT_ID, contactId: event.contactId, action: 'agent:crashed', result: 'error', reason: err?.message });
  }
}
