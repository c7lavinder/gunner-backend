# PHASE 2: Agent Wiring — Connect State Engine to Existing Agents

## Goal
Ensure every trigger in nah.json actually reaches the correct agent handler when the state engine fires it.

## Current State
- Agents registered in `src/core/registry.ts`
- Triggers defined in `src/playbooks/tenants/nah.json` under `crm.triggers`
- Event bus: `src/core/event-bus.ts` — `emit(event)` dispatches to registered handlers
- Trigger wiring: `src/core/triggers.ts` — `wireTriggers()` maps events to agents

## What to Verify/Fix

### 1. Trigger → Agent Mapping
Every `fires: [...]` entry in nah.json triggers must map to a registered agent:

| Trigger | Fires | Agent File |
|---------|-------|-----------|
| new_lead_enters_sales | new-lead-pipeline | src/agents/new-lead-pipeline.ts |
| lead_moves_to_warm | working-drip | src/agents/working-drip.ts |
| lead_moves_to_hot | working-drip | src/agents/working-drip.ts |
| lead_moves_to_under_contract | contract-bot, uc-monitor | src/agents/contract-bot.ts, uc-monitor.ts |
| lead_moves_to_purchased | post-close-bot | src/agents/post-close-bot.ts |
| lead_moves_to_ghosted | ghosted-agent | src/agents/ghosted-agent.ts |
| lead_moves_to_made_offer | offer-chase | src/agents/offer-chase.ts |
| lead_moves_to_follow_up_* | follow-up-organizer | src/agents/follow-up-organizer.ts |
| lead_moves_to_walkthrough_apt | apt-prep | src/agents/apt-prep.ts |
| lead_moves_to_offer_apt | apt-prep | src/agents/apt-prep.ts |
| inbound_sms | response-agent | src/agents/response-agent.ts |
| inbound_call | callback-capture | src/agents/callback-capture.ts |
| dispo_new_deal | buyer-matcher | src/agents/buyer-matcher.ts (may not exist) |
| dispo_clear_to_send | deal-blaster | src/agents/deal-blaster.ts (may not exist) |

### 2. New State Engine Triggers (from poller)
These are new — the poller fires them, agents need to handle:

| Trigger ID | Fires | What to do |
|-----------|-------|-----------|
| speed-to-lead-violation | speed-to-lead-alert | Create escalation task |
| ghosted-detection | ghosted-agent | Tag ghosted, adjust drip |
| stale-stage-48h | reality-check | Create review task |
| warm-no-call-24h | accountability-agent | Alert Jessica |

### 3. Test Flow
Process a lead through the full lifecycle and verify each stage fires the right agents:
1. New Lead → new-lead-pipeline fires (lead-scorer, lead-tagger, lead-noter, lead-task-creator, initial-outreach)
2. → Warm → working-drip fires
3. → Walkthrough Apt → apt-prep fires
4. → Made Offer → offer-chase fires
5. → Under Contract → contract-bot, uc-monitor, tc-packager, dispo-packager fire
6. → Purchased → post-close-bot fires

Each should produce an audit log entry showing the trigger fire and agent execution.
