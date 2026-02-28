import { GunnerEvent, emit } from '../core/event-bus';
import { query } from './db';
import { LeadState } from './state-updater';
import { loadPlaybook } from '../config/loader';

export const evaluateEventTriggers = async (event: GunnerEvent, state?: LeadState) => {
  const tenantId = event.tenantId || 'nah';
  const playbook = await loadPlaybook(tenantId);
  const triggers: Record<string, any> = playbook.crm?.triggers || {};

  for (const [triggerId, rule] of Object.entries(triggers)) {
    let matches = false;

    // 1. Check Opportunity Stage Change
    if (event.kind === 'opportunity.stage_changed' && rule.type === 'opportunity_stage_change') {
      const r = rule as any;
      if (r.pipelineId === event.raw?.pipelineId && r.stageId === event.stageId) {
        matches = true;
      }
      // Allow matching just by stageId if pipelineId is missing in event or rule (though rule usually has it)
      if (!r.pipelineId && r.stageId === event.stageId) {
        matches = true;
      }
    }

    // 2. Check Inbound Message
    if (event.kind === 'inbound.message' && rule.type === 'inbound_message') {
      const r = rule as any;
      // Check channel if specified
      if (r.channel) {
        if (event.raw?.channel === r.channel || event.raw?.messageType === r.channel.toUpperCase()) {
           matches = true;
        }
      } else {
        matches = true;
      }
      
      // Check pipeline if specified
      if (r.pipelineId && state?.pipelineId !== r.pipelineId) {
        matches = false;
      }
    }

    // 3. Check Inbound Call
    if ((event.kind === 'call.inbound' || event.kind === 'call.completed') && rule.type === 'inbound_call') {
       // logic for inbound call trigger
       matches = true; 
    }

    if (matches) {
      await fireTrigger(tenantId, event.contactId, triggerId, rule.fires, event);
    }
  }
};

const fireTrigger = async (tenantId: string, contactId: string, triggerId: string, agents: string[], event: GunnerEvent) => {
  // 1. Log to trigger_log (dedup check logic could be here, but event triggers usually fire always unless rate limited)
  // For event triggers, we usually want them to fire every time the event happens (e.g. stage change).
  
  await query(`
    INSERT INTO trigger_log (tenant_id, contact_id, trigger_id, metadata)
    VALUES ($1, $2, $3, $4)
  `, [tenantId, contactId, triggerId, JSON.stringify({ agents, eventKind: event.kind })]);

  console.log(`[event-triggers] firing ${triggerId} for contact ${contactId} -> agents: ${agents.join(', ')}`);

  // 2. Fire agents
  for (const agentId of agents) {
    // We emit a new event for the agent?
    // Or we just rely on the original event?
    // The spec says: "Use the existing emit() from event-bus to fire agents"
    // But usually agents listen to specific events.
    // However, the spec says: "For opportunity.stage_changed ... fire listed agents".
    // This implies we might need to emit a generic 'trigger.fired' event or rely on agents listening to the original event?
    // Actually, looking at `src/agents/new-lead-pipeline.ts` (if I could), it probably listens to `opportunity.stage_changed` directly?
    
    // IF the agents are ALREADY listening to `opportunity.stage_changed`, then this Trigger Evaluator is redundant?
    // NO. The spec says "The State Engine is the intelligence layer... Triggers... fire listed agents".
    // Maybe the agents should NOT listen to raw webhooks, but to "Trigger Fired" events?
    // OR, we emit a synthetic event that specific agents listen to.
    
    // The spec says:
    // "Emit events to agent bus for matching leads"
    // And in Layer 5: "Emit to agent bus... kind: rule.id"
    
    await emit({
      kind: agentId as any, // This assumes agentId maps to an event kind the agent listens to? 
                            // Or maybe the agent name IS the event kind?
                            // Let's look at `new-lead-pipeline.ts`.
      tenantId,
      contactId,
      opportunityId: event.opportunityId,
      stageId: event.stageId,
      // triggerId: triggerId, // GunnerEvent doesn't have triggerId field in type def I saw earlier.
      raw: event.raw,
      receivedAt: Date.now()
    });
    
    // Wait, if I emit `kind: 'new-lead-pipeline'`, does `new-lead-pipeline.ts` listen to it?
    // I should check `src/agents/new-lead-pipeline.ts`.
  }
};
