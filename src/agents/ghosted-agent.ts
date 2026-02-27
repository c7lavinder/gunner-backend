/**
 * Ghosted Agent
 *
 * Fires on: lead.ghosted (Day 14 with no real conversation)
 * Does: moves to Ghosted stage, applies tag
 * Does NOT: stop the drip — drip keeps running
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { stageBot } from '../bots/stage';
import { tagBot } from '../bots/tag';
import { getStageId, getTag } from '../config';

const AGENT_ID = 'ghosted-agent';

interface GhostedEvent extends GunnerEvent {
  dayOffset?: number;
  currentStage?: string;
}

export async function runGhostedAgent(event: GhostedEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  try {
    const { contactId, opportunityId, tenantId } = event;
    const start = Date.now();

    const ghostedStage = await getStageId(tenantId, 'sales', 'ghosted') ?? 'Ghosted';

    if (event.currentStage === ghostedStage) {
      auditLog({
        agent: AGENT_ID,
        contactId,
        opportunityId,
        action: 'ghosted:skipped',
        result: 'skipped',
        durationMs: Date.now() - start,
      });
      return;
    }

    if (!isDryRun() && opportunityId) {
      await stageBot(opportunityId, ghostedStage).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'stageBot:failed', result: 'error', reason: err?.message });
      });

      const ghostedTag = await getTag(tenantId, 'ghosted');
      await tagBot(contactId, [ghostedTag]).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'tagBot:failed', result: 'error', reason: err?.message });
      });
    }

    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'ghosted:processed',
      result: 'success',
      metadata: { dayOffset: event.dayOffset },
      durationMs: Date.now() - start,
    });
  } catch (err: any) {
    auditLog({ agent: AGENT_ID, contactId: event.contactId, action: 'agent:crashed', result: 'error', reason: err?.message });
  }
}
