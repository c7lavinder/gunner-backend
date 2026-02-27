/**
 * Stage Change Router
 *
 * Fires when: any opportunity changes stage
 * Does: decides what happens next based on which stage the lead moved to
 * This is the ONLY place that triggers downstream actions on stage changes.
 *
 * It does NOT score leads. It does NOT send SMS directly.
 * It calls other bots/agents based on the new stage.
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { getConfig } from '../playbook/config';
import { stageBot } from '../bots/stage'; // only used when routing requires a move
import { assignBot } from '../bots/assign';
import { taskBot } from '../bots/task';

const AGENT_ID = 'stage-change-router';

export async function runStageChangeRouter(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  try {
    const { contactId, opportunityId, stageId, stageName } = event;
    const config = getConfig();
    const start = Date.now();

    // Route based on incoming stage
    switch (stageId) {
      case config.stages.warm:
      case config.stages.hot:
        if (opportunityId) {
          await assignBot(opportunityId, config.team.defaultLM).catch(err => {
            auditLog({ agent: AGENT_ID, contactId, action: 'assignBot:failed', result: 'error', reason: err?.message });
          });
        }
        break;

      case config.stages.appointment:
        if (opportunityId) {
          await assignBot(opportunityId, config.team.defaultAM).catch(err => {
            auditLog({ agent: AGENT_ID, contactId, action: 'assignBot:failed', result: 'error', reason: err?.message });
          });
          await taskBot(contactId, {
            title: '📋 Appointment confirmed — prep for walkthrough',
            assignedTo: config.team.defaultAM,
          }).catch(err => {
            auditLog({ agent: AGENT_ID, contactId, action: 'taskBot:failed', result: 'error', reason: err?.message });
          });
        }
        break;

      case config.stages.ghosted:
      case config.stages.notAFit:
        break;

      default:
        break;
    }

    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: `stage-change:${stageName ?? stageId}`,
      result: 'success',
      durationMs: Date.now() - start,
    });
  } catch (err: any) {
    auditLog({ agent: AGENT_ID, contactId: event.contactId, action: 'agent:crashed', result: 'error', reason: err?.message });
  }
}
