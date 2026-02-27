/**
 * Email Bot — sends emails via GHL (stub for now).
 */

import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';

const BOT_ID = 'bot-email';

export async function sendEmail(
  contactId: string,
  subject: string,
  body: string,
): Promise<{ result: 'success' | 'dry-run' | 'disabled' | 'stub' }> {
  if (!isEnabled(BOT_ID)) {
    console.log(`[bot-email] DISABLED — skipping`);
    return { result: 'disabled' };
  }
  if (isDryRun()) {
    console.log(`[bot-email] DRY RUN — would send email to ${contactId}: ${subject}`);
    return { result: 'dry-run' };
  }
  // TODO: implement GHL email API call
  console.log(`[bot-email] STUB — email to ${contactId}: ${subject}`);
  return { result: 'stub' };
}

export const emailBot = { sendEmail };
