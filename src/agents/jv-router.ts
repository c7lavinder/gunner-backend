/**
 * JV Router Agent
 *
 * Fires on: dispo stage → with_jv_partner
 * Does: Creates JV coordination tasks, notes deal terms, tags deal
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { loadPlaybook } from '../config/loader';
import { contactBot, noteBot, taskBot, tagBot } from '../bots';

const AGENT_ID = 'jv-router';
const ESTEBAN_USER_ID = 'BhVAeJjAfojeX9AJdqbf';

export async function runJvRouter(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  try {
    const { contactId, opportunityId, tenantId } = event;
    const start = Date.now();
    const playbook = await loadPlaybook(tenantId);

    const contact = await contactBot(contactId).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'contactBot:failed', result: 'error', reason: err?.message });
      return null;
    });
    const cf = (contact as any)?.customFields ?? {};
    const propertyAddress = cf.property_address ?? 'N/A';
    const jvPartner = cf.jv_partner_name ?? (event.metadata as any)?.jvPartnerName ?? 'TBD';
    const jvSplit = cf.jv_split ?? (event.metadata as any)?.jvSplit ?? '50/50';
    const contractPrice = cf.contract_price ?? 'N/A';

    if (!isDryRun()) {
      await tagBot(contactId, ['jv-deal']).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'tagBot:failed', result: 'error', reason: err?.message });
      });

      await noteBot(contactId, [
        `🤝 JV Deal Routed`,
        `Property: ${propertyAddress}`,
        `JV Partner: ${jvPartner}`,
        `Split: ${jvSplit}`,
        `Contract Price: ${contractPrice}`,
      ].join('\n')).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'noteBot:failed', result: 'error', reason: err?.message });
      });

      await taskBot(contactId, {
        title: `🤝 Coordinate JV terms on ${propertyAddress}`,
        body: `JV Partner: ${jvPartner}\nSplit: ${jvSplit}\nContract: ${contractPrice}\n\nAction items:\n- Confirm JV agreement\n- Get partner's buyer list or buyer\n- Agree on fee split\n- Set closing timeline`,
        assignedTo: ESTEBAN_USER_ID,
        dueDate: new Date(Date.now() + 8 * 60 * 60_000).toISOString(),
      }).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'taskBot:failed', result: 'error', reason: err?.message });
      });
    }

    await emit({
      kind: 'dispo.jv.routed',
      tenantId,
      contactId,
      opportunityId,
      metadata: { jvPartner, jvSplit },
    }).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'emit:dispo.jv.routed:failed', result: 'error', reason: err?.message });
    });

    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'dispo.jv.routed',
      result: 'success',
      metadata: { jvPartner, jvSplit, propertyAddress },
      durationMs: Date.now() - start,
    });
  } catch (err: any) {
    auditLog({ agent: AGENT_ID, contactId: event.contactId, action: 'agent:crashed', result: 'error', reason: err?.message });
  }
}
