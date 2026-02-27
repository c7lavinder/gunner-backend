/**
 * Bucket Re-Evaluation Agent — pure orchestration.
 * Fires on: call outcome "not-right-now"
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { stageBot } from '../bots/stage';
import { noteBot } from '../bots/note';
import { loadPlaybook, getStageId } from '../config';
import { classifierBot } from '../bots/classifier';
import { templateBot } from '../bots/template';
import { guardBot } from '../bots/guard';

const AGENT_ID = 'bucket-reeval';

interface NrtEvent extends GunnerEvent {
  transcript?: string;
  outcome: string;
  currentStage?: string;
}

export async function runBucketReeval(event: NrtEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  try {
    const { contactId, opportunityId, tenantId } = event;
    const start = Date.now();
    const playbook = await loadPlaybook(tenantId);

    const text = event.transcript ?? event.message ?? '';
    const bucket = classifierBot.determineBucket(text, playbook);

    const bucketStageMap = {
      '1-month': await getStageId(tenantId, 'sales', 'follow_up_1mo'),
      '4-month': await getStageId(tenantId, 'sales', 'follow_up_4mo'),
      '1-year': await getStageId(tenantId, 'sales', 'follow_up_1yr'),
    };

    const targetStage = bucketStageMap[bucket];

    if (guardBot.isAlreadyInStage(event.currentStage, targetStage)) {
      auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'bucket:skipped', result: 'skipped', durationMs: Date.now() - start });
      return;
    }

    if (!isDryRun() && targetStage && opportunityId) {
      await stageBot(opportunityId, targetStage).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'stageBot:failed', result: 'error', reason: err?.message });
      });
      await noteBot(contactId, templateBot.buildNote('bucket:reeval', { bucket })).catch(err => {
        auditLog({ agent: AGENT_ID, contactId, action: 'noteBot:failed', result: 'error', reason: err?.message });
      });
    }

    auditLog({ agent: AGENT_ID, contactId, opportunityId, action: `bucket:${bucket}`, result: 'success', metadata: { bucket, callId: event.callId }, durationMs: Date.now() - start });
  } catch (err: any) {
    auditLog({ agent: AGENT_ID, contactId: event.contactId, action: 'agent:crashed', result: 'error', reason: err?.message });
  }
}
