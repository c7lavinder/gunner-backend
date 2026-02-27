/**
 * Guard Bot — idempotency/dedup/guard checks.
 * Toggle: bot-guard
 */

import { isEnabled } from '../core/toggles';

const BOT_ID = 'bot-guard';

const processed = new Set<string>();

export function alreadyProcessed(contactId: string, actionKey: string): boolean {
  if (!isEnabled(BOT_ID)) return false;
  const key = `${contactId}:${actionKey}`;
  if (processed.has(key)) return true;
  processed.add(key);
  return false;
}

export function isAlreadyInStage(currentStage: string | undefined, targetStage: string | null): boolean {
  if (!isEnabled(BOT_ID)) return false;
  return !!currentStage && currentStage === targetStage;
}

export function hasBeenSent(guardKey: string): boolean {
  if (!isEnabled(BOT_ID)) return false;
  return processed.has(guardKey);
}

export function markSent(guardKey: string): void {
  processed.add(guardKey);
}

export const guardBot = {
  alreadyProcessed,
  isAlreadyInStage,
  hasBeenSent,
  markSent,
};
