/**
 * Contract Bot (Agent)
 *
 * Fires on: opportunity.stage.under_contract
 * Does:
 *   1. AI confirmation SMS to seller via smsBot
 *   2. AM task: "Get deal details to TC and Dispo" (1 hour)
 *   3. Fires TC Packager and Dispo Packager in parallel
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

  const { contactId, opportunityId, tenantId } = event;
  const start = Date.now();
  const playbook = await loadPlaybook(tenantId);
  const am = playbook?.roles?.acquisitionManager ?? 'am';

  // Guard: check if already processed
  if (event.metadata?.contractBotProcessed) {
    auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'skip', result: 'already_processed', durationMs: 0 });
    return;
  }

  if (!isDryRun()) {
    // 1. Confirmation SMS to seller
    await smsBot({
      contactId,
      tenantId,
      templateKey: 'uc_confirmation',
      context: { opportunityId },
    });

    // 2. AM task
    await taskBot({
      contactId,
      opportunityId,
      tenantId,
      title: 'Get deal details to TC and Dispo',
      assignTo: am,
      dueMins: 60,
    });

    // 3. Fire TC Packager and Dispo Packager in parallel
    await Promise.all([
      emit({
        kind: 'contract.package.tc',
        tenantId,
        contactId,
        opportunityId,
      }),
      emit({
        kind: 'contract.package.dispo',
        tenantId,
        contactId,
        opportunityId,
      }),
    ]);
  }

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: 'contract.processed',
    result: 'sms_task_packagers_fired',
    durationMs: Date.now() - start,
  });
}
