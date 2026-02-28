import { query } from './db';
import { loadPlaybook } from '../config/loader';
import { getAgent } from '../core/agent-registry';
import { isEnabled } from '../core/toggles';
import { LeadState } from './state-updater';
import { GunnerEvent } from '../core/event-bus';

let _running = false;
let _lastTickAt: Date | null = null;

export function startPoller(intervalMs = 60000) {
  console.log(`[poller] Starting state engine poller (interval=${intervalMs}ms)`);
  _running = true;
  setInterval(async () => {
    _lastTickAt = new Date();
    try {
      await runPoller();
    } catch (err) {
      console.error('[poller] run failed:', err);
    }
  }, intervalMs);
  // First tick after 10s
  setTimeout(async () => {
    _lastTickAt = new Date();
    try { await runPoller(); } catch (e) { console.error('[poller] first tick failed:', e); }
  }, 10_000);
}

export function getPollerStatus(): { running: boolean; lastTickAt: Date | null } {
  return { running: _running, lastTickAt: _lastTickAt };
}

const runPoller = async () => {
  // Load config for NAH tenant (default)
  const playbook = await loadPlaybook('nah');
  const stages = playbook.crm?.pipelines?.sales?.stages || {};
  
  if (!stages.new_lead) {
    console.warn('[poller] new_lead stage not defined in playbook, skipping speed-to-lead');
    return;
  }

  // 1. Speed to Lead
  await checkSpeedToLead(stages.new_lead);

  // 2. Ghosted
  // Need ghosted stage ID to skip if already ghosted?
  // Spec says: 'ghosted' not in tags.
  await checkGhosted();

  // 3. Stale Stage
  // Terminal stages
  const terminal = [
    stages.purchased, 
    stages.sold, 
    stages.do_not_want, 
    stages.ghosted
  ].filter(Boolean);
  await checkStaleStage(terminal);

  // 4. Warm No Call
  const warmStages = [stages.warm, stages.hot].filter(Boolean);
  await checkWarmNoCall(warmStages);
};

const checkSpeedToLead = async (newLeadStageId: string) => {
  const triggerId = 'speed-to-lead-violation';
  const sql = `
    SELECT * FROM lead_state 
    WHERE current_stage = $1 
      AND last_outbound_at IS NULL
      AND stage_entered_at < NOW() - INTERVAL '3 minutes'
      AND tenant_id = 'nah'
  `;
  const res = await query(sql, [newLeadStageId]);
  
  for (const lead of res.rows) {
    if (await shouldFire(lead.contact_id, triggerId, 30)) { // 30 min cooldown
      await fireTrigger(lead, triggerId, ['speed-to-lead-alert']);
    }
  }
};

const checkGhosted = async () => {
  const triggerId = 'ghosted-detection';
  const sql = `
    SELECT * FROM lead_state
    WHERE last_inbound_at IS NULL
      AND outreach_count >= 3
      AND stage_entered_at < NOW() - INTERVAL '14 days'
      AND NOT ('ghosted' = ANY(tags))
      AND tenant_id = 'nah'
  `;
  const res = await query(sql);

  for (const lead of res.rows) {
    if (await shouldFire(lead.contact_id, triggerId, 1440)) { // 24h cooldown
      await fireTrigger(lead, triggerId, ['ghosted-agent']);
    }
  }
};

const checkStaleStage = async (terminalStageIds: string[]) => {
  const triggerId = 'stale-stage-48h';
  if (terminalStageIds.length === 0) return;
  
  // Need to dynamically build NOT IN clause
  const placeholders = terminalStageIds.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `
    SELECT * FROM lead_state
    WHERE stage_entered_at < NOW() - INTERVAL '48 hours'
      AND updated_at < NOW() - INTERVAL '24 hours'
      AND current_stage NOT IN (${placeholders})
      AND tenant_id = 'nah'
  `;
  const res = await query(sql, terminalStageIds);

  for (const lead of res.rows) {
    if (await shouldFire(lead.contact_id, triggerId, 1440)) { // 24h cooldown
      await fireTrigger(lead, triggerId, ['reality-check']);
    }
  }
};

const checkWarmNoCall = async (warmStageIds: string[]) => {
  const triggerId = 'warm-no-call-24h';
  if (warmStageIds.length === 0) return;

  const placeholders = warmStageIds.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `
    SELECT * FROM lead_state
    WHERE current_stage IN (${placeholders})
      AND last_call_at IS NULL
      AND stage_entered_at < NOW() - INTERVAL '24 hours'
      AND tenant_id = 'nah'
  `;
  const res = await query(sql, warmStageIds);

  for (const lead of res.rows) {
    if (await shouldFire(lead.contact_id, triggerId, 240)) { // 4h cooldown
      await fireTrigger(lead, triggerId, ['accountability-agent']);
    }
  }
};

const shouldFire = async (contactId: string, triggerId: string, cooldownMinutes: number) => {
  const res = await query(`
    SELECT fired_at FROM trigger_log 
    WHERE contact_id = $1 AND trigger_id = $2 
    ORDER BY fired_at DESC LIMIT 1
  `, [contactId, triggerId]);

  if (res.rowCount && res.rowCount > 0) {
    const firedAt = new Date(res.rows[0].fired_at).getTime();
    if (Date.now() - firedAt < cooldownMinutes * 60000) {
      return false;
    }
  }
  return true;
};

const fireTrigger = async (lead: any, triggerId: string, agents: string[]) => {
  // Log fire
  await query(`
    INSERT INTO trigger_log (tenant_id, contact_id, trigger_id, metadata)
    VALUES ($1, $2, $3, $4)
  `, [lead.tenant_id, lead.contact_id, triggerId, JSON.stringify({ agents, stageId: lead.current_stage })]);

  console.log(`[poller] firing ${triggerId} for contact ${lead.contact_id} -> agents: ${agents.join(', ')}`);

  // Fire agents
  for (const agentId of agents) {
    if (!isEnabled(agentId)) {
      // console.log(`[poller] agent ${agentId} disabled`);
      continue;
    }
    
    const handler = getAgent(agentId);
    if (!handler) {
      console.warn(`[poller] agent ${agentId} not found`);
      continue;
    }

    try {
      // Create a synthetic event
      const event: GunnerEvent = {
        kind: 'lead.re-engage', // Generic kind for poller events? Or maybe specific kinds per trigger?
                                // Spec doesn't specify event kind for poller.
                                // 'lead.re-engage' or 'coaching.flag' might be appropriate?
                                // Let's use 'lead.scored' or just a dummy kind since we invoke handler directly.
                                // HOWEVER, handler expects event.kind to be correct usually.
                                // Spec says "Emit events to agent bus".
                                // If I use getAgent, I pass an event.
        tenantId: lead.tenant_id,
        contactId: lead.contact_id,
        opportunityId: lead.opportunity_id,
        stageId: lead.current_stage,
        raw: { triggerId },
        receivedAt: Date.now()
      };
      
      await handler(event);
    } catch (err) {
      console.error(`[poller] agent ${agentId} failed:`, err);
    }
  }
};
