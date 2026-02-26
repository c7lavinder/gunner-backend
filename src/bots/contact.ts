/**
 * Contact Bot — fetches contact data from GHL.
 * Agents call this. Agents never call GHL directly.
 */

import { ghlGet } from '../integrations/ghl/client';

export async function contactBot(contactId: string): Promise<Record<string, any>> {
  const res = await ghlGet<any>(`/contacts/${contactId}`);
  return res?.contact ?? res;
}
