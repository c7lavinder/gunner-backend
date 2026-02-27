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
    // ══════════════════════════════════════════════════════════════════════
    // ── ACQUISITIONS PIPELINE (Sales Process) ─────────────────────────────
    // ══════════════════════════════════════════════════════════════════════

    // ── New Lead Chain ─────────────────────────────────────────────────────
    { event: 'opportunity.created', agentId: 'new-lead-pipeline',
      condition: (e) => e.stageId === config.stages.newLead },
    { event: 'lead.new', agentId: 'lead-scorer' },
    { event: 'lead.scored', agentId: 'lead-tagger' },
    { event: 'lead.scored', agentId: 'lead-noter' },
    { event: 'lead.scored', agentId: 'lead-task-creator' },
    { event: 'lead.scored', agentId: 'initial-outreach' },

    // ── Warm Stage ─────────────────────────────────────────────────────────
    { event: 'opportunity.stage_changed', agentId: 'working-drip',
      condition: (e) => e.stageId === config.stages.warm },

    // ── Hot Stage ──────────────────────────────────────────────────────────
    { event: 'opportunity.stage_changed', agentId: 'working-drip',
      condition: (e) => e.stageId === config.stages.hot },

    // ── Pending Appointment ────────────────────────────────────────────────
    { event: 'opportunity.stage_changed', agentId: 'apt-prep',
      condition: (e) => e.stageId === config.stages.pendingApt },

    // ── Walkthrough Appointment ────────────────────────────────────────────
    { event: 'opportunity.stage_changed', agentId: 'apt-prep',
      condition: (e) => e.stageId === config.stages.walkthrough },

    // ── Offer Appointment ──────────────────────────────────────────────────
    { event: 'opportunity.stage_changed', agentId: 'apt-prep',
      condition: (e) => e.stageId === config.stages.offerApt },

    // ── Made Offer ─────────────────────────────────────────────────────────
    { event: 'opportunity.stage_changed', agentId: 'offer-chase',
      condition: (e) => e.stageId === config.stages.madeOffer },
    { event: 'opportunity.stage_changed', agentId: 'offer-reply',
      condition: (e) => e.stageId === config.stages.madeOffer },

    // ── Under Contract ─────────────────────────────────────────────────────
    { event: 'opportunity.stage_changed', agentId: 'contract-bot',
      condition: (e) => e.stageId === config.stages.underContract },
    { event: 'opportunity.stage_changed', agentId: 'uc-monitor',
      condition: (e) => e.stageId === config.stages.underContract },
    { event: 'opportunity.stage_changed', agentId: 'tc-packager',
      condition: (e) => e.stageId === config.stages.underContract },
    // Also trigger dispo packaging when going under contract
    { event: 'opportunity.stage_changed', agentId: 'dispo-packager',
      condition: (e) => e.stageId === config.stages.underContract },

    // ── Purchased ──────────────────────────────────────────────────────────
    { event: 'opportunity.stage_changed', agentId: 'post-close-bot',
      condition: (e) => e.stageId === config.stages.purchased },

    // ── Ghosted ────────────────────────────────────────────────────────────
    { event: 'opportunity.stage_changed', agentId: 'ghosted-agent',
      condition: (e) => e.stageId === config.stages.ghosted },

    // ── Follow-Up Stages ───────────────────────────────────────────────────
    { event: 'opportunity.stage_changed', agentId: 'follow-up-organizer',
      condition: (e) => e.stageId === config.stages.oneMonthFU },
    { event: 'opportunity.stage_changed', agentId: 'follow-up-organizer',
      condition: (e) => e.stageId === config.stages.fourMonthFU },
    { event: 'opportunity.stage_changed', agentId: 'follow-up-organizer',
      condition: (e) => e.stageId === config.stages.oneYearFU },
    { event: 'opportunity.stage_changed', agentId: 'follow-up-messenger',
      condition: (e) => e.stageId === config.stages.oneMonthFU },
    { event: 'opportunity.stage_changed', agentId: 'follow-up-messenger',
      condition: (e) => e.stageId === config.stages.fourMonthFU },
    { event: 'opportunity.stage_changed', agentId: 'follow-up-messenger',
      condition: (e) => e.stageId === config.stages.oneYearFU },

    // ── Stage Change Router (catch-all for assignment logic) ───────────────
    { event: 'opportunity.stage_changed', agentId: 'stage-change-router' },

    // ── Inbound Messages ───────────────────────────────────────────────────
    { event: 'inbound.message', agentId: 'response-agent' },
    { event: 'inbound.message', agentId: 'callback-capture' },

    // ── Calls ──────────────────────────────────────────────────────────────
    { event: 'call.completed', agentId: 'lm-assistant' },
    { event: 'call.completed', agentId: 'call-coaching' },

    // ── Pollers (time-based, not event-triggered but registered here) ──────
    // apt-reminder-poller, reality-check-poller, bucket-reeval, 
    // accountability-agent, intelligence-poller — these run on timers

    // ══════════════════════════════════════════════════════════════════════
    // ── DISPO PIPELINE ────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════

    { event: 'opportunity.stage_changed', agentId: 'deal-intake',
      condition: (e) => e.stageId === config.stages.dispoNewDeal },
    { event: 'opportunity.stage_changed', agentId: 'buyer-matcher',
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

    // Contract packager (internal event)
    { event: 'contract.package.dispo', agentId: 'dispo-packager' },

    // ══════════════════════════════════════════════════════════════════════
    // ── BUYER PIPELINE ────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════════════════

    { event: 'opportunity.stage_changed', agentId: 'buyer-intake',
      condition: (e) => e.stageId === config.stages.buyerNewBuyer },
    { event: 'opportunity.stage_changed', agentId: 'showing-manager',
      condition: (e) => e.stageId === config.stages.buyerShowingScheduled },
    { event: 'buyer.response', agentId: 'buyer-qualifier' },
    { event: 'buyer.response', agentId: 'buyer-response' },
  ];
}
