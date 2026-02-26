import { isDryRun } from '../core/dry-run';
import { ghlPut } from '../integrations/ghl/client';

export async function fieldBot(contactId: string, fields: Record<string, unknown>): Promise<{ result: 'success' | 'dry-run' }> {
  if (isDryRun()) {
    console.log(`[field-bot] DRY RUN — would update fields on ${contactId}:`, fields);
    return { result: 'dry-run' };
  }
  await ghlPut(`/contacts/${contactId}`, { customFields: fields });
  return { result: 'success' };
}
