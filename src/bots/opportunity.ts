/**
 * Opportunity Bot — CRUD for opportunities in GHL.
 */

import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { ghlGet, ghlPost } from '../integrations/ghl/client';

const BOT_ID = 'bot-opportunity';

export async function getOpportunity(oppId: string): Promise<any | null> {
  if (!isEnabled(BOT_ID)) {
    console.log(`[bot-opportunity] DISABLED — skipping`);
    return null;
  }
  const res = await ghlGet<any>(`/opportunities/${oppId}`).catch(() => null);
  return res?.opportunity ?? res;
}

export async function createOpportunity(
  contactId: string,
  pipelineId: string,
  stageId: string,
  name: string,
): Promise<any | null> {
  if (!isEnabled(BOT_ID)) {
    console.log(`[bot-opportunity] DISABLED — skipping`);
    return null;
  }
  if (isDryRun()) {
    console.log(`[bot-opportunity] DRY RUN — would create opportunity "${name}" for ${contactId}`);
    return null;
  }
  const res = await ghlPost<any>(`/opportunities/`, {
    contactId,
    pipelineId,
    pipelineStageId: stageId,
    name,
  });
  return res?.opportunity ?? res;
}

export async function getOpportunitiesByContact(contactId: string): Promise<any[]> {
  if (!isEnabled(BOT_ID)) {
    console.log(`[bot-opportunity] DISABLED — skipping`);
    return [];
  }
  const res = await ghlGet<any>(`/contacts/${contactId}/opportunities`).catch(() => ({ opportunities: [] }));
  return res?.opportunities ?? [];
}

export const opportunityBot = { getOpportunity, createOpportunity, getOpportunitiesByContact };
