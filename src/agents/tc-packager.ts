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

const AGENT_ID = 'tc-packager';

const REQUIRED_FIELDS = [
  'seller_name', 'property_address', 'contract_price',
  'closing_date', 'access_instructions', 'seller_phone', 'seller_email',
];

export async function runTCPackager(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

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

  const contact = await contactBot(contactId);
  const cf = (contact?.customFields ?? {}) as Record<string, string>;

  const requiredFields = playbook?.tcPackager?.requiredFields ?? REQUIRED_FIELDS;
  const missing = requiredFields.filter((f: string) => !cf[f] && !(contact as any)?.[f]);

  if (!isDryRun()) {
    await noteBot(contactId, templateBot.buildTcPackage(contact as Record<string, unknown>, {
      sellerName: contact?.name ?? cf[sellerNameField] ?? 'Unknown',
      propertyAddress: cf[propertyAddressField] ?? 'N/A',
      contractPrice: cf[contractPriceField] ?? 'N/A',
      closingDate: cf[closingDateField] ?? 'N/A',
      accessInstructions: cf[accessField] ?? 'N/A',
    }, missing));

    if (missing.length > 0) {
      await taskBot(contactId, {
        title: `TC Package incomplete — missing: ${missing.join(', ')}`,
        assignedTo: playbook?.roles?.acquisitionManager ?? 'am',
        dueDate: new Date(Date.now() + 60 * 60_000).toISOString(),
      });
    }
  }

  auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'tc.packaged', result: missing.length > 0 ? 'error' : 'success', durationMs: Date.now() - start, metadata: missing.length > 0 ? { missing } : undefined });
}
