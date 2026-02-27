/**
 * Follow-Up Messenger
 *
 * Fires on: dispatched by follow-up-organizer
 * Does: crafts AI re-engagement SMS based on history, motivation, bucket, time elapsed.
 * Sends: via smsBot (which handles DRY_RUN).
 * Tones: check-in | time-sensitive | empathetic | rekindle | final-touch
 */

import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { smsBot, contactBot, fieldBot } from '../bots';
import { getFieldName } from '../config';
import { aiWriterBot } from '../bots/ai-writer';

const AGENT_ID = 'follow-up-messenger';

type Tone = 'check-in' | 'time-sensitive' | 'empathetic' | 'rekindle' | 'final-touch';

export interface FollowUpMessageRequest {
  tenantId: string;
  contactId: string;
  bucketName: string;
  touchNumber: number;
  daysSinceLastTouch: number;
}

/**
 * Tone selection — driven by bucket position and touch number.
 */
function selectTone(bucketName: string, touchNumber: number, daysSinceLastTouch: number): Tone {
  // Final bucket, high touch count → final-touch
  if (bucketName.includes('1-year') && touchNumber >= 3) return 'final-touch';
  // Long gap → rekindle
  if (daysSinceLastTouch > 90) return 'rekindle';
  // First touch in any bucket → check-in
  if (touchNumber === 1) return 'check-in';
  // Second touch → empathetic
  if (touchNumber === 2) return 'empathetic';
  // Otherwise → time-sensitive
  return 'time-sensitive';
}

/**
 * AI prompt builder for SMS generation.
 */
function buildPrompt(
  contact: Record<string, unknown>,
  tone: Tone,
  bucketName: string,
  daysSinceLastTouch: number,
  motivationField: string,
  propertyAddressField: string,
): string {
  const name = (contact.firstName as string) || 'there';
  const customFields = (contact.customFields as Record<string, string>) ?? {};
  const motivation = customFields[motivationField] || 'unknown';
  const propertyAddress = customFields[propertyAddressField] || '';

  return [
    `Write a short re-engagement SMS (under 160 chars) for a real estate seller lead.`,
    `Tone: ${tone}.`,
    `Seller first name: ${name}.`,
    `Motivation: ${motivation}.`,
    `Property: ${propertyAddress || 'unknown'}.`,
    `Days since last contact: ${daysSinceLastTouch}.`,
    `Follow-up bucket: ${bucketName}.`,
    `Do NOT use exclamation marks. Sound human, not salesy.`,
    `Do NOT include company name or agent name — that's appended separately.`,
  ].join('\n');
}

const FU_SYSTEM_PROMPT = `You are a real estate acquisitions rep writing a follow-up SMS. Rules: under 160 characters, no exclamation marks, sound human not salesy, no links or phone numbers. Output only the SMS text.`;

const FU_FALLBACK = `Hey, just checking in — still thinking about selling? Let me know if anything's changed.`;

async function generateSMS(prompt: string): Promise<string> {
  try {
    const text = await aiWriterBot.writeText(prompt, FU_SYSTEM_PROMPT);
    const cleaned = text.trim().replace(/^["']|["']$/g, '');
    return cleaned || FU_FALLBACK;
  } catch (err) {
    console.error(`[follow-up-messenger] Gemini failed, using fallback:`, (err as Error).message);
    return FU_FALLBACK;
  }
}

export async function runFollowUpMessenger(req: FollowUpMessageRequest): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const start = Date.now();
  const { contactId, bucketName, touchNumber, daysSinceLastTouch, tenantId } = req;

  // Guard: check if already touched today (idempotency)
  const contact = await contactBot(contactId);
  const fLastTouch = await getFieldName(tenantId, 'fu_last_touch');
  const lastTouch = Number((contact as any).customFields?.[fLastTouch] || 0);
  const hoursSinceTouch = (Date.now() - lastTouch) / (1000 * 60 * 60);
  if (hoursSinceTouch < 20) {
    auditLog({
      agent: AGENT_ID,
      contactId,
      action: 'sms:skipped',
      result: 'skipped',
      reason: 'Already touched within 20 hours',
    });
    return;
  }

  const tone = selectTone(bucketName, touchNumber, daysSinceLastTouch);
  const [fMotivation, fPropertyAddress] = await Promise.all([
    getFieldName(tenantId, 'motivation'),
    getFieldName(tenantId, 'property_address'),
  ]);
  const prompt = buildPrompt(contact as Record<string, unknown>, tone, bucketName, daysSinceLastTouch, fMotivation, fPropertyAddress);
  const message = await generateSMS(prompt);

  // Send via smsBot (bot handles DRY_RUN internally)
  await smsBot(contactId, message);

  // Update touch tracking fields
  const fTouchCount = await getFieldName(tenantId, 'fu_touch_count');
  await fieldBot(contactId, {
    [fLastTouch]: String(Date.now()),
    [fTouchCount]: String(touchNumber),
  });

  auditLog({
    agent: AGENT_ID,
    contactId,
    action: 'sms:sent',
    result: 'success',
    durationMs: Date.now() - start,
    metadata: { tone, bucketName, touchNumber, messageLength: message.length },
  });
}
