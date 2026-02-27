import { isDryRun } from '../core/dry-run';
import { isEnabled } from '../core/toggles';
import { ghlPut } from '../integrations/ghl/client';

const BOT_ID = 'bot-field';

export async function fieldBot(contactId: string, fields: Record<string, unknown>): Promise<{ result: 'success' | 'dry-run' | 'disabled' }> {
  if (!isEnabled(BOT_ID)) {
    console.log(`[bot-field] DISABLED — skipping`);
    return { result: 'disabled' };
  }
  if (isDryRun()) {
    console.log(`[field-bot] DRY RUN — would update fields on ${contactId}:`, fields);
    return { result: 'dry-run' };
  }
  await ghlPut(`/contacts/${contactId}`, { customFields: fields });
  return { result: 'success' };
}
