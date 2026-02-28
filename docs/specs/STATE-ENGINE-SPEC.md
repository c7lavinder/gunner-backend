# STATE ENGINE SPEC — The Brain Behind The Triggers

## Overview
The State Engine is the intelligence layer between raw CRM webhooks and agent execution. It tracks lead state, detects patterns, enforces time-based rules, and fires complex triggers that no single webhook can represent.

## Architecture

```
CRM Webhooks → [Webhook Receiver] → [Event Store] → [State Engine] → [Trigger Evaluator] → [Agent Bus]
                                          ↑                                    ↑
                                     [Postgres]                          [Poller / Cron]
```

### Layer 1: Event Store (Database)
Every webhook event gets persisted immediately. This is the single source of truth.

**Table: `events`**
```sql
CREATE TABLE events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT NOT NULL,
  contact_id    TEXT NOT NULL,
  opportunity_id TEXT,
  event_type    TEXT NOT NULL,        -- 'contact.created', 'opportunity.stage_changed', 'message.inbound', etc.
  stage_id      TEXT,                 -- current stage (if applicable)
  pipeline_id   TEXT,
  raw_payload   JSONB NOT NULL,       -- full webhook payload
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  processed     BOOLEAN DEFAULT FALSE
);
CREATE INDEX idx_events_contact ON events(contact_id, created_at DESC);
CREATE INDEX idx_events_type ON events(event_type, created_at DESC);
CREATE INDEX idx_events_tenant ON events(tenant_id, created_at DESC);
```

**Table: `lead_state`** (materialized view of current lead status)
```sql
CREATE TABLE lead_state (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,
  contact_id      TEXT NOT NULL UNIQUE,
  opportunity_id  TEXT,
  pipeline_id     TEXT,
  current_stage   TEXT,
  stage_entered_at TIMESTAMPTZ,
  lead_score      INTEGER,
  lead_tier       TEXT,               -- 'hot', 'warm'
  assigned_to     TEXT,               -- GHL user ID
  last_outbound_at TIMESTAMPTZ,       -- last SMS/call we sent
  last_inbound_at  TIMESTAMPTZ,       -- last message from lead
  last_call_at    TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  outreach_count  INTEGER DEFAULT 0,
  drip_step       INTEGER DEFAULT 0,
  drip_active     BOOLEAN DEFAULT FALSE,
  tags            TEXT[] DEFAULT '{}',
  custom_data     JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_lead_state_stage ON lead_state(current_stage, stage_entered_at);
CREATE INDEX idx_lead_state_tenant ON lead_state(tenant_id);
```

**Table: `trigger_log`** (what fired and when — prevents duplicate fires)
```sql
CREATE TABLE trigger_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT NOT NULL,
  contact_id    TEXT NOT NULL,
  trigger_id    TEXT NOT NULL,        -- 'speed-to-lead-violation', 'ghosted-14d', etc.
  fired_at      TIMESTAMPTZ DEFAULT NOW(),
  metadata      JSONB DEFAULT '{}'
);
CREATE UNIQUE INDEX idx_trigger_dedup ON trigger_log(contact_id, trigger_id, (fired_at::date));
```

### Layer 2: State Updater
Processes each event and updates `lead_state`. Runs synchronously after event store write.

```typescript
// src/engine/state-updater.ts
async function updateState(event: StoredEvent): Promise<LeadState> {
  const state = await getOrCreateState(event.contactId, event.tenantId);
  
  switch (event.eventType) {
    case 'opportunity.stage_changed':
      state.currentStage = event.stageId;
      state.stageEnteredAt = event.createdAt;
      break;
    case 'message.inbound':
      state.lastInboundAt = event.createdAt;
      state.lastActivityAt = event.createdAt;
      break;
    case 'message.outbound':
      state.lastOutboundAt = event.createdAt;
      state.outreachCount += 1;
      break;
    case 'call.completed':
      state.lastCallAt = event.createdAt;
      state.lastActivityAt = event.createdAt;
      break;
    // ... etc
  }
  
  state.updatedAt = new Date();
  await saveState(state);
  return state;
}
```

### Layer 3: Trigger Evaluator
Two modes of evaluation:

#### A. Event-Driven Triggers (fire immediately on webhook)
```typescript
// src/engine/triggers/event-triggers.ts
const EVENT_TRIGGERS: TriggerRule[] = [
  {
    id: 'new-lead-intake',
    description: 'Lead enters New Lead stage',
    when: (event, state) => 
      event.eventType === 'opportunity.stage_changed' && 
      isNewLeadStage(event.stageId, state.tenantId),
    fires: ['new-lead-pipeline'],
  },
  {
    id: 'inbound-message-response',
    description: 'Lead sends us a message',
    when: (event, state) =>
      event.eventType === 'message.inbound' &&
      state.currentStage !== 'purchased' &&
      state.currentStage !== 'sold',
    fires: ['response-agent'],
  },
  {
    id: 'stage-to-under-contract',
    description: 'Lead moves to Under Contract',
    when: (event, state) =>
      event.eventType === 'opportunity.stage_changed' &&
      isUnderContractStage(event.stageId, state.tenantId),
    fires: ['contract-bot', 'uc-monitor', 'tc-packager', 'dispo-packager'],
  },
  {
    id: 'conversation-concern-detected',
    description: 'AI detects seller concern/backing out in UC message',
    when: async (event, state) => {
      if (event.eventType !== 'message.inbound') return false;
      if (!isUnderContractStage(state.currentStage, state.tenantId)) return false;
      const classification = await classifyMessage(event.raw.body);
      return classification === 'concern';
    },
    fires: ['urgent-am-alert'],
  },
];
```

#### B. Time-Based Triggers (poller evaluates on schedule)
```typescript
// src/engine/triggers/time-triggers.ts
const TIME_TRIGGERS: TimeRule[] = [
  {
    id: 'speed-to-lead-violation',
    description: 'New lead with no outbound contact in 3 min',
    query: `
      SELECT * FROM lead_state 
      WHERE current_stage = $1 
        AND last_outbound_at IS NULL
        AND stage_entered_at < NOW() - INTERVAL '3 minutes'
        AND tenant_id = $2
    `,
    stageKey: 'new_lead',
    fires: ['speed-to-lead-alert'],
    cooldownMinutes: 30,
  },
  {
    id: 'ghosted-detection',
    description: 'No response in 14 days',
    query: `
      SELECT * FROM lead_state
      WHERE last_inbound_at IS NULL
        AND outreach_count >= 3
        AND stage_entered_at < NOW() - INTERVAL '14 days'
        AND NOT ('ghosted' = ANY(tags))
        AND tenant_id = $1
    `,
    fires: ['ghosted-agent'],
    cooldownMinutes: 1440,
  },
  {
    id: 'warm-no-call-24h',
    description: 'Lead in Warm for 24h with no call',
    query: `
      SELECT * FROM lead_state
      WHERE current_stage = $1
        AND last_call_at IS NULL
        AND stage_entered_at < NOW() - INTERVAL '24 hours'
        AND tenant_id = $2
    `,
    stageKey: 'warm',
    fires: ['accountability-agent'],
    cooldownMinutes: 240,
  },
  {
    id: 'stale-stage-48h',
    description: 'Any lead stuck in same stage for 48h',
    query: `
      SELECT * FROM lead_state
      WHERE stage_entered_at < NOW() - INTERVAL '48 hours'
        AND updated_at < NOW() - INTERVAL '24 hours'
        AND current_stage NOT IN ('purchased', 'sold', 'do_not_want', 'ghosted')
        AND tenant_id = $1
    `,
    fires: ['reality-check'],
    cooldownMinutes: 1440,
  },
  {
    id: 'drip-due',
    description: 'Next drip touch is due',
    query: `
      SELECT * FROM lead_state
      WHERE drip_active = true
        AND drip_next_at <= NOW()
        AND tenant_id = $1
    `,
    fires: ['working-drip'],
    cooldownMinutes: 60,
  },
  {
    id: 'uc-seller-quiet-5d',
    description: 'Under contract seller quiet for 5 days',
    query: `
      SELECT * FROM lead_state
      WHERE current_stage = $1
        AND last_inbound_at < NOW() - INTERVAL '5 days'
        AND tenant_id = $2
    `,
    stageKey: 'under_contract',
    fires: ['uc-monitor'],
    cooldownMinutes: 1440,
  },
  {
    id: 'task-overdue-15m',
    description: 'Task overdue by 15 minutes',
    // This uses a separate tasks table
    fires: ['accountability-agent'],
    cooldownMinutes: 30,
  },
  {
    id: 'double-dial-detection',
    description: 'Two calls to same contact within 2 hours, no answer',
    query: `
      SELECT ls.* FROM lead_state ls
      JOIN events e1 ON e1.contact_id = ls.contact_id 
        AND e1.event_type = 'call.completed' 
        AND e1.created_at > NOW() - INTERVAL '2 hours'
      JOIN events e2 ON e2.contact_id = ls.contact_id 
        AND e2.event_type = 'call.completed'
        AND e2.created_at > NOW() - INTERVAL '2 hours'
        AND e2.id != e1.id
      WHERE ls.tenant_id = $1
        AND (e1.raw_payload->>'outcome') != 'connected'
        AND (e2.raw_payload->>'outcome') != 'connected'
    `,
    fires: ['callback-capture'],
    cooldownMinutes: 240,
  },
];
```

### Layer 4: Poller
Runs on a configurable interval (default: every 60 seconds). Evaluates all time-based triggers.

```typescript
// src/engine/poller.ts
class TriggerPoller {
  private interval: NodeJS.Timer | null = null;
  
  start(intervalMs: number = 60_000) {
    this.interval = setInterval(() => this.tick(), intervalMs);
  }

  async tick() {
    for (const rule of TIME_TRIGGERS) {
      const matches = await db.query(rule.query, rule.params);
      for (const lead of matches) {
        if (await this.shouldFire(lead, rule)) {
          await this.fireTrigger(lead, rule);
        }
      }
    }
  }

  async shouldFire(lead: LeadState, rule: TimeRule): Promise<boolean> {
    // Check cooldown — don't fire same trigger for same lead within cooldown
    const lastFire = await db.query(
      'SELECT fired_at FROM trigger_log WHERE contact_id = $1 AND trigger_id = $2 ORDER BY fired_at DESC LIMIT 1',
      [lead.contactId, rule.id]
    );
    if (lastFire && (Date.now() - lastFire.fired_at) < rule.cooldownMinutes * 60_000) {
      return false;
    }
    return true;
  }
}
```

### Layer 5: Trigger → Agent Bridge
Converts trigger fires into GunnerEvents that the existing agent system already handles.

```typescript
// src/engine/trigger-bridge.ts
async function fireTrigger(lead: LeadState, rule: TriggerRule, event?: StoredEvent) {
  // Log the fire
  await db.query(
    'INSERT INTO trigger_log (tenant_id, contact_id, trigger_id, metadata) VALUES ($1, $2, $3, $4)',
    [lead.tenantId, lead.contactId, rule.id, { stageId: lead.currentStage }]
  );

  // Emit to agent bus
  for (const agentId of rule.fires) {
    await emit({
      kind: rule.id,
      tenantId: lead.tenantId,
      contactId: lead.contactId,
      opportunityId: lead.opportunityId,
      stageId: lead.currentStage,
      triggerId: rule.id,
      raw: event?.rawPayload ?? {},
      receivedAt: Date.now(),
    });
  }

  auditLog({
    agent: 'state-engine',
    contactId: lead.contactId,
    action: `trigger:${rule.id}`,
    result: 'fired',
    metadata: { agents: rule.fires },
  });
}
```

## Config-Driven Triggers (Industry/Tenant Agnostic)

All triggers should be definable in the playbook JSON:

```json
{
  "triggers": {
    "event": [
      {
        "id": "new-lead-intake",
        "on": "opportunity.stage_changed",
        "condition": { "stageKey": "new_lead" },
        "fires": ["new-lead-pipeline"]
      }
    ],
    "time": [
      {
        "id": "speed-to-lead",
        "description": "No outbound in 3 min after new lead",
        "stageKey": "new_lead",
        "noActivityField": "last_outbound_at",
        "afterMinutes": 3,
        "fires": ["speed-to-lead-alert"],
        "cooldownMinutes": 30
      },
      {
        "id": "ghosted",
        "description": "No inbound response in 14 days",
        "condition": { "minOutreach": 3, "noField": "last_inbound_at" },
        "afterDays": 14,
        "fires": ["ghosted-agent"],
        "cooldownMinutes": 1440
      }
    ],
    "ai": [
      {
        "id": "concern-detected",
        "on": "message.inbound",
        "stageKey": "under_contract",
        "classifier": "uc-message",
        "matchResult": "concern",
        "fires": ["urgent-am-alert"]
      }
    ]
  }
}
```

## Build Order

### Phase 1: Foundation (Week 1)
1. **Event Store** — `events` table + write-on-webhook
2. **Lead State** — `lead_state` table + state updater
3. **Trigger Log** — dedup table
4. Wire webhook receiver → event store → state updater

### Phase 2: Event Triggers (Week 1)
5. **Event Trigger Evaluator** — evaluate rules after each state update
6. **Trigger → Agent Bridge** — emit to existing agent bus
7. Port existing `nah.json` triggers to new format

### Phase 3: Time Triggers (Week 2)
8. **Poller** — interval-based trigger evaluation
9. **Time trigger rules** — speed-to-lead, ghosted, stale-stage, drip-due
10. **Cooldown + dedup** — prevent duplicate fires

### Phase 4: AI Triggers (Week 2)
11. **AI Classifier triggers** — message classification → trigger
12. **Conversation context** — pull thread history for better classification

### Phase 5: Config-Driven (Week 3)
13. **Playbook trigger loader** — read trigger rules from JSON config
14. **Tenant isolation** — each tenant has own trigger set
15. **Dashboard** — trigger monitor showing what fired, when, why

## Database
Use existing `xhaka-brain` Postgres on Railway.

## Key Principles
- **Every event persisted** — nothing lost, full replay capability
- **Idempotent triggers** — cooldowns prevent spam
- **Config-driven** — no code changes to add/modify triggers
- **CRM-agnostic** — state engine doesn't know what CRM it's talking to
- **AI-native** — classifiers are first-class trigger sources
- **Observable** — every trigger fire logged with full context
