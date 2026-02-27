import { isDryRun } from '../core/dry-run';
import { isEnabled } from '../core/toggles';
import { ghlPost } from '../integrations/ghl/client';

const BOT_ID = 'bot-tag';

export async function tagBot(contactId: string, tags: string[]): Promise<{ result: 'success' | 'dry-run' | 'disabled' }> {
  if (!isEnabled(BOT_ID)) {
    console.log(`[bot-tag] DISABLED — skipping`);
    return { result: 'disabled' };
  }
  if (isDryRun()) {
    console.log(`[tag-bot] DRY RUN — would add tags to ${contactId}:`, tags);
    return { result: 'dry-run' };
  }
  await ghlPost(`/contacts/${contactId}/tags`, { tags });
  return { result: 'success' };
}
