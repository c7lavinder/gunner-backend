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
import { emailBot } from '../bots/email';

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

    const dealPackageBody = templateBot.buildDealPackage(contact as Record<string, unknown>, {});

    if (!isDryRun()) {
      // Write note to CRM
      await noteBot(contactId, dealPackageBody).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'noteBot:failed', result: 'error', reason: err?.message });
      });

      // Send deal package email to dispo manager
      const dispoMember = (playbook?.team?.members ?? []).find((m: any) => m.role === 'dispo_manager');
      if (dispoMember?.email) {
        const cf = (contact?.customFields ?? {}) as Record<string, string>;
        const address = cf.property_address ?? 'N/A';
        const subject = `New Deal Package — ${address}`;
        const html = `<h2>Deal Package</h2>
<p><strong>Property:</strong> ${address}</p>
<p><strong>ARV:</strong> ${cf.arv ?? 'N/A'}</p>
<p><strong>Repair Estimate:</strong> ${cf.repair_estimate ?? 'N/A'}</p>
<p><strong>Contract Price:</strong> ${cf.contract_price ?? 'N/A'}</p>
<p><strong>Seller:</strong> ${contact?.name ?? 'Unknown'}</p>
<pre>${dealPackageBody}</pre>`;

        await emailBot.sendEmail(contactId, subject, html, dispoMember.email).catch(err => {
          auditLog({ agent: AGENT_ID, contactId, action: 'emailBot:failed', result: 'error', reason: err?.message });
        });
      } else {
        auditLog({ agent: AGENT_ID, contactId, action: 'email:skipped', result: 'skipped', reason: 'no dispo_manager email in playbook' });
      }

      // Move to dispo pipeline
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
