/**
 * Dispo Closer Agent
 *
 * Fires on: dispo stage → uc_with_buyer
 * Does: Creates title coordination task, closing checklist note,
 *       sends buyer check-ins, manages stage progression to closed
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { loadPlaybook } from '../config/loader';
import { contactBot, noteBot, smsBot, taskBot, stageBot } from '../bots';

const AGENT_ID = 'dispo-closer';
const ESTEBAN_USER_ID = 'BhVAeJjAfojeX9AJdqbf';

export async function runDispoCloser(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, tenantId } = event;
  const start = Date.now();
  const playbook = await loadPlaybook(tenantId);

  const contact = await contactBot(contactId);
  const cf = (contact as any)?.customFields ?? {};
  const buyerName = (contact as any)?.firstName ?? 'Buyer';
  const propertyAddress = cf.property_address ?? 'N/A';
  const closingDate = cf.closing_date ?? (event.metadata as any)?.closingDate ?? '';

  const dispoStages = playbook?.crm?.pipelines?.dispo?.stages;

  if (!isDryRun()) {
    // Create title coordination task
    await taskBot(contactId, {
      title: `📋 Title Coordination: ${propertyAddress}`,
      body: [
        `Buyer: ${buyerName}`,
        `Property: ${propertyAddress}`,
        `Closing Date: ${closingDate || 'TBD'}`,
        `\nAction items:`,
        `- Send contract to title company`,
        `- Confirm earnest money deposit`,
        `- Order title search`,
        `- Coordinate closing date`,
      ].join('\n'),
      assignedTo: ESTEBAN_USER_ID,
      dueDate: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
    });

    // Create closing checklist note
    await noteBot(contactId, [
      `✅ Closing Checklist — ${propertyAddress}`,
      `Buyer: ${buyerName}`,
      `Target Close: ${closingDate || 'TBD'}`,
      `---`,
      `[ ] Contract sent to title`,
      `[ ] Earnest money received`,
      `[ ] Title search ordered`,
      `[ ] Title clear`,
      `[ ] Closing docs prepared`,
      `[ ] Closing scheduled`,
      `[ ] Funds wired`,
      `[ ] Closed & recorded`,
    ].join('\n'));

    // Send buyer check-in SMS (initial)
    await smsBot(contactId,
      `Hey ${buyerName}! We're moving forward on ${propertyAddress}. Title work is getting started. I'll keep you updated on the timeline. 🏠`
    );
  }

  await emit({
    kind: 'dispo.closing.started',
    tenantId,
    contactId,
    opportunityId,
    metadata: { propertyAddress, closingDate },
  });

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: 'dispo.closing.started',
    result: 'success',
    metadata: { propertyAddress, closingDate },
    durationMs: Date.now() - start,
  });
}
