/**
 * TC Packager Agent
 *
 * Fires on: contract.package.tc
 * Does:
 *   1. Pulls seller info, contract price, closing date, access instructions
 *   2. AI-writes a TC handoff note via noteBot
 *   3. Flags missing fields with a task
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { loadPlaybook } from '../config/loader';
import { getFieldName, getNoteTemplate } from '../config/helpers';
import { contactBot } from '../bots/contact';
import { noteBot, taskBot } from '../bots';

const AGENT_ID = 'tc-packager';

const REQUIRED_FIELDS = [
  'seller_name',
  'property_address',
  'contract_price',
  'closing_date',
  'access_instructions',
  'seller_phone',
  'seller_email',
];

export async function runTCPackager(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, tenantId } = event;
  const start = Date.now();
  const playbook = await loadPlaybook(tenantId);
  const tc = playbook?.roles?.transactionCoordinator ?? 'tc';
  const am = playbook?.roles?.acquisitionManager ?? 'am';

  // Resolve custom field names and note template from playbook
  const [
    sellerNameField,
    propertyAddressField,
    contractPriceField,
    closingDateField,
    accessField,
    tcHandoffTemplate,
  ] = await Promise.all([
    getFieldName(tenantId, 'seller_name'),
    getFieldName(tenantId, 'property_address'),
    getFieldName(tenantId, 'contract_price'),
    getFieldName(tenantId, 'closing_date'),
    getFieldName(tenantId, 'access_instructions'),
    getNoteTemplate(tenantId, 'tc_handoff'),
  ]);

  // Pull contact/deal data via contactBot
  const contact = await contactBot(contactId);

  // Check for missing fields
  const requiredFields = playbook?.tcPackager?.requiredFields ?? REQUIRED_FIELDS;
  const missing = requiredFields.filter(
    (f: string) => !contact?.customFields?.[f] && !contact?.[f],
  );

  if (!isDryRun()) {
    // AI-write TC handoff note
    await noteBot({
      contactId,
      opportunityId,
      tenantId,
      template: tcHandoffTemplate,
      context: {
        sellerName: contact?.name ?? contact?.customFields?.[sellerNameField] ?? 'Unknown',
        propertyAddress: contact?.customFields?.[propertyAddressField] ?? 'N/A',
        contractPrice: contact?.customFields?.[contractPriceField] ?? 'N/A',
        closingDate: contact?.customFields?.[closingDateField] ?? 'N/A',
        accessInstructions: contact?.customFields?.[accessField] ?? 'N/A',
        sellerPhone: contact?.phone ?? 'N/A',
        sellerEmail: contact?.email ?? 'N/A',
      },
    });

    // Flag missing fields
    if (missing.length > 0) {
      await taskBot({
        contactId,
        opportunityId,
        tenantId,
        title: `TC Package incomplete — missing: ${missing.join(', ')}`,
        assignTo: am,
        dueMins: 60,
      });
    }
  }

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: 'tc.packaged',
    result: missing.length > 0 ? `missing:${missing.join(',')}` : 'complete',
    durationMs: Date.now() - start,
  });
}
