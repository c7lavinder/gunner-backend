/**
 * New Lead Pipeline
 *
 * Fires on: opportunity.created (New Lead stage)
 * Does: fetches contact data, emits lead.new
 * Does NOT: score, tag, note, task, move stages, send SMS
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { contactBot } from '../bots/contact';

const AGENT_ID = 'new-lead-pipeline';

export async function runNewLeadPipeline(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  try {
    const { contactId, opportunityId, tenantId } = event;
    const start = Date.now();

    const contact = await contactBot(contactId).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'contactBot:failed', result: 'error', reason: err?.message });
      return null;
    });

    if (!contact) return;

    await emit({
      kind: 'lead.new',
      tenantId,
      contactId,
      opportunityId,
      contact,
      receivedAt: Date.now(),
    }).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'emit:lead.new:failed', result: 'error', reason: err?.message });
    });

    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'lead.new:emitted',
      result: 'success',
      durationMs: Date.now() - start,
    });
  } catch (err: any) {
    auditLog({ agent: AGENT_ID, contactId: event.contactId, action: 'agent:crashed', result: 'error', reason: err?.message });
  }
}
