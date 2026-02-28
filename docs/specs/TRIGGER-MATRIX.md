# TRIGGER MATRIX — Every Trigger Gunner Needs

## Current Event Triggers (webhook-driven, fire immediately)

### Stage Change Triggers (opportunity_stage_change)
All 24 triggers in nah.json — WORKING via event-triggers.ts.
These fire when GHL sends OpportunityStageUpdate webhook.

### Message Triggers (inbound_message)
- inbound_sms → response-agent
- buyer_inbound_sms → buyer-response
These fire on InboundMessage webhook.

### Call Triggers (inbound_call)  
- inbound_call → callback-capture
Fires on InboundCall webhook (not yet tested — GHL may send as different event type).

## Current Time Triggers (poller-driven, every 60s)
- speed-to-lead (3 min no outbound after new lead)
- ghosted-detection (14 days no response, 3+ outreach)
- stale-stage (48h stuck in stage)
- warm-no-call (24h in warm/hot, no call)

## MISSING Triggers — Need to Build

### Time-Based (add to poller)
| ID | Description | Condition |
|---|---|---|
| drip-due | Next drip touch is due | drip_active=true AND drip_next_at <= NOW() |
| task-overdue | Task past deadline | Need tasks table or GHL task tracking |
| uc-seller-quiet | UC seller quiet 5 days | stage=under_contract AND last_inbound > 5d |
| apt-reminder-24h | Appointment tomorrow | Need appointments table |
| apt-reminder-2h | Appointment in 2 hours | Need appointments table |
| offer-chase-3d | Offer made, no response 3 days | stage=made_offer AND stage_entered > 3d |
| offer-chase-7d | Offer made, no response 7 days | stage=made_offer AND stage_entered > 7d |
| offer-chase-14d | Offer made, no response 14 days | stage=made_offer AND stage_entered > 14d |
| follow-up-touch-due | Follow-up bucket touch due | Need fu_next_touch_at on lead_state |
| accountability-yellow | Task overdue 15 min | Need task tracking |
| accountability-orange | Task overdue 30 min | Need task tracking |
| accountability-red | Task overdue 60 min | Need task tracking |

### AI-Driven (classify on event, then fire)
| ID | Description | When |
|---|---|---|
| concern-detected | Seller backing out signals | Inbound message in UC stage |
| interest-rekindle | Old lead shows interest | Inbound message in follow-up stages |
| price-objection | Seller pushes back on price | Inbound message during negotiation |
| already-sold | Seller says property sold | Any inbound message |
| wrong-number | Lead says wrong number | Any inbound message |
| dnc-request | Lead requests no contact | Any inbound message |
| double-dial | Two calls, no answer | Call events within 2h window |

### Composite Triggers (combine multiple events)
| ID | Description | Logic |
|---|---|---|
| no-same-day-offer | Walkthrough done, no offer by EOD | Walkthrough apt completed + no stage change to made_offer by midnight |
| lm-not-calling | LM has leads but no calls in 4h | Assigned leads exist + no call events |
| hot-lead-no-apt | Hot lead, no appointment in 48h | tier=hot + no apt set after 48h |

### External Data Triggers (future)
| ID | Description | Source |
|---|---|---|
| property-value-change | Zestimate changed significantly | BatchLeads polling |
| market-shift | Comparable sales spike/drop | External data |
| voicemail-received | New voicemail from lead | CallRail webhook |

## What Needs to Happen

### 1. Register ALL agents in registry.ts
29 agents have files but aren't registered. Without registration, emit() can't reach them.

### 2. Add missing time triggers to poller
- drip-due, uc-seller-quiet, offer-chase series, follow-up-touch-due
- Need additional columns on lead_state: drip_next_at, fu_next_touch_at

### 3. Add AI classifier trigger type to event-triggers.ts  
- After message events, run AI classification
- If classification matches trigger rule, fire agent

### 4. Add composite trigger support
- Track event sequences in events table
- Poller can check "event A happened but event B didn't within window"

### 5. Add external data trigger support (future)
- Polling external APIs on schedule
- Webhook receivers for CallRail, BatchLeads, etc.

## The Goal
Any trigger that can be expressed as:
- "When X event happens" → event trigger
- "When condition Y is true for Z duration" → time trigger  
- "When AI classifies message as Z" → AI trigger
- "When A happened but B didn't within window" → composite trigger

ALL should be config-driven in the playbook JSON. No code changes to add a new trigger.
