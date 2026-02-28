import { query } from './db';
import { GunnerEvent } from '../core/event-bus';

export interface StoredEvent {
  id: string;
  tenantId: string;
  contactId: string;
  opportunityId?: string;
  eventType: string;
  stageId?: string;
  pipelineId?: string;
  rawPayload: any;
  createdAt: Date;
  processed: boolean;
}

export const storeEvent = async (event: GunnerEvent): Promise<StoredEvent> => {
  const sql = `
    INSERT INTO events (
      tenant_id,
      contact_id,
      opportunity_id,
      event_type,
      stage_id,
      pipeline_id,
      raw_payload,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    RETURNING *;
  `;
  
  const params = [
    event.tenantId || 'nah',
    event.contactId,
    event.opportunityId || null,
    event.kind,
    event.stageId || null,
    (event.raw as any)?.pipelineId || null,
    event.raw || {},
  ];

  const res = await query(sql, params);
  const row = res.rows[0];

  return {
    id: row.id,
    tenantId: row.tenant_id,
    contactId: row.contact_id,
    opportunityId: row.opportunity_id,
    eventType: row.event_type,
    stageId: row.stage_id,
    pipelineId: row.pipeline_id,
    rawPayload: row.raw_payload,
    createdAt: row.created_at,
    processed: row.processed
  };
};
