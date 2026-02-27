/**
 * Playbook Config Loader
 *
 * loadPlaybook(tenantId) → merged config
 *   1. Loads tenant JSON (e.g. tenants/nah.json)
 *   2. Resolves parent industry JSON (e.g. industries/wholesale.json)
 *   3. Deep merges: tenant wins over industry defaults
 */

import { readFile } from 'fs/promises';
import { join } from 'path';

const PLAYBOOK_DIR = process.env.PLAYBOOK_DIR ?? join(__dirname, '../../playbooks');

// In-memory cache (TTL-based)
const cache = new Map<string, { data: any; loadedAt: number }>();
const CACHE_TTL_MS = 5 * 60_000; // 5 minutes

function deepMerge(base: any, override: any): any {
  if (!base || typeof base !== 'object') return override;
  if (!override || typeof override !== 'object') return override;
  if (Array.isArray(override)) return override;

  const result = { ...base };
  for (const key of Object.keys(override)) {
    if (
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key]) &&
      typeof override[key] === 'object' &&
      override[key] !== null &&
      !Array.isArray(override[key])
    ) {
      result[key] = deepMerge(result[key], override[key]);
    } else {
      result[key] = override[key];
    }
  }
  return result;
}

async function loadJSON(filePath: string): Promise<any> {
  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

export async function loadPlaybook(tenantId: string): Promise<any> {
  // Check cache
  const cached = cache.get(tenantId);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  // Load tenant config
  const tenantPath = join(PLAYBOOK_DIR, 'tenants', `${tenantId}.json`);
  let tenantConfig: any;
  try {
    tenantConfig = await loadJSON(tenantPath);
  } catch {
    throw new Error(`Playbook not found for tenant: ${tenantId}`);
  }

  // Resolve and load industry parent
  let merged = tenantConfig;
  if (tenantConfig.industry) {
    const industryPath = join(PLAYBOOK_DIR, 'industries', `${tenantConfig.industry}.json`);
    try {
      const industryConfig = await loadJSON(industryPath);
      merged = deepMerge(industryConfig, tenantConfig);
    } catch {
      // Industry file missing — tenant config stands alone
    }
  }

  cache.set(tenantId, { data: merged, loadedAt: Date.now() });
  return merged;
}

/** Clear cache (for testing or hot-reload) */
export function clearPlaybookCache(): void {
  cache.clear();
}
