import { GunnerEvent } from '../core/event-bus';
import { query } from './db';
import { LeadState } from './state-updater';
import { loadPlaybook } from '../config/loader';
import { getAgent } from '../core/agent-registry';
import { isEnabled } from '../core/toggles';

interface TriggerRule {
  type: string;
  pipelineId?: string;
  stageId?: string;
  channel?: string;
  fires: string[];
}

export const evaluateEventTriggers = async (event: GunnerEvent, state?: LeadState) => {
  const tenantId = event.tenantId || 'nah';
  // Assuming loadPlaybook returns an object that has crm.triggers
  const playbook = await loadPlaybook(tenantId);
  const triggers = (playbook.crm?.triggers || {}) as Record<string, TriggerRule>;

  for (const [triggerId, rule] of Object.entries(triggers)) {
    let matches = false;

    // 1. Check Opportunity Stage Change
    if (event.kind === 'opportunity.stage_changed' && rule.type === 'opportunity_stage_change') {
      // Check pipelineId (optional match)
      if (rule.pipelineId && rule.pipelineId !== (event.raw as any)?.pipelineId) {
        // pipeline mismatch
      } else {
        // pipeline matches or is not specified
        if (rule.stageId === event.stageId) {
          matches = true;
        }
      }
    }

    // 2. Check Inbound Message
    if (event.kind === 'inbound.message' && rule.type === 'inbound_message') {
      // Check channel if specified
      if (rule.channel) {
        const raw = event.raw as any;
        const eventChannel = raw?.channel || raw?.messageType; // adjust based on actual raw payload structure
        if (eventChannel && eventChannel.toLowerCase() === rule.channel.toLowerCase()) {
           matches = true;
        }
      } else {
        matches = true;
      }
      
      // Check pipeline if specified (optional)
      if (rule.pipelineId && state?.pipelineId !== rule.pipelineId) {
        matches = false;
      }
    }

    // 3. Check Inbound Call
    if ((event.kind === 'call.inbound' || event.kind === 'call.completed') && rule.type === 'inbound_call') {
       matches = true; 
    }

    if (matches) {
      await fireTrigger(tenantId, event.contactId, triggerId, rule.fires, event);
    }
  }
};

const fireTrigger = async (tenantId: string, contactId: string, triggerId: string, agents: string[], event: GunnerEvent) => {
  // 1. Log to trigger_log
  await query(`
    INSERT INTO trigger_log (tenant_id, contact_id, trigger_id, metadata)
    VALUES ($1, $2, $3, $4)
  `, [tenantId, contactId, triggerId, JSON.stringify({ agents, eventKind: event.kind })]);

  console.log(`[event-triggers] firing ${triggerId} for contact ${contactId} -> agents: ${agents.join(', ')}`);

  // 2. Fire agents
  for (const agentId of agents) {
    if (!isEnabled(agentId)) {
      console.log(`[event-triggers] agent ${agentId} is disabled, skipping`);
      continue;
    }

    const handler = getAgent(agentId);
    if (!handler) {
      console.warn(`[event-triggers] agent ${agentId} not found in registry`);
      continue;
    }

    try {
      await handler(event);
    } catch (err) {
      console.error(`[event-triggers] agent ${agentId} failed:`, err);
    }
  }
};
