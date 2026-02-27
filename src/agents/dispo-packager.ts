/**
 * Dispo Packager Agent
 *
 * Fires on: contract.package.dispo
 * Does: pulls deal data, writes note, creates dispo opportunity
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { loadPlaybook } from '../config/loader';
import { contactBot } from '../bots/contact';
import { noteBot, stageBot } from '../bots';

const AGENT_ID = 'dispo-packager';

export async function runDispoPackager(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, tenantId } = event;
  const start = Date.now();
  const playbook = await loadPlaybook(tenantId);
  const dispoStage = playbook?.stages?.dispoNew ?? 'New Deal';

  const contact = await contactBot(contactId);
  const cf = (contact as any)?.customFields ?? {};

  const arv = cf.arv ?? 'N/A';
  const repairs = cf.repair_estimate ?? 'N/A';
  const contractPrice = cf.contract_price ?? 'N/A';
  const propertyAddress = cf.property_address ?? 'N/A';
  const spread = arv !== 'N/A' && contractPrice !== 'N/A'
    ? `$${Number(arv) - Number(contractPrice)}`
    : 'N/A';

  if (!isDryRun()) {
    await noteBot(contactId, [
      `📦 Dispo Deal Package`,
      `Property: ${propertyAddress}`,
      `ARV: ${arv} | Repairs: ${repairs} | Contract: ${contractPrice} | Spread: ${spread}`,
      cf.deal_summary ? `Summary: ${cf.deal_summary}` : '',
    ].filter(Boolean).join('\n'));

    // Stage move for dispo pipeline — using opportunityId
    if (opportunityId) {
      await stageBot(opportunityId, dispoStage);
    }
  }

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: 'dispo.packaged',
    result: 'success',
    durationMs: Date.now() - start,
  });
}
