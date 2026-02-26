/**
 * Triggers — defines which agents fire on which events.
 * This is the ONLY place event→agent wiring lives.
 * Add a trigger here. Zero other files change.
 */

import { EventKind, GunnerEvent } from '../core/event-bus';
import { getConfig } from './config';

export interface TriggerConfig {
  event: EventKind;
  agentId: string;
  condition?: (event: GunnerEvent) => boolean;
}

export function getTriggers(): TriggerConfig[] {
  const config = getConfig();

  return [
    // New lead enters Sales Process → new-lead-pipeline
    {
      event: 'opportunity.created',
      agentId: 'new-lead-pipeline',
      condition: (e) => e.stageId === config.stages.newLead,
    },

    // Stage changes → stage-change-router (decides what happens next)
    {
      event: 'opportunity.stage_changed',
      agentId: 'stage-change-router',
    },

    // Inbound message from lead → response-agent
    {
      event: 'inbound.message',
      agentId: 'response-agent',
    },

    // LM call completed → lm-assistant
    {
      event: 'call.completed',
      agentId: 'lm-assistant',
    },

    // Add more triggers here as agents are built.
    // Format: { event, agentId, condition? }
  ];
}
