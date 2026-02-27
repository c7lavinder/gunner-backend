/**
 * TC Packager Agent
 *
 * Fires on: contract.package.tc
 * Does:
 *   1. Pulls seller info, contract price, closing date, access instructions
 *   2. Writes a TC handoff note via noteBot
 *   3. Flags missing fields with a task
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { loadPlaybook, getFieldName } from '../config';
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

  // Resolve custom field names from playbook
  const sellerNameField = await getFieldName(tenantId, 'seller_name');
  const propertyAddressField = await getFieldName(tenantId, 'property_address');
  const contractPriceField = await getFieldName(tenantId, 'contract_price');
  const closingDateField = await getFieldName(tenantId, 'closing_date');
  const accessField = await getFieldName(tenantId, 'access_instructions');

  // Pull contact/deal data
  const contact = await contactBot(contactId);
  const cf = (contact?.customFields ?? {}) as Record<string, string>;

  // Check for missing fields
  const requiredFields = playbook?.tcPackager?.requiredFields ?? REQUIRED_FIELDS;
  const missing = requiredFields.filter(
    (f: string) => !cf[f] && !(contact as any)?.[f],
  );

  if (!isDryRun()) {
    // Write TC handoff note
    const sellerName = contact?.name ?? cf[sellerNameField] ?? 'Unknown';
    const propertyAddress = cf[propertyAddressField] ?? 'N/A';
    const contractPrice = cf[contractPriceField] ?? 'N/A';
    const closingDate = cf[closingDateField] ?? 'N/A';
    const accessInstructions = cf[accessField] ?? 'N/A';

    await noteBot(contactId, [
      `📋 TC HANDOFF PACKAGE`,
      `Seller: ${sellerName}`,
      `Property: ${propertyAddress}`,
      `Contract Price: ${contractPrice}`,
      `Closing Date: ${closingDate}`,
      `Access: ${accessInstructions}`,
      `Phone: ${contact?.phone ?? 'N/A'}`,
      `Email: ${contact?.email ?? 'N/A'}`,
      missing.length > 0 ? `⚠️ Missing: ${missing.join(', ')}` : '',
    ].filter(Boolean).join('\n'));

    // Flag missing fields with AM task
    if (missing.length > 0) {
      await taskBot(contactId, {
        title: `TC Package incomplete — missing: ${missing.join(', ')}`,
        assignedTo: playbook?.roles?.acquisitionManager ?? 'am',
        dueDate: new Date(Date.now() + 60 * 60_000).toISOString(),
      });
    }
  }

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: 'tc.packaged',
    result: missing.length > 0 ? 'error' : 'success',
    durationMs: Date.now() - start,
    metadata: missing.length > 0 ? { missing } : undefined,
  });
}
