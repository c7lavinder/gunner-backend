/**
 * Dispo Packager Agent — pure orchestration.
 * Fires on: contract.package.dispo
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { loadPlaybook } from '../config/loader';
import { contactBot } from '../bots/contact';
import { noteBot, stageBot } from '../bots';
import { templateBot } from '../bots/template';

const AGENT_ID = 'dispo-packager';

export async function runDispoPackager(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  try {
    const { contactId, opportunityId, tenantId } = event;
    const start = Date.now();
    const playbook = await loadPlaybook(tenantId);
    const dispoStage = playbook?.stages?.dispoNew ?? 'New Deal';

    const contact = await contactBot(contactId).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'contactBot:failed', result: 'error', reason: err?.message });
      return null;
    });

    if (!isDryRun()) {
      await noteBot(contactId, templateBot.buildDealPackage(contact as Record<string, unknown>, {})).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'noteBot:failed', result: 'error', reason: err?.message });
      });
      if (opportunityId) {
        await stageBot(opportunityId, dispoStage).catch(err => {
          auditLog({ agent: AGENT_ID, contactId, action: 'stageBot:failed', result: 'error', reason: err?.message });
        });
      }
    }

    auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'dispo.packaged', result: 'success', durationMs: Date.now() - start });
  } catch (err: any) {
    auditLog({ agent: AGENT_ID, contactId: event.contactId, action: 'agent:crashed', result: 'error', reason: err?.message });
  }
}
