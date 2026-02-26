import { isDryRun } from '../core/dry-run';
import { ghlPost } from '../integrations/ghl/client';

export async function noteBot(contactId: string, body: string): Promise<{ result: 'success' | 'dry-run' }> {
  if (isDryRun()) {
    console.log(`[note-bot] DRY RUN — would add note to ${contactId}`);
    return { result: 'dry-run' };
  }
  await ghlPost(`/contacts/${contactId}/notes`, { body });
  return { result: 'success' };
}
