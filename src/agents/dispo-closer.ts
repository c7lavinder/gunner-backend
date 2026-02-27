/**
 * Dispo Closer Agent — pure orchestration.
 * Fires on: dispo stage → uc_with_buyer
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { loadPlaybook } from '../config/loader';
import { contactBot, noteBot, smsBot, taskBot } from '../bots';
import { templateBot } from '../bots/template';
import { schedulerBot } from '../bots/scheduler';

const AGENT_ID = 'dispo-closer';
const ESTEBAN_USER_ID = 'BhVAeJjAfojeX9AJdqbf';

export async function runDispoCloser(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, tenantId } = event;
  const start = Date.now();

  const contact = await contactBot(contactId);
  const cf = (contact as any)?.customFields ?? {};
  const buyerName = (contact as any)?.firstName ?? 'Buyer';
  const propertyAddress = cf.property_address ?? 'N/A';
  const closingDate = cf.closing_date ?? (event.metadata as any)?.closingDate ?? '';

  if (!isDryRun()) {
    await taskBot(contactId, {
      title: `📋 Title Coordination: ${propertyAddress}`,
      body: templateBot.buildTitleCoordinationBody({ buyerName, propertyAddress, closingDate: closingDate || 'TBD' }),
      assignedTo: ESTEBAN_USER_ID,
      dueDate: schedulerBot.dueInHours(24),
    });

    await noteBot(contactId, templateBot.buildClosingChecklist(contact as Record<string, unknown>, { buyerName, propertyAddress, closingDate: closingDate || 'TBD' }));

    await smsBot(contactId,
      `Hey ${buyerName}! We're moving forward on ${propertyAddress}. Title work is getting started. I'll keep you updated on the timeline. 🏠`
    );
  }

  await emit({ kind: 'dispo.closing.started', tenantId, contactId, opportunityId, metadata: { propertyAddress, closingDate } });

  auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'dispo.closing.started', result: 'success', metadata: { propertyAddress, closingDate }, durationMs: Date.now() - start });
}
