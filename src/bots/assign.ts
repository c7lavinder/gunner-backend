import { isDryRun } from '../core/dry-run';
import { isEnabled } from '../core/toggles';
import { ghlPut } from '../integrations/ghl/client';

const BOT_ID = 'bot-assign';

export async function assignBot(opportunityId: string, userId: string): Promise<{ result: 'success' | 'dry-run' | 'disabled' }> {
  if (!isEnabled(BOT_ID)) {
    console.log(`[bot-assign] DISABLED — skipping`);
    return { result: 'disabled' };
  }
  if (isDryRun()) {
    console.log(`[assign-bot] DRY RUN — would assign opp ${opportunityId} to user ${userId}`);
    return { result: 'dry-run' };
  }
  await ghlPut(`/opportunities/${opportunityId}`, { assignedTo: userId });
  return { result: 'success' };
}
