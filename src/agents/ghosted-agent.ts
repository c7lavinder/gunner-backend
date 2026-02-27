/**
 * Ghosted Agent
 *
 * Fires on: lead.ghosted (Day 14 with no real conversation)
 * Does: moves to Ghosted stage, applies tag, checks off Lead IQ task
 * Does NOT: stop the drip — drip keeps running
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { stageBot } from '../bots/stage';
import { tagBot } from '../bots/tag';
import { taskBot } from '../bots/task';
import { getPlaybook } from '../core/playbook';

const AGENT_ID = 'ghosted-agent';

interface GhostedEvent extends GunnerEvent {
  dayOffset: number;
  currentStage?: string;
}

export async function runGhostedAgent(event: GhostedEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, tenantId } = event;
  const start = Date.now();
  const playbook = getPlaybook(tenantId);

  // Guard: already ghosted
  const ghostedStage = playbook?.stages?.ghosted ?? 'Ghosted';
  if (event.currentStage === ghostedStage) {
    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'ghosted:skipped',
      result: 'already-ghosted',
      durationMs: Date.now() - start,
    });
    return;
  }

  if (!isDryRun()) {
    // Move to Ghosted stage
    await stageBot(opportunityId, { stage: ghostedStage });

    // Apply ghosted tag
    const ghostedTag = playbook?.tags?.ghosted ?? 'Ghosted';
    await tagBot(contactId, { tag: ghostedTag });

    // Check off Lead IQ task
    const leadIqTask = playbook?.tasks?.leadIq ?? 'Lead IQ';
    await taskBot(contactId, { action: 'complete', taskName: leadIqTask });
  }

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: 'ghosted:processed',
    result: 'success',
    meta: { dayOffset: event.dayOffset },
    durationMs: Date.now() - start,
    dryRun: isDryRun(),
  });
}
