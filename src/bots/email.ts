/**
 * Email Bot — sends emails via GHL Conversations API.
 */

import { ghlPost } from '../integrations/ghl/client';
import { isDryRun } from '../core/dry-run';
import { auditLog } from '../core/audit';

const BOT_ID = 'bot-email';

export type EmailResult = 'success' | 'dry-run' | 'error';

export async function sendEmail(
  contactId: string,
  subject: string,
  html: string,
  toEmail?: string,
): Promise<{ result: EmailResult; messageId?: string }> {
  if (isDryRun()) {
    console.log(`[bot-email] DRY RUN — would send email to ${contactId}: ${subject}`);
    auditLog({ agent: BOT_ID, contactId, action: 'email:dry-run', result: 'skipped', metadata: { subject, toEmail } });
    return { result: 'dry-run' };
  }

  try {
    const payload: Record<string, unknown> = {
      type: 'Email',
      contactId,
      subject,
      html,
      ...(toEmail ? { emailTo: toEmail } : {}),
    };

    const res = await ghlPost<{ conversationId?: string; messageId?: string }>(
      '/conversations/messages',
      payload,
    );

    auditLog({ agent: BOT_ID, contactId, action: 'email:sent', result: 'success', metadata: { subject, messageId: res?.messageId } });
    return { result: 'success', messageId: res?.messageId };
  } catch (err: any) {
    auditLog({ agent: BOT_ID, contactId, action: 'email:failed', result: 'error', reason: err?.message });
    return { result: 'error' };
  }
}

export const emailBot = { sendEmail };
