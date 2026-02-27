/**
 * Contact Bot — fetches contact data from GHL.
 * Agents call this. Agents never call GHL directly.
 */

import { isEnabled } from '../core/toggles';
import { ghlGet } from '../integrations/ghl/client';

const BOT_ID = 'bot-contact';

export async function contactBot(contactId: string): Promise<Record<string, any>> {
  if (!isEnabled(BOT_ID)) {
    console.log(`[bot-contact] DISABLED — skipping`);
    return {};
  }
  const res = await ghlGet<any>(`/contacts/${contactId}`);
  return res?.contact ?? res;
}
