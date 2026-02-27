/**
 * Stage Bot — moves an opportunity to a stage.
 * One job. Nothing else.
 */

import { isDryRun } from '../core/dry-run';
import { isEnabled } from '../core/toggles';
import { ghlPut } from '../integrations/ghl/client';

const BOT_ID = 'bot-stage';

export async function stageBot(opportunityId: string, stageId: string): Promise<{ result: 'success' | 'dry-run' | 'disabled' }> {
  if (!isEnabled(BOT_ID)) {
    console.log(`[bot-stage] DISABLED — skipping`);
    return { result: 'disabled' };
  }
  if (isDryRun()) {
    console.log(`[stage-bot] DRY RUN — would move opp ${opportunityId} to stage ${stageId}`);
    return { result: 'dry-run' };
  }
  await ghlPut(`/opportunities/${opportunityId}`, { pipelineStageId: stageId });
  return { result: 'success' };
}
