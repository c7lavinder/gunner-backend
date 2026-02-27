/**
 * Follow-Up Messenger — pure orchestration.
 * Fires on: dispatched by follow-up-organizer
 */

import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { smsBot, contactBot, fieldBot } from '../bots';
import { getFieldName } from '../config';
import { aiWriterBot } from '../bots/ai-writer';
import { classifierBot } from '../bots/classifier';
import { templateBot } from '../bots/template';

const AGENT_ID = 'follow-up-messenger';

const FU_SYSTEM_PROMPT = `You are a real estate acquisitions rep writing a follow-up SMS. Rules: under 160 characters, no exclamation marks, sound human not salesy, no links or phone numbers. Output only the SMS text.`;
const FU_FALLBACK = `Hey, just checking in — still thinking about selling? Let me know if anything's changed.`;

export interface FollowUpMessageRequest {
  tenantId: string;
  contactId: string;
  bucketName: string;
  touchNumber: number;
  daysSinceLastTouch: number;
}

export async function runFollowUpMessenger(req: FollowUpMessageRequest): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  try {
    const start = Date.now();
    const { contactId, bucketName, touchNumber, daysSinceLastTouch, tenantId } = req;

    const contact = await contactBot(contactId).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'contactBot:failed', result: 'error', reason: err?.message });
      return null;
    });
    if (!contact) return;

    const fLastTouch = await getFieldName(tenantId, 'fu_last_touch');
    const lastTouch = Number((contact as any).customFields?.[fLastTouch] || 0);
    const hoursSinceTouch = (Date.now() - lastTouch) / (1000 * 60 * 60);
    if (hoursSinceTouch < 20) {
      auditLog({ agent: AGENT_ID, contactId, action: 'sms:skipped', result: 'skipped', reason: 'Already touched within 20 hours' });
      return;
    }

    const tone = classifierBot.selectTone(bucketName, touchNumber, daysSinceLastTouch);
    const [fMotivation, fPropertyAddress] = await Promise.all([
      getFieldName(tenantId, 'motivation'),
      getFieldName(tenantId, 'property_address'),
    ]);

    const prompt = templateBot.buildSmsPrompt(contact as Record<string, unknown>, {
      tone, bucketName, daysSinceLastTouch,
      motivationField: fMotivation,
      propertyAddressField: fPropertyAddress,
    });

    let message: string;
    try {
      const text = await aiWriterBot.writeText(prompt, FU_SYSTEM_PROMPT);
      message = text.trim().replace(/^["']|["']$/g, '') || FU_FALLBACK;
    } catch (err) {
      auditLog({ agent: AGENT_ID, contactId, action: 'aiWriterBot:failed', result: 'error', reason: (err as Error)?.message });
      message = FU_FALLBACK;
    }

    await smsBot(contactId, message).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'smsBot:failed', result: 'error', reason: err?.message });
    });

    const fTouchCount = await getFieldName(tenantId, 'fu_touch_count');
    await fieldBot(contactId, {
      [fLastTouch]: String(Date.now()),
      [fTouchCount]: String(touchNumber),
    }).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'fieldBot:failed', result: 'error', reason: err?.message });
    });

    auditLog({ agent: AGENT_ID, contactId, action: 'sms:sent', result: 'success', durationMs: Date.now() - start, metadata: { tone, bucketName, touchNumber, messageLength: message.length } });
  } catch (err: any) {
    auditLog({ agent: AGENT_ID, contactId: req.contactId, action: 'agent:crashed', result: 'error', reason: err?.message });
  }
}
