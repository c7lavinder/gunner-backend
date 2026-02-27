/**
 * CRM Sync — the ONE and ONLY GHL poller.
 * Detects new leads, stage changes, completed calls.
 * Emits GunnerEvents. Never calls agents directly.
 */

import { emit } from './event-bus';
import { ghlGet, getLocationId } from '../integrations/ghl/client';
import { getConfig, stageId, pipelineId } from '../playbook/config';

const POLL_INTERVAL_MS = Number(process.env.CRM_SYNC_INTERVAL_MS ?? 60_000);
const IDEMPOTENCY_WINDOW_MS = Number(process.env.IDEMPOTENCY_WINDOW_MS ?? 86_400_000); // 24h

const processed = new Map<string, number>(); // opportunityId → processedAt

function isAlreadyProcessed(id: string): boolean {
  const ts = processed.get(id);
  if (!ts) return false;
  if (Date.now() - ts > IDEMPOTENCY_WINDOW_MS) {
    processed.delete(id);
    return false;
  }
  return true;
}

function markProcessed(id: string) {
  processed.set(id, Date.now());
}

async function scanNewLeads() {
  const locationId = getLocationId();
  const newLeadStageId = stageId('newLead');

  let page = 0;
  let lastId: string | undefined;
  const MAX_PAGES = 20;

  while (page < MAX_PAGES) {
    const params: Record<string, string> = {
      location_id: locationId,
      pipeline_id: pipelineId('salesProcess'),
      limit: '100',
    };
    if (lastId) params.startAfterId = lastId;

    const res = await ghlGet<any>('/opportunities/search', params);
    const opps: any[] = res?.opportunities ?? [];
    if (opps.length === 0) break;

    for (const opp of opps) {
      if (opp.pipelineStageId !== newLeadStageId) continue;
      if (isAlreadyProcessed(opp.id)) continue;

      markProcessed(opp.id);
      await emit({
        kind: 'opportunity.created',
        tenantId: 'default',
        contactId: opp.contactId,
        opportunityId: opp.id,
        stageId: opp.pipelineStageId,
        stageName: 'newLead',
        raw: opp,
        receivedAt: Date.now(),
      });
    }

    lastId = opps[opps.length - 1]?.id;
    if (!res?.meta?.nextPageUrl) break;
    page++;
  }
}

let running = false;

async function cycle() {
  if (running) return;
  running = true;
  try {
    await scanNewLeads();
    // Future: scan for completed calls, inbound messages, stage changes
  } catch (err) {
    console.error('[crm-sync] cycle error:', err);
  } finally {
    running = false;
  }
}

export function startCrmSync() {
  console.log(`[crm-sync] starting — interval ${POLL_INTERVAL_MS}ms`);
  setTimeout(cycle, 5_000); // first scan 5s after boot
  setInterval(cycle, POLL_INTERVAL_MS);
}

export async function forceSync(contactId?: string, opportunityId?: string) {
  if (contactId && opportunityId) {
    // Clear idempotency for this specific lead and re-emit
    processed.delete(opportunityId);
    await emit({
      kind: 'opportunity.created',
      tenantId: 'default',
      contactId,
      opportunityId,
      stageId: stageId('newLead'),
      stageName: 'newLead',
      receivedAt: Date.now(),
    });
  } else {
    // Full scan ignoring idempotency
    processed.clear();
    await cycle();
  }
}
