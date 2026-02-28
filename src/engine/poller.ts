import { query } from './db';
import { emit, GunnerEvent } from '../core/event-bus';
import { loadPlaybook } from '../config/loader';
import { auditLog } from '../core/audit';

const POLLER_INTERVAL_MS = 60000; // 60s

export function startPoller() {
  console.log('[poller] Starting state engine poller...');
  setInterval(runTick, POLLER_INTERVAL_MS);
}

async function runTick() {
  try {
    const playbook = await loadPlaybook('nah'); // defaulting to 'nah' for now
    if (!playbook) return;

    await checkSpeedToLead(playbook);
    await checkGhosted(playbook);
    await checkStaleStage(playbook);
    await checkWarmNoCall(playbook);

  } catch (err) {
    console.error('[poller] tick failed:', err);
  }
}

// 1. Speed to Lead: New Lead stage, no outbound in 3 mins
async function checkSpeedToLead(playbook: any) {
  const newLeadStageId = playbook.crm?.pipelines?.sales?.stages?.new_lead;
  if (!newLeadStageId) return;

  const sql = `
    SELECT * FROM lead_state
    WHERE current_stage = $1
      AND last_outbound_at IS NULL
      AND stage_entered_at < NOW() - INTERVAL '3 minutes'
      AND tenant_id = 'nah'
  `;

  const { rows } = await query(sql, [newLeadStageId]);
  for (const lead of rows) {
    await fireTriggerIfCool(lead, 'speed-to-lead', 30, ['speed-to-lead-alert']);
  }
}

// 2. Ghosted: Outreach >= 3, No Inbound, > 14 days in stage
async function checkGhosted(playbook: any) {
  // We check if they are NOT already tagged 'ghosted'
  // and NOT in terminal stages (sold, purchased, do_not_want)
  const sql = `
    SELECT * FROM lead_state
    WHERE last_inbound_at IS NULL
      AND outreach_count >= 3
      AND stage_entered_at < NOW() - INTERVAL '14 days'
      AND NOT ('ghosted' = ANY(tags))
      AND tenant_id = 'nah'
  `;

  const { rows } = await query(sql);
  for (const lead of rows) {
    await fireTriggerIfCool(lead, 'ghosted-detection', 1440, ['ghosted-agent']);
  }
}

// 3. Stale Stage: > 48h in stage, not terminal
async function checkStaleStage(playbook: any) {
  // Filter out terminal stages
  const salesStages = playbook.crm?.pipelines?.sales?.stages || {};
  const terminalStages = [
    salesStages.purchased,
    salesStages.sold,
    salesStages.do_not_want,
    salesStages.ghosted
  ].filter(Boolean);

  if (terminalStages.length === 0) return;

  const sql = `
    SELECT * FROM lead_state
    WHERE stage_entered_at < NOW() - INTERVAL '48 hours'
      AND updated_at < NOW() - INTERVAL '24 hours'
      AND current_stage != ALL($1)
      AND tenant_id = 'nah'
  `;

  const { rows } = await query(sql, [terminalStages]);
  for (const lead of rows) {
    await fireTriggerIfCool(lead, 'stale-stage', 1440, ['reality-check']);
  }
}

// 4. Warm No Call: Warm/Hot stage, no call in 24h
async function checkWarmNoCall(playbook: any) {
  const warmStage = playbook.crm?.pipelines?.sales?.stages?.warm;
  const hotStage = playbook.crm?.pipelines?.sales?.stages?.hot;
  
  const targetStages = [warmStage, hotStage].filter(Boolean);
  if (targetStages.length === 0) return;

  const sql = `
    SELECT * FROM lead_state
    WHERE current_stage = ANY($1)
      AND last_call_at IS NULL
      AND stage_entered_at < NOW() - INTERVAL '24 hours'
      AND tenant_id = 'nah'
  `;

  const { rows } = await query(sql, [targetStages]);
  for (const lead of rows) {
    await fireTriggerIfCool(lead, 'warm-no-call', 240, ['accountability-agent']);
  }
}

/**
 * Fires trigger if cooldown period has passed.
 * @param lead The lead_state row
 * @param triggerId The unique ID of the trigger logic
 * @param cooldownMinutes How long to wait before firing again
 * @param agents List of agents to notify/emit
 */
async function fireTriggerIfCool(lead: any, triggerId: string, cooldownMinutes: number, agents: string[]) {
  const { contact_id, tenant_id } = lead;

  // Check last fire time
  const lastFireRes = await query(
    `SELECT fired_at FROM trigger_log 
     WHERE contact_id = $1 AND trigger_id = $2 
     ORDER BY fired_at DESC LIMIT 1`,
    [contact_id, triggerId]
  );

  if (lastFireRes.rows.length > 0) {
    const lastFire = new Date(lastFireRes.rows[0].fired_at).getTime();
    const diffMinutes = (Date.now() - lastFire) / 60000;
    if (diffMinutes < cooldownMinutes) {
      return; // Cooldown active
    }
  }

  // Log fire
  await query(
    `INSERT INTO trigger_log (tenant_id, contact_id, trigger_id, metadata) VALUES ($1, $2, $3, $4)`,
    [tenant_id, contact_id, triggerId, JSON.stringify({ agents, stage: lead.current_stage })]
  );

  console.log(`[poller] Firing trigger ${triggerId} for contact ${contact_id}`);

  // Emit event for agents
  // We construct a synthetic event so agents pick it up
  const event: GunnerEvent = {
    kind: 'lead.re-engage', // or a custom kind like 'trigger.fired'
    tenantId: tenant_id,
    contactId: contact_id,
    opportunityId: lead.opportunity_id,
    stageId: lead.current_stage,
    metadata: {
      triggerId,
      agents,
      reason: `Poller: ${triggerId}`
    },
    receivedAt: Date.now()
  };

  auditLog({
    agent: 'state-engine-poller',
    contactId: contact_id,
    action: `trigger:${triggerId}`,
    result: 'fired',
    metadata: { agents }
  });

  await emit(event);
}
