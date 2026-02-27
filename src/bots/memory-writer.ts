/**
 * Memory Writer Bot — ONE job: write to intelligence memory.
 * Toggle: bot-memory-writer
 */

import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import * as memory from '../intelligence/memory';

const BOT_ID = 'bot-memory-writer';

export async function recordAction(
  category: string,
  input: Record<string, any>,
  output: Record<string, any>,
  tenantId?: string,
): Promise<string> {
  if (!isEnabled(BOT_ID)) return '';
  if (isDryRun()) {
    console.log(`[${BOT_ID}] DRY RUN — would record ${category} action`);
    return 'dry-run';
  }
  return memory.recordAction(category, input, output, tenantId);
}

export const memoryWriterBot = { recordAction };
