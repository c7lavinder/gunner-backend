/**
 * Note Reader Bot — read-only note operations.
 */

import { isEnabled } from '../core/toggles';
import { ghlGet } from '../integrations/ghl/client';

const BOT_ID = 'bot-note-reader';

export async function getNotesByContact(contactId: string): Promise<any[]> {
  if (!isEnabled(BOT_ID)) {
    console.log(`[bot-note-reader] DISABLED — skipping`);
    return [];
  }
  const res = await ghlGet<any>(`/contacts/${contactId}/notes`).catch(() => ({ notes: [] }));
  return res?.notes ?? [];
}

export const noteReaderBot = { getNotesByContact };
