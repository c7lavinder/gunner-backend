# BUILD QUEUE — State Engine Weekend Sprint

## Phase 1: Foundation ← BUILDER WORKING NOW
- [x] Spawn builder-state-engine
- [ ] DB module (pool, initDB, tables)
- [ ] State updater (event → lead_state)
- [ ] Event triggers (stage change → fire agents)
- [ ] Time poller (speed-to-lead, ghosted, stale, warm-no-call)
- [ ] Wire into webhooks.ts + server.ts
- [ ] Verify: tsc clean, audit log shows events stored

## Phase 2: Agent Wiring
- [ ] Verify all nah.json triggers map to real agents
- [ ] Test: webhook → event store → state update → trigger → agent fires
- [ ] Dry run output shows full pipeline for a new lead

## Phase 3: Dashboard Visibility  
- [ ] API endpoint: GET /api/state/:contactId — show lead state
- [ ] API endpoint: GET /api/triggers/recent — show recent trigger fires
- [ ] API endpoint: GET /api/events/:contactId — show event history
- [ ] Update Command Center dashboard to show state engine data

## Phase 4: Hardening
- [ ] Error handling: poller doesn't crash on bad data
- [ ] Reconnection: DB pool handles Railway restarts
- [ ] Dedup: same trigger doesn't fire twice in cooldown window
- [ ] Verify: 100 events don't overwhelm the system

## Phase 5: Validation
- [ ] Move real lead through full pipeline (New Lead → Warm → Hot → Apt → UC)
- [ ] Verify each stage change fires correct agents
- [ ] Verify time triggers fire (speed-to-lead after 3 min)
- [ ] Corey reviews audit output
- [ ] Green light for DRY_RUN=false (Corey's call)
