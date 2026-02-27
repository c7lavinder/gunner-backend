/**
 * Buyer Intake Agent
 *
 * Fires on: buyer pipeline → new_buyer
 * Does: Captures buy criteria (area, price range, property type), tags appropriately
 */

import { GunnerEvent } from '../../core/event-bus';
import { auditLog } from '../../core/audit';
import { isEnabled } from '../../core/toggles';
import { isDryRun } from '../../core/dry-run';
import { contactBot, noteBot, taskBot, tagBot } from '../../bots';
import { memoryWriterBot } from '../../bots/memory-writer';

const AGENT_ID = 'buyer-intake';
const ESTEBAN_USER_ID = 'BhVAeJjAfojeX9AJdqbf';

export async function runBuyerIntake(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  try {
    const { contactId, opportunityId, tenantId } = event;
    const start = Date.now();

    const contact = await contactBot(contactId).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'contactBot:failed', result: 'error', reason: err?.message });
      return null;
    });
    const cf = (contact as any)?.customFields ?? {};
    const firstName = (contact as any)?.firstName ?? 'Buyer';
    const lastName = (contact as any)?.lastName ?? '';
    const buyerName = `${firstName} ${lastName}`.trim();

    // Buy criteria
    const areas = cf.buy_areas ?? cf.target_areas ?? '';
    const maxPrice = cf.max_price ?? cf.buy_max ?? '';
    const minPrice = cf.min_price ?? cf.buy_min ?? '';
    const propertyTypes = cf.property_types ?? cf.buy_property_type ?? 'SFR';
    const proofOfFunds = cf.proof_of_funds ?? false;
    const buyerType = cf.buyer_type ?? 'cash'; // cash, hard-money, conventional

    // Build tags
    const tags: string[] = ['new-buyer'];
    if (proofOfFunds) tags.push('pof-on-file');
    if (buyerType) tags.push(`buyer-${buyerType}`);
    if (areas) {
      const areaList = String(areas).split(',').map(a => a.trim().toLowerCase());
      for (const area of areaList.slice(0, 3)) {
        if (area) tags.push(`area-${area.replace(/\s+/g, '-')}`);
      }
    }

    if (!isDryRun()) {
      await tagBot(contactId, tags).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'tagBot:failed', result: 'error', reason: err?.message });
      });

      await noteBot(contactId, [
        `📥 New Buyer Intake`,
        `Name: ${buyerName}`,
        `Areas: ${areas || 'Not specified'}`,
        `Price Range: ${minPrice ? `$${minPrice}` : 'N/A'} - ${maxPrice ? `$${maxPrice}` : 'N/A'}`,
        `Property Types: ${propertyTypes}`,
        `Buyer Type: ${buyerType}`,
        `Proof of Funds: ${proofOfFunds ? '✅ Yes' : '❌ No'}`,
        `Tags applied: ${tags.join(', ')}`,
      ].join('\n')).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'noteBot:failed', result: 'error', reason: err?.message });
      });

      await taskBot(contactId, {
        title: `📥 Welcome new buyer: ${buyerName}`,
        body: `New buyer added. Review criteria and collect any missing info.\nAreas: ${areas || 'MISSING'}\nPrice Range: ${minPrice || '?'} - ${maxPrice || '?'}\nPOF: ${proofOfFunds ? 'Yes' : 'MISSING'}`,
        assignedTo: ESTEBAN_USER_ID,
        dueDate: new Date(Date.now() + 8 * 60 * 60_000).toISOString(),
      }).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'taskBot:failed', result: 'error', reason: err?.message });
      });
    }

    await memoryWriterBot.recordAction('buyer-intake', { contactId, buyerName }, { areas, maxPrice, minPrice, propertyTypes, buyerType, proofOfFunds }, tenantId).catch(err => {
      console.error(`[${AGENT_ID}] memoryWriterBot:failed`, (err as Error).message);
    });

    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'buyer.intake.complete',
      result: 'success',
      metadata: { buyerName, areas, tags },
      durationMs: Date.now() - start,
    });
  } catch (err: any) {
    auditLog({ agent: AGENT_ID, contactId: event.contactId, action: 'agent:crashed', result: 'error', reason: err?.message });
  }
}
