/**
 * Dispo Packager Agent
 *
 * Fires on: contract.package.dispo
 * Does:
 *   1. Pulls ARV, repairs, contract price, deal summary
 *   2. AI-writes a deal package note via noteBot
 *   3. Creates new opportunity in Dispo Pipeline via stageBot
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
  const dispoPipelineId = playbook?.pipelines?.dispo ?? 'dispo';
  const dispoStage = playbook?.stages?.dispoNew ?? 'New Deal';

  // Pull contact/deal data
  const contact = await contactBot(contactId);
  const cf = contact?.customFields ?? {};

  const arv = cf.arv ?? 'N/A';
  const repairs = cf.repair_estimate ?? 'N/A';
  const contractPrice = cf.contract_price ?? 'N/A';
  const propertyAddress = cf.property_address ?? 'N/A';

  if (!isDryRun()) {
    // AI-write deal package note
    await noteBot({
      contactId,
      opportunityId,
      tenantId,
      templateKey: 'dispo_deal_package',
      context: {
        propertyAddress,
        arv,
        repairs,
        contractPrice,
        spread: arv !== 'N/A' && contractPrice !== 'N/A'
          ? `$${Number(arv) - Number(contractPrice)}`
          : 'N/A',
        dealSummary: cf.deal_summary ?? '',
      },
    });

    // Create new opportunity in Dispo Pipeline
    await stageBot({
      contactId,
      tenantId,
      pipelineId: dispoPipelineId,
      stageName: dispoStage,
      createOpportunity: true,
      opportunityName: `Dispo: ${propertyAddress}`,
    });
  }

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: 'dispo.packaged',
    result: 'note_and_opportunity_created',
    durationMs: Date.now() - start,
  });
}
