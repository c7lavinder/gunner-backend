/**
 * Intelligence Memory — persistent store for what the AI has learned.
 * File-based persistence (data/intelligence-memory.json), upgradeable to DB later.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface IntelligenceEntry {
  id: string;
  category: string;
  tenantId?: string;
  input: Record<string, any>;
  output: Record<string, any>;
  outcome: Record<string, any> | null;
  feedback: string | null;
  score: number | null;
  createdAt: number;
  updatedAt: number;
}

const DATA_DIR = path.resolve(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'intelligence-memory.json');

let entries: IntelligenceEntry[] = [];
let loaded = false;

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      entries = JSON.parse(raw);
    }
  } catch (err) {
    console.error('[intelligence-memory] failed to load:', (err as Error).message);
    entries = [];
  }
}

function persist(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2));
  } catch (err) {
    console.error('[intelligence-memory] failed to persist:', (err as Error).message);
  }
}

export async function recordAction(
  category: string,
  input: Record<string, any>,
  output: Record<string, any>,
  tenantId?: string,
): Promise<string> {
  ensureLoaded();
  const id = crypto.randomUUID();
  const now = Date.now();
  entries.push({
    id,
    category,
    tenantId,
    input,
    output,
    outcome: null,
    feedback: null,
    score: null,
    createdAt: now,
    updatedAt: now,
  });
  persist();
  return id;
}

export async function recordOutcome(
  id: string,
  outcome: Record<string, any>,
  score?: number,
): Promise<void> {
  ensureLoaded();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;
  entry.outcome = outcome;
  if (score !== undefined) entry.score = score;
  entry.updatedAt = Date.now();
  persist();
}

export async function recordFeedback(
  id: string,
  feedback: string,
  score?: number,
): Promise<void> {
  ensureLoaded();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;
  entry.feedback = feedback;
  if (score !== undefined) entry.score = score;
  entry.updatedAt = Date.now();
  persist();
}

export async function getRecentByCategory(
  category: string,
  limit = 20,
): Promise<IntelligenceEntry[]> {
  ensureLoaded();
  return entries
    .filter((e) => e.category === category)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

export async function getTopPerformers(
  category: string,
  limit = 10,
): Promise<IntelligenceEntry[]> {
  ensureLoaded();
  return entries
    .filter((e) => e.category === category && e.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);
}

export async function getWorstPerformers(
  category: string,
  limit = 10,
): Promise<IntelligenceEntry[]> {
  ensureLoaded();
  return entries
    .filter((e) => e.category === category && e.score !== null)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
    .slice(0, limit);
}

export async function getById(id: string): Promise<IntelligenceEntry | undefined> {
  ensureLoaded();
  return entries.find((e) => e.id === id);
}

export async function getStats(
  category: string,
): Promise<{ total: number; avgScore: number; improvedOverTime: boolean }> {
  ensureLoaded();
  const cat = entries.filter((e) => e.category === category);
  const scored = cat.filter((e) => e.score !== null);
  const total = cat.length;
  const avgScore =
    scored.length > 0
      ? scored.reduce((sum, e) => sum + (e.score ?? 0), 0) / scored.length
      : 0;

  // Check if recent scores are higher than older scores
  let improvedOverTime = false;
  if (scored.length >= 10) {
    const sorted = [...scored].sort((a, b) => a.createdAt - b.createdAt);
    const half = Math.floor(sorted.length / 2);
    const olderAvg =
      sorted.slice(0, half).reduce((s, e) => s + (e.score ?? 0), 0) / half;
    const newerAvg =
      sorted.slice(half).reduce((s, e) => s + (e.score ?? 0), 0) /
      (sorted.length - half);
    improvedOverTime = newerAvg > olderAvg;
  }

  return { total, avgScore: Math.round(avgScore * 10) / 10, improvedOverTime };
}

export async function getAllCategories(): Promise<string[]> {
  ensureLoaded();
  return [...new Set(entries.map((e) => e.category))];
}
