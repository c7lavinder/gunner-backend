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
    // ── New Lead Chain ─────────────────────────────────────────────────────
    // Step 1: GHL fires opportunity.created → new-lead-pipeline detects it
    { event: 'opportunity.created', agentId: 'new-lead-pipeline',
      condition: (e) => e.stageId === config.stages.newLead },

    // Step 2: new-lead-pipeline emits lead.new → lead-scorer scores it
    { event: 'lead.new', agentId: 'lead-scorer' },

    // Step 3: lead-scorer emits lead.scored → tagger, noter, task-creator all fire independently
    { event: 'lead.scored', agentId: 'lead-tagger' },
    { event: 'lead.scored', agentId: 'lead-noter' },
    { event: 'lead.scored', agentId: 'lead-task-creator' },

    // ── Stage Changes ──────────────────────────────────────────────────────
    { event: 'opportunity.stage_changed', agentId: 'stage-change-router' },

    // ── Inbound Messages ───────────────────────────────────────────────────
    { event: 'inbound.message', agentId: 'response-agent' },

    // ── Calls ──────────────────────────────────────────────────────────────
    { event: 'call.completed', agentId: 'lm-assistant' },
  ];
}
