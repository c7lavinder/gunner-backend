import { isDryRun } from '../core/dry-run';
import { ghlPut } from '../integrations/ghl/client';

export async function assignBot(opportunityId: string, userId: string): Promise<{ result: 'success' | 'dry-run' }> {
  if (isDryRun()) {
    console.log(`[assign-bot] DRY RUN — would assign opp ${opportunityId} to user ${userId}`);
    return { result: 'dry-run' };
  }
  await ghlPut(`/opportunities/${opportunityId}`, { assignedTo: userId });
  return { result: 'success' };
}
