/**
 * Call Coaching Agent — pure orchestration.
 * Fires on: every LM call
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { noteBot } from '../bots/note';
import { loadPlaybook } from '../config';
import { classifierBot, CallScore } from '../bots/classifier';
import { templateBot } from '../bots/template';

const AGENT_ID = 'call-coaching';

interface CallEvent extends GunnerEvent {
  callId: string;
  transcript?: string;
  outcome: string;
  callDurationSec?: number;
}

export async function runCallCoaching(event: CallEvent): Promise<CallScore | null> {
  if (!isEnabled(AGENT_ID)) return null;

  try {
    const { contactId, opportunityId, callId, transcript } = event;
    const start = Date.now();
    const playbook = await loadPlaybook(event.tenantId);

    if (!transcript) {
      auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'coaching:skipped', result: 'skipped', reason: 'no-transcript', durationMs: Date.now() - start });
      return null;
    }

    const score = await classifierBot.scoreCall(callId, contactId, transcript, playbook).catch(err => {
      auditLog({ agent: AGENT_ID, contactId, action: 'classifierBot.scoreCall:failed', result: 'error', reason: err?.message });
      return null;
    });

    if (!score) return null;

    if (!isDryRun()) {
      await noteBot(contactId, templateBot.buildNote('coaching:summary', { callId, summary: score.summary })).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'noteBot:failed', result: 'error', reason: err?.message });
      });
    }

    auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'coaching:scored', result: 'success', metadata: { callId, overall: score.overall, factors: score.factors.length, flags: score.coachingFlags }, durationMs: Date.now() - start });

    return score;
  } catch (err: any) {
    auditLog({ agent: AGENT_ID, contactId: event.contactId, action: 'agent:crashed', result: 'error', reason: err?.message });
    return null;
  }
}
