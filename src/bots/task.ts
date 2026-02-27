/**
 * Task Bot — creates a task on a contact.
 * One job. Nothing else.
 */

import { isDryRun } from '../core/dry-run';
import { isEnabled } from '../core/toggles';
import { ghlPost } from '../integrations/ghl/client';

const BOT_ID = 'bot-task';

export interface TaskInput {
  title: string;
  body?: string;
  dueDate?: string; // ISO string
  assignedTo?: string;
}

export async function taskBot(contactId: string, input: TaskInput): Promise<{ result: 'success' | 'dry-run' | 'disabled' }> {
  if (!isEnabled(BOT_ID)) {
    console.log(`[bot-task] DISABLED — skipping`);
    return { result: 'disabled' };
  }
  if (isDryRun()) {
    console.log(`[task-bot] DRY RUN — would create task for ${contactId}: ${input.title}`);
    return { result: 'dry-run' };
  }
  await ghlPost(`/contacts/${contactId}/tasks`, {
    title: input.title,
    body: input.body ?? '',
    dueDate: input.dueDate ?? new Date(Date.now() + 30 * 60_000).toISOString(),
    assignedTo: input.assignedTo,
    completed: false,
  });
  return { result: 'success' };
}
