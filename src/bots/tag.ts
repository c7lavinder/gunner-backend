import { isDryRun } from '../core/dry-run';
import { ghlPost } from '../integrations/ghl/client';
import { getLocationId } from '../integrations/ghl/client';

export async function tagBot(contactId: string, tags: string[]): Promise<{ result: 'success' | 'dry-run' }> {
  if (isDryRun()) {
    console.log(`[tag-bot] DRY RUN — would add tags to ${contactId}:`, tags);
    return { result: 'dry-run' };
  }
  await ghlPost(`/contacts/${contactId}/tags`, { tags });
  return { result: 'success' };
}
