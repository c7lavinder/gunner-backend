/**
 * Stage Bot — moves an opportunity to a stage.
 * One job. Nothing else.
 */

import { isDryRun } from '../core/dry-run';
import { ghlPut } from '../integrations/ghl/client';

export async function stageBot(opportunityId: string, stageId: string): Promise<{ result: 'success' | 'dry-run' }> {
  if (isDryRun()) {
    console.log(`[stage-bot] DRY RUN — would move opp ${opportunityId} to stage ${stageId}`);
    return { result: 'dry-run' };
  }
  await ghlPut(`/opportunities/${opportunityId}`, { pipelineStageId: stageId });
  return { result: 'success' };
}
