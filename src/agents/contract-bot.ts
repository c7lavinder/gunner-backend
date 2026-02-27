/**
 * Contract Bot (Agent)
 *
 * Fires on: opportunity.stage.under_contract
 * Does: SMS to seller, AM task, fires TC/Dispo packagers
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { loadPlaybook } from '../config/loader';
import { smsBot, taskBot } from '../bots';

const AGENT_ID = 'contract-bot';

export async function runContractBot(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  try {
    const { contactId, opportunityId, tenantId } = event;
    const start = Date.now();
    const playbook = await loadPlaybook(tenantId);
    const am = playbook?.roles?.acquisitionManager ?? 'am';

    if ((event.metadata as any)?.contractBotProcessed) {
      auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'skip', result: 'skipped', durationMs: 0 });
      return;
    }

    if (!isDryRun()) {
      await smsBot(contactId, `Thank you! We're excited to move forward. Our team will be in touch shortly with next steps.`).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'smsBot:failed', result: 'error', reason: err?.message });
      });

      await taskBot(contactId, {
        title: 'Get deal details to TC and Dispo',
        assignedTo: am,
        dueDate: new Date(Date.now() + 60 * 60_000).toISOString(),
      }).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'taskBot:failed', result: 'error', reason: err?.message });
      });

      await Promise.all([
        emit({
          kind: 'contract.package.tc',
          tenantId,
          contactId,
          opportunityId,
          receivedAt: Date.now(),
        }).catch(err => {
          auditLog({ agent: AGENT_ID, contactId, action: 'emit:contract.package.tc:failed', result: 'error', reason: err?.message });
        }),
        emit({
          kind: 'contract.package.dispo',
          tenantId,
          contactId,
          opportunityId,
          receivedAt: Date.now(),
        }).catch(err => {
          auditLog({ agent: AGENT_ID, contactId, action: 'emit:contract.package.dispo:failed', result: 'error', reason: err?.message });
        }),
      ]);
    }

    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'contract.processed',
      result: 'success',
      durationMs: Date.now() - start,
    });
  } catch (err: any) {
    auditLog({ agent: AGENT_ID, contactId: event.contactId, action: 'agent:crashed', result: 'error', reason: err?.message });
  }
}
