# PHASE 3: Dashboard API — Make the State Engine Visible

## Goal
Expose the state engine data through API endpoints so the Command Center dashboard can show what's happening in real-time.

## Endpoints to Build

### GET /api/state/:contactId
Returns the current lead_state for a contact.
```json
{
  "contactId": "abc123",
  "currentStage": "Warm Leads(2)",
  "stageEnteredAt": "2026-02-27T21:30:00Z",
  "leadScore": 4,
  "leadTier": "hot",
  "assignedTo": "G1hAG3KNhzMerkEIvMr5",
  "lastOutboundAt": "2026-02-27T21:31:00Z",
  "lastInboundAt": null,
  "lastCallAt": null,
  "outreachCount": 1,
  "dripStep": 1,
  "dripActive": true,
  "tags": ["ppl", "hot-lead"],
  "updatedAt": "2026-02-27T21:31:00Z"
}
```

### GET /api/state?stage=:stageId&limit=50
Returns all leads in a given stage, sorted by stage_entered_at.

### GET /api/events/:contactId?limit=50
Returns event history for a contact, newest first.
```json
[
  { "eventType": "OpportunityStageUpdate", "stageId": "...", "createdAt": "..." },
  { "eventType": "ContactCreate", "createdAt": "..." }
]
```

### GET /api/triggers/recent?limit=50
Returns recent trigger fires from trigger_log.
```json
[
  { "triggerId": "new-lead-intake", "contactId": "abc123", "firedAt": "...", "metadata": {} }
]
```

### GET /api/engine/stats
Returns engine health stats:
```json
{
  "totalEvents": 1234,
  "totalLeads": 145,
  "totalTriggersFired": 89,
  "eventsLast24h": 45,
  "triggersLast24h": 12,
  "pollerRunning": true,
  "lastPollerTick": "2026-02-27T21:30:00Z",
  "dbConnected": true
}
```

## Dashboard Updates
Update the Command Center (audit.html) to show:
- Live event feed (websocket or polling /api/events)
- Lead state cards for active leads
- Trigger fire timeline
- Engine health indicator

## Implementation Notes
- Create `src/api/engine.ts` with a new Express Router
- Wire into server.ts: `app.use('/api/engine', engineRouter)`
- Use the `db.query()` from `src/engine/db.ts`
- Keep queries efficient — use indexes, limit results
