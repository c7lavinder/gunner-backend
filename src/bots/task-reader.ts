/**
 * Task Reader Bot — read-only task operations.
 */

import { isEnabled } from '../core/toggles';
import { ghlGet } from '../integrations/ghl/client';

const BOT_ID = 'bot-task-reader';

export async function getTasksByContact(contactId: string): Promise<any[]> {
  if (!isEnabled(BOT_ID)) {
    console.log(`[bot-task-reader] DISABLED — skipping`);
    return [];
  }
  const res = await ghlGet<any>(`/contacts/${contactId}/tasks`).catch(() => ({ tasks: [] }));
  return res?.tasks ?? [];
}

export async function getOverdueTasks(): Promise<any[]> {
  if (!isEnabled(BOT_ID)) {
    console.log(`[bot-task-reader] DISABLED — skipping`);
    return [];
  }
  const res = await ghlGet<any>(`/contacts/tasks/search`, { status: 'overdue' }).catch(() => ({ tasks: [] }));
  return res?.tasks ?? [];
}

export const taskReaderBot = { getTasksByContact, getOverdueTasks };
