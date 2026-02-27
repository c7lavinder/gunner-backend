/**
 * Title Coordinator Agent
 *
 * Fires on: dispo stage → working_with_title
 * Does: Creates tasks for title work milestones, monitors timeline
 */

import { GunnerEvent } from '../../core/event-bus';
import { auditLog } from '../../core/audit';
import { isEnabled } from '../../core/toggles';
import { isDryRun } from '../../core/dry-run';
import { contactBot, noteBot, taskBot, tagBot } from '../../bots';
import { memoryWriterBot } from '../../bots/memory-writer';

const AGENT_ID = 'title-coordinator';
const ESTEBAN_USER_ID = 'BhVAeJjAfojeX9AJdqbf';

const MILESTONES = [
  { name: 'Title search ordered', dayOffset: 0 },
  { name: 'Title commitment received', dayOffset: 3 },
  { name: 'Closing docs prepared', dayOffset: 7 },
  { name: 'Wire instructions sent', dayOffset: 10 },
  { name: 'Final walkthrough', dayOffset: 12 },
  { name: 'Closing day', dayOffset: 14 },
];

export async function runTitleCoordinator(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  try {
    const { contactId, opportunityId, tenantId } = event;
    const start = Date.now();

    const contact = await contactBot(contactId).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'contactBot:failed', result: 'error', reason: err?.message });
      return null;
    });
    const cf = (contact as any)?.customFields ?? {};
    const propertyAddress = cf.property_address ?? 'N/A';
    const closingDate = cf.closing_date ?? (event.metadata as any)?.closingDate ?? '';
    const titleCompany = cf.title_company ?? (event.metadata as any)?.titleCompany ?? 'TBD';

    const baseDate = closingDate ? new Date(closingDate) : new Date(Date.now() + 14 * 24 * 60 * 60_000);

    if (!isDryRun()) {
      await tagBot(contactId, ['title-in-progress']).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'tagBot:failed', result: 'error', reason: err?.message });
      });

      // Create milestone tasks
      for (const ms of MILESTONES) {
        const dueDate = new Date(baseDate.getTime() - (14 - ms.dayOffset) * 24 * 60 * 60_000);
        await taskBot(contactId, {
          title: `📋 ${ms.name}: ${propertyAddress}`,
          body: `Title Company: ${titleCompany}\nTarget Closing: ${baseDate.toISOString().split('T')[0]}`,
          assignedTo: ESTEBAN_USER_ID,
          dueDate: dueDate.toISOString(),
        }).catch(err => {
          auditLog({ agent: AGENT_ID, contactId, action: `taskBot:${ms.name}:failed`, result: 'error', reason: err?.message });
        });
      }

      await noteBot(contactId, [
        `📋 Title Coordination Started`,
        `Property: ${propertyAddress}`,
        `Title Company: ${titleCompany}`,
        `Target Closing: ${baseDate.toISOString().split('T')[0]}`,
        `---`,
        `${MILESTONES.length} milestone tasks created for Esteban`,
      ].join('\n')).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'noteBot:failed', result: 'error', reason: err?.message });
      });
    }

    await memoryWriterBot.recordAction('title-coordination', { contactId, propertyAddress }, { titleCompany, closingDate: baseDate.toISOString(), milestones: MILESTONES.length }, tenantId).catch(err => {
      console.error(`[${AGENT_ID}] memoryWriterBot:failed`, (err as Error).message);
    });

    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'title.coordination.started',
      result: 'success',
      metadata: { propertyAddress, titleCompany, closingDate: baseDate.toISOString() },
      durationMs: Date.now() - start,
    });
  } catch (err: any) {
    auditLog({ agent: AGENT_ID, contactId: event.contactId, action: 'agent:crashed', result: 'error', reason: err?.message });
  }
}
