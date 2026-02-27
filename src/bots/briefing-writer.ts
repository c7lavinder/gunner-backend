/**
 * Briefing Writer Bot — ONE job: generate intelligence briefings.
 * Toggle: bot-briefing-writer
 */

import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { generateBriefing } from '../intelligence/researcher';

const BOT_ID = 'bot-briefing-writer';

export async function writeBriefing(tenantId: string): Promise<string> {
  if (!isEnabled(BOT_ID)) return 'Briefing writer bot is disabled.';
  if (isDryRun()) {
    console.log(`[${BOT_ID}] DRY RUN — would generate briefing`);
    return '[Briefing placeholder — dry run]';
  }
  return generateBriefing(tenantId);
}

export const briefingWriterBot = { writeBriefing };
