/**
 * LM Assistant Agent
 *
 * Fires on: call.completed (after every LM call)
 * Does: reads call outcome, routes to sub-agents, always fires call coaching
 * Does NOT: touch CRM directly
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { runCallCoaching } from './call-coaching';
import { runAlreadySoldAgent } from './already-sold-agent';
import { runBucketReeval } from './bucket-reeval';

const AGENT_ID = 'lm-assistant';

type CallOutcome =
  | 'appointment'
  | 'conversation'
  | 'voicemail'
  | 'no-answer'
  | 'not-right-now'
  | 'sold'
  | 'wrong-number';

interface CallEvent extends GunnerEvent {
  outcome: CallOutcome;
  transcript?: string;
  callId: string;
  callDurationSec?: number;
}

export async function runLmAssistant(event: CallEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, tenantId, outcome, callId } = event;
  const start = Date.now();

  // Always run coaching on every call
  await runCallCoaching(event);

  // Route based on outcome
  switch (outcome) {
    case 'appointment':
      await emit({ kind: 'call.appointment', tenantId, contactId, opportunityId, callId });
      break;

    case 'conversation':
      await emit({ kind: 'call.conversation', tenantId, contactId, opportunityId, callId });
      break;

    case 'voicemail':
      await emit({ kind: 'call.voicemail', tenantId, contactId, opportunityId, callId });
      break;

    case 'no-answer':
      await emit({ kind: 'call.no-answer', tenantId, contactId, opportunityId, callId });
      break;

    case 'not-right-now':
      await runBucketReeval(event);
      break;

    case 'sold':
      await runAlreadySoldAgent(event);
      break;

    case 'wrong-number':
      await emit({ kind: 'call.wrong-number', tenantId, contactId, opportunityId, callId });
      break;
  }

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: `call.routed:${outcome}`,
    result: 'success',
    durationMs: Date.now() - start,
  });
}
