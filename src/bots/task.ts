/**
 * Task Bot — creates a task on a contact.
 * One job. Nothing else.
 */

import { isDryRun } from '../core/dry-run';
import { ghlPost, getLocationId } from '../integrations/ghl/client';

export interface TaskInput {
  title: string;
  body?: string;
  dueDate?: string; // ISO string
  assignedTo?: string;
}

export async function taskBot(contactId: string, input: TaskInput): Promise<{ result: 'success' | 'dry-run' }> {
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
