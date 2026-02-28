import { query } from './db';
import { GunnerEvent } from '../core/event-bus';

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

export const updateState = async (event: GunnerEvent): Promise<LeadState | undefined> => {
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
    }
    if (raw?.assignedTo) {
      addUpdate('assigned_to', raw.assignedTo);
    }
    if (raw?.tags) {
      addUpdate('tags', raw.tags);
    }
  }

  if (event.kind === 'inbound.message') {
    if ((event.raw as any)?.direction === 'outbound') {
      // Outbound message — critical for speed-to-lead poller
      addUpdate('last_outbound_at', new Date());
      addUpdate('last_activity_at', new Date());
    } else {
      addUpdate('last_inbound_at', new Date());
      addUpdate('last_activity_at', new Date());
    }
  }

  if (event.kind === 'call.completed' || event.kind === 'call.inbound') {
    addUpdate('last_call_at', new Date());
    addUpdate('last_activity_at', new Date());
  }

  if (event.kind === 'call.appointment') {
    addUpdate('last_activity_at', new Date());
  }

  if (event.kind === 'task.completed') {
    addUpdate('last_activity_at', new Date());
  }

  if (event.kind === 'lead.dnc') {
    addUpdate('last_activity_at', new Date());
  }

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
    const res = await query(sql, values);
    const row = res.rows[0];
    
    if (!row) return undefined;

    return {
      id: row.id,
      tenantId: row.tenant_id,
      contactId: row.contact_id,
      opportunityId: row.opportunity_id,
      pipelineId: row.pipeline_id,
      currentStage: row.current_stage,
      stageEnteredAt: row.stage_entered_at,
      leadScore: row.lead_score,
      leadTier: row.lead_tier,
      assignedTo: row.assigned_to,
      lastOutboundAt: row.last_outbound_at,
      lastInboundAt: row.last_inbound_at,
      lastCallAt: row.last_call_at,
      lastActivityAt: row.last_activity_at,
      outreachCount: row.outreach_count,
      dripStep: row.drip_step,
      dripActive: row.drip_active,
      tags: row.tags,
      customData: row.custom_data,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
  
  return undefined;
};
