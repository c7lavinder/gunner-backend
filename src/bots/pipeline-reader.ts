/**
 * Pipeline Reader Bot — reads contacts by pipeline stage.
 */

import { isEnabled } from '../core/toggles';
import { ghlGet, getLocationId } from '../integrations/ghl/client';

const BOT_ID = 'bot-pipeline-reader';

export async function getContactsByStage(pipelineId: string, stageId: string): Promise<any[]> {
  if (!isEnabled(BOT_ID)) {
    console.log(`[bot-pipeline-reader] DISABLED — skipping`);
    return [];
  }
  const params: Record<string, string> = {
    locationId: getLocationId(),
    pipelineId,
    pipelineStageId: stageId,
  };
  const res = await ghlGet<any>(`/contacts/`, params).catch(() => ({ contacts: [] }));
  return res?.contacts ?? [];
}

export const pipelineReaderBot = { getContactsByStage };
