/**
 * Showing Manager Agent
 *
 * Fires on: buyer pipeline → showing_scheduled
 * Does: Creates showing prep task, sends confirmation SMS, handles reminders
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { loadPlaybook } from '../config/loader';
import { contactBot, noteBot, smsBot, taskBot } from '../bots';

const AGENT_ID = 'showing-manager';
const ESTEBAN_USER_ID = 'BhVAeJjAfojeX9AJdqbf';

export async function runShowingManager(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, tenantId } = event;
  const start = Date.now();
  const playbook = await loadPlaybook(tenantId);

  const contact = await contactBot(contactId);
  const cf = (contact as any)?.customFields ?? {};
  const buyerName = (contact as any)?.firstName ?? 'Buyer';
  const propertyAddress = cf.showing_address ?? cf.property_address ?? 'TBD';
  const showingDate = cf.showing_date ?? (event.metadata as any)?.showingDate ?? '';
  const showingTime = cf.showing_time ?? (event.metadata as any)?.showingTime ?? '';

  if (!isDryRun()) {
    // Create showing prep task for Esteban (due 2h before showing)
    const showingDateTime = showingDate && showingTime
      ? new Date(`${showingDate}T${showingTime}`)
      : new Date(Date.now() + 24 * 60 * 60_000);
    const prepDue = new Date(showingDateTime.getTime() - 2 * 60 * 60_000);

    await taskBot(contactId, {
      title: `🏠 Showing Prep: ${propertyAddress}`,
      body: `Buyer: ${buyerName}\nAddress: ${propertyAddress}\nDate: ${showingDate} ${showingTime}\n\nChecklist:\n- Confirm access/lockbox\n- Print comps\n- Review buyer's buy box`,
      assignedTo: ESTEBAN_USER_ID,
      dueDate: prepDue.toISOString(),
    });

    // Send buyer confirmation SMS
    await smsBot(contactId,
      `Hi ${buyerName}! Your showing at ${propertyAddress} is confirmed for ${showingDate} at ${showingTime}. See you there! 🏠`
    );

    // Note on the contact
    await noteBot(contactId, [
      `📅 Showing Scheduled`,
      `Property: ${propertyAddress}`,
      `Date: ${showingDate} ${showingTime}`,
      `Buyer: ${buyerName}`,
      `Prep task created for Esteban`,
      `Confirmation SMS sent`,
    ].join('\n'));
  }

  await emit({
    kind: 'dispo.showing.scheduled',
    tenantId,
    contactId,
    opportunityId,
    metadata: { propertyAddress, showingDate, showingTime },
  });

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: 'showing.scheduled',
    result: 'success',
    metadata: { propertyAddress, showingDate, showingTime },
    durationMs: Date.now() - start,
  });
}
