/**
 * TC Packager Agent — pure orchestration.
 * Fires on: contract.package.tc
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { loadPlaybook, getFieldName } from '../config';
import { contactBot } from '../bots/contact';
import { noteBot, taskBot } from '../bots';
import { templateBot } from '../bots/template';
import { emailBot } from '../bots/email';

const AGENT_ID = 'tc-packager';

const REQUIRED_FIELDS = [
  'seller_name', 'property_address', 'contract_price',
  'closing_date', 'access_instructions', 'seller_phone', 'seller_email',
];

export async function runTCPackager(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  try {
    const { contactId, opportunityId, tenantId } = event;
    const start = Date.now();
    const playbook = await loadPlaybook(tenantId);

    const [sellerNameField, propertyAddressField, contractPriceField, closingDateField, accessField] = await Promise.all([
      getFieldName(tenantId, 'seller_name'),
      getFieldName(tenantId, 'property_address'),
      getFieldName(tenantId, 'contract_price'),
      getFieldName(tenantId, 'closing_date'),
      getFieldName(tenantId, 'access_instructions'),
    ]);

    const contact = await contactBot(contactId).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'contactBot:failed', result: 'error', reason: err?.message });
      return null;
    });
    const cf = (contact?.customFields ?? {}) as Record<string, string>;

    const requiredFields = playbook?.tcPackager?.requiredFields ?? REQUIRED_FIELDS;
    const missing = requiredFields.filter((f: string) => !cf[f] && !(contact as any)?.[f]);

    const packageData = {
      sellerName: contact?.name ?? cf[sellerNameField] ?? 'Unknown',
      propertyAddress: cf[propertyAddressField] ?? 'N/A',
      contractPrice: cf[contractPriceField] ?? 'N/A',
      closingDate: cf[closingDateField] ?? 'N/A',
      accessInstructions: cf[accessField] ?? 'N/A',
    };

    const packageBody = templateBot.buildTcPackage(contact as Record<string, unknown>, packageData, missing);

    if (!isDryRun()) {
      // Write note to CRM
      await noteBot(contactId, packageBody).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'noteBot:failed', result: 'error', reason: err?.message });
      });

      // Send email to title company
      const tcEmail = playbook?.underContract?.tcEmail;
      if (tcEmail) {
        const subject = `New Contract — ${packageData.sellerName} — ${packageData.propertyAddress}`;
        const html = `<h2>TC Handoff Package</h2>
<p><strong>Seller:</strong> ${packageData.sellerName}</p>
<p><strong>Property:</strong> ${packageData.propertyAddress}</p>
<p><strong>Contract Price:</strong> ${packageData.contractPrice}</p>
<p><strong>Closing Date:</strong> ${packageData.closingDate}</p>
<p><strong>Access Instructions:</strong> ${packageData.accessInstructions}</p>
${missing.length > 0 ? `<p style="color:red"><strong>Missing Info:</strong> ${missing.join(', ')}</p>` : ''}`;

        await emailBot.sendEmail(contactId, subject, html, tcEmail).catch(err => {
          auditLog({ agent: AGENT_ID, contactId, action: 'emailBot:failed', result: 'error', reason: err?.message });
        });
      } else {
        auditLog({ agent: AGENT_ID, contactId, action: 'email:skipped', result: 'skipped', reason: 'no tcEmail in playbook' });
      }

      if (missing.length > 0) {
        await taskBot(contactId, {
          title: `TC Package incomplete — missing: ${missing.join(', ')}`,
          assignedTo: playbook?.roles?.acquisitionManager ?? 'am',
          dueDate: new Date(Date.now() + 60 * 60_000).toISOString(),
        }).catch(err => {
          auditLog({ agent: AGENT_ID, contactId, action: 'taskBot:failed', result: 'error', reason: err?.message });
        });
      }
    }

    auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'tc.packaged', result: missing.length > 0 ? 'error' : 'success', durationMs: Date.now() - start, metadata: missing.length > 0 ? { missing } : undefined });
  } catch (err: any) {
    auditLog({ agent: AGENT_ID, contactId: event.contactId, action: 'agent:crashed', result: 'error', reason: err?.message });
  }
}
