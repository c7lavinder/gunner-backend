/**
 * Contact Search Bot — read-only search operations on contacts.
 * One bot, one job: finding contacts.
 */

import { isEnabled } from '../core/toggles';
import { ghlGet, getLocationId } from '../integrations/ghl/client';

const BOT_ID = 'bot-contact-search';

export async function searchContacts(query: string, filters?: Record<string, string>): Promise<any[]> {
  if (!isEnabled(BOT_ID)) {
    console.log(`[bot-contact-search] DISABLED — skipping`);
    return [];
  }
  const params: Record<string, string> = { query, locationId: getLocationId(), ...filters };
  const res = await ghlGet<any>(`/contacts/`, params).catch(() => ({ contacts: [] }));
  return res?.contacts ?? [];
}

export async function searchByStage(pipelineId: string, stageId: string): Promise<any[]> {
  if (!isEnabled(BOT_ID)) {
    console.log(`[bot-contact-search] DISABLED — skipping`);
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

export async function searchByDateRange(from: string, to: string): Promise<any[]> {
  if (!isEnabled(BOT_ID)) {
    console.log(`[bot-contact-search] DISABLED — skipping`);
    return [];
  }
  const params: Record<string, string> = {
    locationId: getLocationId(),
    startAfter: from,
    startBefore: to,
  };
  const res = await ghlGet<any>(`/contacts/`, params).catch(() => ({ contacts: [] }));
  return res?.contacts ?? [];
}

export const searchBot = { searchContacts, searchByStage, searchByDateRange };
