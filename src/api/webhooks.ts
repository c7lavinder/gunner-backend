/**
 * Webhook receiver — GHL posts events here.
 * Normalizes GHL payload → GunnerEvent → emits to event bus.
 * No business logic here.
 */

import { Router } from 'express';
import { emit, GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { storeEvent } from '../engine/events';
import { updateState } from '../engine/state-updater';
import { evaluateEventTriggers } from '../engine/event-triggers';

const router = Router();

router.post('/ghl', async (req, res) => {
  res.sendStatus(200); // always ack immediately

  const body = req.body;

  auditLog({
    agent: 'webhook-receiver',
    contactId: body.contactId ?? body.contact_id ?? 'unknown',
    action: 'webhook_received',
    result: body.type ?? 'unknown_type',
    metadata: { type: body.type, keys: Object.keys(body) },
  });

  const event = normalize(body);
  if (!event) {
    // Even unhandled events should go to state engine for tracking
    const cid = body.contactId ?? body.contact_id;
    if (cid) {
      const fallbackEvent = {
        kind: (body.type ?? 'unknown') as any,
        tenantId: 'nah',
        contactId: cid,
        opportunityId: body.id ?? body.opportunityId,
        stageId: body.pipelineStageId,
        raw: body,
        receivedAt: Date.now(),
      };
      storeEvent(fallbackEvent).catch(() => {});
      updateState(fallbackEvent).catch(() => {});
    }
    return;
  }

  console.log(`[webhook] ${event.kind} contact=${event.contactId} opp=${event.opportunityId ?? 'n/a'}`);
  await emit(event);

  // State Engine: store event → update state → evaluate triggers
  const engineEvent = { ...event, tenantId: 'nah' as const, raw: body };

  storeEvent(engineEvent).catch((err: any) => console.error('[webhook] storeEvent failed:', err));
  
  try {
    const newState = await updateState(engineEvent);
    await evaluateEventTriggers(engineEvent, newState);
  } catch (err) {
    console.error('[webhook] state engine failed:', err);
  }
});

function normalize(body: any): GunnerEvent | null {
  const contactId = body.contactId ?? body.contact_id;
  const opportunityId = body.id ?? body.opportunityId;

  if (!contactId) return null;

  // Opportunity created
  if (body.type === 'OpportunityCreate') {
    return {
      kind: 'opportunity.created',
      tenantId: 'default',
      contactId,
      opportunityId,
      stageId: body.pipelineStageId,
      raw: body,
      receivedAt: Date.now(),
    };
  }

  // Stage change
  if (body.type === 'OpportunityStageUpdate') {
    return {
      kind: 'opportunity.stage_changed',
      tenantId: 'default',
      contactId,
      opportunityId,
      stageId: body.pipelineStageId,
      raw: body,
      receivedAt: Date.now(),
    };
  }

  // Inbound message (SMS, email, etc.)
  if (body.type === 'InboundMessage') {
    return {
      kind: 'inbound.message',
      tenantId: 'default',
      contactId,
      messageId: body.messageId,
      raw: body,
      receivedAt: Date.now(),
    };
  }

  // Contact created
  if (body.type === 'ContactCreate') {
    return {
      kind: 'contact.created',
      tenantId: 'default',
      contactId,
      raw: body,
      receivedAt: Date.now(),
    };
  }

  // Task completed
  if (body.type === 'TaskComplete') {
    return {
      kind: 'task.completed',
      tenantId: 'default',
      contactId,
      raw: body,
      receivedAt: Date.now(),
    };
  }

  // Outbound message — tracks last_outbound_at for speed-to-lead
  if (body.type === 'OutboundMessage') {
    return {
      kind: 'inbound.message', // reuse for state tracking; raw.direction distinguishes
      tenantId: 'default',
      contactId,
      messageId: body.messageId,
      raw: { ...body, direction: 'outbound' },
      receivedAt: Date.now(),
    };
  }

  // Inbound call
  if (body.type === 'InboundCall') {
    return {
      kind: 'call.inbound',
      tenantId: 'default',
      contactId,
      callId: body.callId ?? body.id,
      raw: body,
      receivedAt: Date.now(),
    };
  }

  // Outbound call
  if (body.type === 'OutboundCall') {
    return {
      kind: 'call.completed',
      tenantId: 'default',
      contactId,
      callId: body.callId ?? body.id,
      raw: { ...body, direction: 'outbound' },
      receivedAt: Date.now(),
    };
  }

  // Call completed (post-call with recording/duration)
  if (body.type === 'CallCompleted') {
    return {
      kind: 'call.completed',
      tenantId: 'default',
      contactId,
      callId: body.callId ?? body.id,
      raw: body,
      receivedAt: Date.now(),
    };
  }

  // Opportunity monetary value update
  if (body.type === 'OpportunityMonetaryValueUpdate') {
    return {
      kind: 'opportunity.stage_changed', // reuse — triggers check stageId anyway
      tenantId: 'default',
      contactId,
      opportunityId,
      stageId: body.pipelineStageId,
      raw: body,
      receivedAt: Date.now(),
    };
  }

  // Appointment events
  if (body.type === 'AppointmentCreate' || body.type === 'AppointmentUpdate') {
    return {
      kind: 'call.appointment',
      tenantId: 'default',
      contactId,
      raw: body,
      receivedAt: Date.now(),
    };
  }

  // Contact tag update (DNC detection)
  if (body.type === 'ContactTagUpdate') {
    const tags: string[] = body.tags ?? [];
    const kind = tags.some((t: string) => t.toLowerCase().includes('dnc')) ? 'lead.dnc' as const : 'contact.created' as const;
    return {
      kind,
      tenantId: 'default',
      contactId,
      raw: body,
      receivedAt: Date.now(),
    };
  }

  // Contact DND update
  if (body.type === 'ContactDndUpdate') {
    return {
      kind: 'lead.dnc',
      tenantId: 'default',
      contactId,
      raw: body,
      receivedAt: Date.now(),
    };
  }

  // Note create
  if (body.type === 'NoteCreate' || body.type === 'NoteUpdate') {
    return {
      kind: 'task.completed', // generic activity — state engine tracks last_activity_at
      tenantId: 'default',
      contactId,
      raw: body,
      receivedAt: Date.now(),
    };
  }

  // Opportunity assigned to update
  if (body.type === 'OpportunityAssignedToUpdate') {
    return {
      kind: 'opportunity.stage_changed',
      tenantId: 'default',
      contactId,
      opportunityId,
      stageId: body.pipelineStageId,
      raw: body,
      receivedAt: Date.now(),
    };
  }

  // Task create/update
  if (body.type === 'TaskCreate' || body.type === 'TaskUpdate') {
    return {
      kind: 'task.completed',
      tenantId: 'default',
      contactId,
      raw: body,
      receivedAt: Date.now(),
    };
  }

  return null;
}

export default router;
