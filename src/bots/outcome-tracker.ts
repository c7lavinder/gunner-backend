/**
 * Outcome Tracker Bot — ONE job: match actions to their outcomes.
 * Toggle: bot-outcome-tracker
 */

import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import * as memory from '../intelligence/memory';

const BOT_ID = 'bot-outcome-tracker';

export async function recordOutcome(
  actionId: string,
  outcome: Record<string, any>,
  score?: number,
): Promise<void> {
  if (!isEnabled(BOT_ID)) return;
  if (isDryRun()) {
    console.log(`[${BOT_ID}] DRY RUN — would record outcome for ${actionId}`);
    return;
  }
  await memory.recordOutcome(actionId, outcome, score);
}

export async function matchOutcomes(tenantId: string): Promise<{ matched: number; unmatched: number }> {
  if (!isEnabled(BOT_ID)) return { matched: 0, unmatched: 0 };

  const categories = await memory.getAllCategories();
  let matched = 0;
  let unmatched = 0;

  for (const cat of categories) {
    const recent = await memory.getRecentByCategory(cat, 100);
    for (const entry of recent) {
      if (entry.tenantId && tenantId && entry.tenantId !== tenantId) continue;
      if (entry.outcome !== null) {
        matched++;
      } else {
        unmatched++;
      }
    }
  }

  console.log(`[${BOT_ID}] matchOutcomes: ${matched} matched, ${unmatched} unmatched`);
  return { matched, unmatched };
}

export const outcomeTrackerBot = { recordOutcome, matchOutcomes };
