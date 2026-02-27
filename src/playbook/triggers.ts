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

    // ── Dispo Pipeline ─────────────────────────────────────────────────────
    { event: 'opportunity.stage_changed', agentId: 'deal-intake',
      condition: (e) => e.stageId === config.stages.dispoNewDeal },
    { event: 'opportunity.stage_changed', agentId: 'deal-blaster',
      condition: (e) => e.stageId === config.stages.dispoClearToSend },
    { event: 'opportunity.stage_changed', agentId: 'offer-collector',
      condition: (e) => e.stageId === config.stages.dispoOffersReceived },
    { event: 'opportunity.stage_changed', agentId: 'jv-router',
      condition: (e) => e.stageId === config.stages.dispoWithJvPartner },
    { event: 'opportunity.stage_changed', agentId: 'deal-terminator',
      condition: (e) => e.stageId === config.stages.dispoNeedToTerminate },
    { event: 'opportunity.stage_changed', agentId: 'dispo-closer',
      condition: (e) => e.stageId === config.stages.dispoUcWithBuyer },
    { event: 'opportunity.stage_changed', agentId: 'title-coordinator',
      condition: (e) => e.stageId === config.stages.dispoWorkingWithTitle },
    { event: 'opportunity.stage_changed', agentId: 'dispo-closing-agent',
      condition: (e) => e.stageId === config.stages.dispoClosed },

    // Dispo deal intake also triggers buyer matching
    { event: 'opportunity.stage_changed', agentId: 'buyer-matcher',
      condition: (e) => e.stageId === config.stages.dispoNewDeal },

    // Contract packager
    { event: 'contract.package.dispo', agentId: 'dispo-packager' },

    // ── Buyer Pipeline ─────────────────────────────────────────────────────
    { event: 'opportunity.stage_changed', agentId: 'buyer-intake',
      condition: (e) => e.stageId === config.stages.buyerNewBuyer },
    { event: 'opportunity.stage_changed', agentId: 'showing-manager',
      condition: (e) => e.stageId === config.stages.buyerShowingScheduled },

    // Buyer response fires on inbound messages from buyers
    { event: 'buyer.response', agentId: 'buyer-qualifier' },
  ];
}
