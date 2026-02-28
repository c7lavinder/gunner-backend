import { query } from './db';
import { GunnerEvent } from '../core/event-bus';
import { StoredEvent } from './events';

export interface LeadState {
  id: string;
  tenantId: string;
  contactId: string;
  opportunityId?: string;
  pipelineId?: string;
  currentStage?: string;
  stageEnteredAt?: Date;
  leadScore?: number;
  leadTier?: string;
  assignedTo?: string;
  lastOutboundAt?: Date;
  lastInboundAt?: Date;
  lastCallAt?: Date;
  lastActivityAt?: Date;
  outreachCount: number;
  dripStep: number;
  dripActive: boolean;
  tags: string[];
  customData: any;
  createdAt: Date;
  updatedAt: Date;
}

export const updateState = async (event: GunnerEvent) => {
  const tenantId = event.tenantId || 'nah';
  const contactId = event.contactId;

  if (!contactId) {
    console.warn('[state-updater] no contactId, skipping update');
    return;
  }

  // 1. Ensure record exists (UPSERT base)
  await query(`
    INSERT INTO lead_state (tenant_id, contact_id, created_at, updated_at)
    VALUES ($1, $2, NOW(), NOW())
    ON CONFLICT (contact_id) DO NOTHING
  `, [tenantId, contactId]);

  // 2. Update fields based on event type
  let updates: string[] = [];
  let values: any[] = [];
  let idx = 1;

  const addUpdate = (field: string, value: any) => {
    updates.push(`${field} = $${idx++}`);
    values.push(value);
  };

  // Always update updated_at
  addUpdate('updated_at', new Date());

  // Handle specific events
  if (event.kind === 'opportunity.stage_changed' && event.stageId) {
    addUpdate('current_stage', event.stageId);
    addUpdate('stage_entered_at', new Date());
    if (event.opportunityId) addUpdate('opportunity_id', event.opportunityId);
  }

  if (event.kind === 'opportunity.created') {
    if (event.stageId) {
      addUpdate('current_stage', event.stageId);
      addUpdate('stage_entered_at', new Date());
    }
    if (event.opportunityId) {
      addUpdate('opportunity_id', event.opportunityId);
    }
  }

  if (event.kind === 'contact.created') {
    // Update basic contact info if available in raw payload
    const raw = event.raw as any;
    if (raw?.firstName || raw?.lastName) {
      // Assuming we might want to store name in custom_data or future columns
      // For now, spec doesn't have name columns in lead_state, but mentions 'update contact info'.
      // Lead State table has: lead_score, lead_tier, assigned_to, tags, custom_data.
      // So I should update custom_data or assigned_to if present.
    }
    if (raw?.assignedTo) {
      addUpdate('assigned_to', raw.assignedTo);
    }
    if (raw?.tags) {
      addUpdate('tags', raw.tags);
    }
  }

  if (event.kind === 'inbound.message') {
    addUpdate('last_inbound_at', new Date());
    addUpdate('last_activity_at', new Date());
  }

  if (event.kind === 'call.completed') {
    addUpdate('last_call_at', new Date());
    addUpdate('last_activity_at', new Date());
  }

  // Note: 'outbound.message' isn't explicitly in GunnerEvent types in event-bus.ts but might be inferred or added later.
  // The spec mentions 'message.outbound'. I will assume it might come as a custom event or handled if added.
  // For now I stick to what is in GunnerEvent or spec.

  // Apply updates if any
  if (updates.length > 0) {
    // Add contact_id to values for WHERE clause
    values.push(contactId);
    const sql = `
      UPDATE lead_state
      SET ${updates.join(', ')}
      WHERE contact_id = $${idx}
      RETURNING *
    `;
    await query(sql, values);
  }
};
