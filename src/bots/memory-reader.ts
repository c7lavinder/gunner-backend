/**
 * Memory Reader Bot — ONE job: read from intelligence memory.
 * Toggle: bot-memory-reader
 */

import { isEnabled } from '../core/toggles';
import * as memory from '../intelligence/memory';
import type { IntelligenceEntry } from '../intelligence/memory';

const BOT_ID = 'bot-memory-reader';

export async function getRecent(category: string, limit = 20): Promise<IntelligenceEntry[]> {
  if (!isEnabled(BOT_ID)) return [];
  return memory.getRecentByCategory(category, limit);
}

export async function getTopPerformers(category: string, limit = 10): Promise<IntelligenceEntry[]> {
  if (!isEnabled(BOT_ID)) return [];
  return memory.getTopPerformers(category, limit);
}

export async function getWorstPerformers(category: string, limit = 10): Promise<IntelligenceEntry[]> {
  if (!isEnabled(BOT_ID)) return [];
  return memory.getWorstPerformers(category, limit);
}

export async function getStats(category: string): Promise<{ total: number; avgScore: number; improvedOverTime: boolean }> {
  if (!isEnabled(BOT_ID)) return { total: 0, avgScore: 0, improvedOverTime: false };
  return memory.getStats(category);
}

export const memoryReaderBot = { getRecent, getTopPerformers, getWorstPerformers, getStats };
