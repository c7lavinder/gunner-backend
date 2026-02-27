/**
 * Deal Terminator Agent
 *
 * Fires on: dispo stage → need_to_terminate
 * Does: Logs termination reason, creates note, creates task, tags deal
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { loadPlaybook } from '../config/loader';
import { contactBot, noteBot, taskBot, tagBot } from '../bots';

const AGENT_ID = 'deal-terminator';
const ESTEBAN_USER_ID = 'BhVAeJjAfojeX9AJdqbf';

export async function runDealTerminator(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, tenantId } = event;
  const start = Date.now();
  const playbook = await loadPlaybook(tenantId);

  const contact = await contactBot(contactId);
  const cf = (contact as any)?.customFields ?? {};
  const propertyAddress = cf.property_address ?? 'N/A';
  const reason = cf.termination_reason ?? (event.metadata as any)?.reason ?? 'No reason provided';

  if (!isDryRun()) {
    // Tag deal
    await tagBot(contactId, ['terminated']);

    // Create termination note
    await noteBot(contactId, [
      `❌ Deal Terminated`,
      `Property: ${propertyAddress}`,
      `Reason: ${reason}`,
      `Terminated at: ${new Date().toISOString()}`,
    ].join('\n'));

    // Create re-evaluation task
    await taskBot(contactId, {
      title: `🔄 Re-evaluate or archive: ${propertyAddress}`,
      body: `Deal terminated: ${reason}\n\nOptions:\n- Re-negotiate terms\n- Find new buyer\n- Archive and move on`,
      assignedTo: ESTEBAN_USER_ID,
      dueDate: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
    });
  }

  await emit({
    kind: 'dispo.terminated',
    tenantId,
    contactId,
    opportunityId,
    metadata: { reason, propertyAddress },
  });

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: 'dispo.terminated',
    result: 'success',
    metadata: { reason, propertyAddress },
    durationMs: Date.now() - start,
  });
}
