/**
 * Closing Agent
 *
 * Fires on: dispo stage → closed
 * Does: Calculates profit, creates closing summary note, triggers post-close
 */

import { GunnerEvent, emit } from '../../core/event-bus';
import { auditLog } from '../../core/audit';
import { isEnabled } from '../../core/toggles';
import { isDryRun } from '../../core/dry-run';
import { contactBot, noteBot, taskBot, tagBot } from '../../bots';
import { memoryWriterBot } from '../../bots/memory-writer';

const AGENT_ID = 'dispo-closing-agent';
const ESTEBAN_USER_ID = 'BhVAeJjAfojeX9AJdqbf';

export async function runClosingAgent(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  try {
    const { contactId, opportunityId, tenantId } = event;
    const start = Date.now();

    const contact = await contactBot(contactId).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'contactBot:failed', result: 'error', reason: err?.message });
      return null;
    });
    const cf = (contact as any)?.customFields ?? {};
    const propertyAddress = cf.property_address ?? 'N/A';
    const contractPrice = parseFloat(cf.contract_price) || 0;
    const salePrice = parseFloat(cf.sale_price ?? cf.buyer_price) || 0;
    const closingCosts = parseFloat(cf.closing_costs) || 0;
    const profit = salePrice - contractPrice - closingCosts;
    const buyerName = cf.buyer_name ?? (event.metadata as any)?.buyerName ?? 'N/A';
    const isJv = cf.jv_partner_name || (event.metadata as any)?.isJv;
    const jvSplit = cf.jv_split ?? '50/50';

    if (!isDryRun()) {
      await tagBot(contactId, ['dispo-closed']).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'tagBot:failed', result: 'error', reason: err?.message });
      });

      const noteLines = [
        `💰 DEAL CLOSED — ${propertyAddress}`,
        `---`,
        `Contract Price: $${contractPrice.toLocaleString()}`,
        `Sale Price: $${salePrice.toLocaleString()}`,
        `Closing Costs: $${closingCosts.toLocaleString()}`,
        `Gross Profit: $${profit.toLocaleString()}`,
        ...(isJv ? [`JV Split: ${jvSplit}`, `Net Profit (est): $${Math.round(profit * 0.5).toLocaleString()}`] : []),
        `---`,
        `Buyer: ${buyerName}`,
        `Closed: ${new Date().toISOString().split('T')[0]}`,
      ];
      await noteBot(contactId, noteLines.join('\n')).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'noteBot:failed', result: 'error', reason: err?.message });
      });

      // Post-close follow-up task
      await taskBot(contactId, {
        title: `✅ Post-close wrap-up: ${propertyAddress}`,
        body: `Profit: $${profit.toLocaleString()}\nBuyer: ${buyerName}\n\nAction items:\n- Confirm wire received\n- Update books/records\n- Send thank you to buyer\n- Request testimonial if appropriate`,
        assignedTo: ESTEBAN_USER_ID,
        dueDate: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
      }).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'taskBot:failed', result: 'error', reason: err?.message });
      });
    }

    // Trigger post-close event
    await emit({
      kind: 'post_close.scheduled',
      tenantId,
      contactId,
      opportunityId,
      metadata: { profit, salePrice, contractPrice, buyerName, propertyAddress },
    }).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'emit:post_close.scheduled:failed', result: 'error', reason: err?.message });
    });

    await memoryWriterBot.recordAction('dispo-closing', { contactId, propertyAddress }, { profit, salePrice, contractPrice, buyerName, closingCosts }, tenantId).catch(err => {
      console.error(`[${AGENT_ID}] memoryWriterBot:failed`, (err as Error).message);
    });

    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'dispo.closed',
      result: 'success',
      metadata: { profit, propertyAddress, buyerName },
      durationMs: Date.now() - start,
    });
  } catch (err: any) {
    auditLog({ agent: AGENT_ID, contactId: event.contactId, action: 'agent:crashed', result: 'error', reason: err?.message });
  }
}
