/**
 * Already Sold Agent — pure orchestration.
 * Fires on: call outcome "sold"
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { stageBot } from '../bots/stage';
import { taskBot } from '../bots/task';
import { noteBot } from '../bots/note';
import { loadPlaybook } from '../config';
import { classifierBot } from '../bots/classifier';
import { templateBot } from '../bots/template';

const AGENT_ID = 'already-sold-agent';

interface SoldEvent extends GunnerEvent {
  callId: string;
  transcript?: string;
  outcome: string;
}

export async function runAlreadySoldAgent(event: SoldEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  try {
    const { contactId, opportunityId, tenantId, callId, transcript } = event;
    const start = Date.now();
    const playbook = await loadPlaybook(tenantId);

    if (!transcript) {
      auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'sold:skipped', result: 'skipped', reason: 'no-transcript', durationMs: Date.now() - start });
      return;
    }

    const askedUcQuestion = classifierBot.checkAskedUcQuestion(transcript, playbook);
    const classification = classifierBot.classifySoldType(transcript, playbook);

    if (!askedUcQuestion) {
      await emit({ kind: 'coaching.flag', tenantId, contactId, callId, metadata: { flag: 'missing-uc-question', message: 'LM did not ask "under contract or fully sold?"' }, receivedAt: Date.now() }).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'emit:coaching.flag:failed', result: 'error', reason: err?.message });
      });
    }

    if (!isDryRun()) {
      if (classification === 'under-contract') {
        await noteBot(contactId, templateBot.buildNote('sold:under-contract', { callId })).catch(err => {
          auditLog({ agent: AGENT_ID, contactId, action: 'noteBot:failed', result: 'error', reason: err?.message });
        });
        await emit({ kind: 'lead.re-engage', tenantId, contactId, opportunityId, metadata: { reason: 'under-contract' }, receivedAt: Date.now() }).catch(err => {
          auditLog({ agent: AGENT_ID, contactId, action: 'emit:lead.re-engage:failed', result: 'error', reason: err?.message });
        });
      } else {
        const lostStage = playbook?.stages?.lost ?? 'Lost';
        await stageBot(opportunityId!, lostStage).catch(err => {
          auditLog({ agent: AGENT_ID, contactId, action: 'stageBot:failed', result: 'error', reason: err?.message });
        });
        await noteBot(contactId, templateBot.buildNote('sold:lost', { classification, callId })).catch(err => {
          auditLog({ agent: AGENT_ID, contactId, action: 'noteBot:failed', result: 'error', reason: err?.message });
        });
      }

      const verifyTask = playbook?.tasks?.countyVerification ?? 'Verify county records - property sold status';
      await taskBot(contactId, { title: verifyTask }).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'taskBot:failed', result: 'error', reason: err?.message });
      });
    }

    auditLog({ agent: AGENT_ID, contactId, opportunityId, action: `sold:${classification}`, result: askedUcQuestion ? 'success' : 'error', metadata: { callId, classification, askedUcQuestion }, durationMs: Date.now() - start });
  } catch (err: any) {
    auditLog({ agent: AGENT_ID, contactId: event.contactId, action: 'agent:crashed', result: 'error', reason: err?.message });
  }
}
