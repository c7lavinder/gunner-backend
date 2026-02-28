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
  await updateState(engineEvent).catch((err: any) => console.error('[webhook] updateState failed:', err));
  evaluateEventTriggers(engineEvent).catch((err: any) => console.error('[webhook] evaluateEventTriggers failed:', err));
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

  return null;
}

export default router;
