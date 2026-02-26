/**
 * Webhook receiver — GHL posts events here.
 * Normalizes GHL payload → GunnerEvent → emits to event bus.
 * No business logic here.
 */

import { Router } from 'express';
import { emit, GunnerEvent } from '../core/event-bus';

const router = Router();

router.post('/ghl', async (req, res) => {
  res.sendStatus(200); // always ack immediately

  const body = req.body;
  const event = normalize(body);
  if (!event) return;

  await emit(event);
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

  // Inbound message
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

  return null;
}

export default router;
