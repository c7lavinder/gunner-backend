/**
 * Deal Intake Agent
 *
 * Fires on: dispo stage → new_deal
 * Does: Validates deal data (ARV, repairs, contract price), ensures package is complete,
 *       assigns to Esteban, creates review task
 */

import { GunnerEvent, emit } from '../../core/event-bus';
import { auditLog } from '../../core/audit';
import { isEnabled } from '../../core/toggles';
import { isDryRun } from '../../core/dry-run';
import { loadPlaybook } from '../../config/loader';
import { contactBot, noteBot, taskBot, tagBot, assignBot } from '../../bots';
import { memoryWriterBot } from '../../bots/memory-writer';

const AGENT_ID = 'deal-intake';
const ESTEBAN_USER_ID = 'BhVAeJjAfojeX9AJdqbf';

const REQUIRED_FIELDS = ['property_address', 'arv', 'contract_price', 'repair_estimate'];

export async function runDealIntake(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  try {
    const { contactId, opportunityId, tenantId } = event;
    const start = Date.now();

    const contact = await contactBot(contactId).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'contactBot:failed', result: 'error', reason: err?.message });
      return null;
    });
    const cf = (contact as any)?.customFields ?? {};

    // Validate required fields
    const missing = REQUIRED_FIELDS.filter(f => !cf[f]);
    const isComplete = missing.length === 0;

    const propertyAddress = cf.property_address ?? 'N/A';
    const arv = cf.arv ?? 'N/A';
    const contractPrice = cf.contract_price ?? 'N/A';
    const repairs = cf.repair_estimate ?? 'N/A';

    if (!isDryRun()) {
      // Assign to Esteban
      if (opportunityId) {
        await assignBot(opportunityId, ESTEBAN_USER_ID).catch(err => {
          auditLog({ agent: AGENT_ID, contactId, action: 'assignBot:failed', result: 'error', reason: err?.message });
        });
      }

      // Tag completeness
      await tagBot(contactId, [isComplete ? 'dispo-complete' : 'dispo-incomplete']).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'tagBot:failed', result: 'error', reason: err?.message });
      });

      // Note with validation results
      const noteLines = [
        `📥 New Dispo Deal Intake`,
        `Property: ${propertyAddress}`,
        `ARV: ${arv} | Contract: ${contractPrice} | Repairs: ${repairs}`,
        `Package: ${isComplete ? '✅ Complete' : `❌ Missing: ${missing.join(', ')}`}`,
        `Assigned to: Esteban Leiva`,
      ];
      await noteBot(contactId, noteLines.join('\n')).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'noteBot:failed', result: 'error', reason: err?.message });
      });

      // Create review task
      await taskBot(contactId, {
        title: `📥 Review new dispo deal: ${propertyAddress}`,
        body: `ARV: ${arv}\nContract: ${contractPrice}\nRepairs: ${repairs}\n${isComplete ? 'Package complete — review and move to Clear to Send' : `INCOMPLETE — missing: ${missing.join(', ')}`}`,
        assignedTo: ESTEBAN_USER_ID,
        dueDate: new Date(Date.now() + 4 * 60 * 60_000).toISOString(),
      }).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'taskBot:failed', result: 'error', reason: err?.message });
      });
    }

    await memoryWriterBot.recordAction('dispo-intake', { contactId, propertyAddress }, { isComplete, missing, arv, contractPrice, repairs }, tenantId).catch(err => {
      console.error(`[${AGENT_ID}] memoryWriterBot:failed`, (err as Error).message);
    });

    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'deal.intake.complete',
      result: 'success',
      metadata: { isComplete, missing, propertyAddress },
      durationMs: Date.now() - start,
    });
  } catch (err: any) {
    auditLog({ agent: AGENT_ID, contactId: event.contactId, action: 'agent:crashed', result: 'error', reason: err?.message });
  }
}
