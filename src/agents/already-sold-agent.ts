/**
 * Already Sold Agent
 *
 * Fires on: call outcome "sold" (via lm-assistant)
 * Does: audits transcript for UC vs Sold distinction, routes accordingly
 * Does NOT: touch CRM directly — uses bots
 *
 * Logic:
 *   - If LM asked "under contract or fully sold?" → route based on answer
 *     - Under Contract → re-engage (emit)
 *     - Fully Sold → move to Lost
 *   - If LM didn't ask → coaching flag + default to Lost with verification task
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { stageBot } from '../bots/stage';
import { taskBot } from '../bots/task';
import { noteBot } from '../bots/note';
import { loadPlaybook, getStageId, getTaskTemplate } from '../config';

const AGENT_ID = 'already-sold-agent';

type SoldClassification = 'under-contract' | 'fully-sold' | 'unclear';

interface SoldEvent extends GunnerEvent {
  callId: string;
  transcript?: string;
  outcome: string;
}

export async function runAlreadySoldAgent(event: SoldEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, tenantId, callId, transcript } = event;
  const start = Date.now();
  const playbook = getPlaybook(tenantId);

  // Guard: need transcript to audit
  if (!transcript) {
    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'sold:skipped',
      result: 'no-transcript',
      durationMs: Date.now() - start,
    });
    return;
  }

  // Audit: did LM ask the UC question?
  const askedUcQuestion = checkAskedUcQuestion(transcript, playbook);
  const classification = classifySoldType(transcript, playbook);

  // Coaching flag if LM didn't ask
  if (!askedUcQuestion) {
    await emit({
      kind: 'coaching.flag',
      tenantId,
      contactId,
      callId,
      flag: 'missing-uc-question',
      message: 'LM did not ask "under contract or fully sold?"',
    });
  }

  if (!isDryRun()) {
    if (classification === 'under-contract') {
      // UC → re-engage
      await noteBot(contactId, {
        body: `🏠 Property under contract (not fully sold). Re-engaging. Call: ${callId}`,
      });
      await emit({
        kind: 'lead.re-engage',
        tenantId,
        contactId,
        opportunityId,
        reason: 'under-contract',
      });
    } else {
      // Fully sold or unclear → Lost
      const lostStage = playbook?.stages?.lost ?? 'Lost';
      await stageBot(opportunityId, { stage: lostStage });
      await noteBot(contactId, {
        body: `❌ Property already sold (${classification}). Moved to Lost. Call: ${callId}`,
      });
    }

    // Always create county records verification task
    const verifyTask = playbook?.tasks?.countyVerification ?? 'Verify county records - property sold status';
    await taskBot(contactId, { action: 'create', taskName: verifyTask });
  }

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: `sold:${classification}`,
    result: askedUcQuestion ? 'uc-question-asked' : 'uc-question-missing',
    meta: { callId, classification, askedUcQuestion },
    durationMs: Date.now() - start,
    dryRun: isDryRun(),
  });
}

function checkAskedUcQuestion(transcript: string, playbook: any): boolean {
  const ucPatterns = playbook?.coaching?.ucPatterns ?? [
    'under contract',
    'fully sold',
    'closed on it',
    'still under contract',
  ];
  const lower = transcript.toLowerCase();
  return ucPatterns.some((p: string) => lower.includes(p));
}

function classifySoldType(transcript: string, playbook: any): SoldClassification {
  const lower = transcript.toLowerCase();
  const ucIndicators = playbook?.sold?.ucIndicators ?? [
    'under contract',
    'pending',
    'in escrow',
    'not closed yet',
  ];
  const soldIndicators = playbook?.sold?.soldIndicators ?? [
    'fully sold',
    'already closed',
    'sold it',
    'closed last',
  ];

  const hasUc = ucIndicators.some((p: string) => lower.includes(p));
  const hasSold = soldIndicators.some((p: string) => lower.includes(p));

  if (hasUc && !hasSold) return 'under-contract';
  if (hasSold && !hasUc) return 'fully-sold';
  return 'unclear';
}
