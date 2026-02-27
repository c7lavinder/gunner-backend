import { isDryRun } from '../core/dry-run';
import { isEnabled } from '../core/toggles';
import { ghlPost } from '../integrations/ghl/client';

const BOT_ID = 'bot-note';

export async function noteBot(contactId: string, body: string): Promise<{ result: 'success' | 'dry-run' | 'disabled' }> {
  if (!isEnabled(BOT_ID)) {
    console.log(`[bot-note] DISABLED — skipping`);
    return { result: 'disabled' };
  }
  if (isDryRun()) {
    console.log(`[note-bot] DRY RUN — would add note to ${contactId}`);
    return { result: 'dry-run' };
  }
  await ghlPost(`/contacts/${contactId}/notes`, { body });
  return { result: 'success' };
}
