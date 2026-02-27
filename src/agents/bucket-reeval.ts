/**
 * Bucket Re-Evaluation Agent
 *
 * Fires on: call outcome "not-right-now" (via lm-assistant)
 * Does: reads transcript, decides follow-up bucket (1-month, 4-month, 1-year)
 * Does NOT: touch CRM directly — uses bots
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { stageBot } from '../bots/stage';
import { noteBot } from '../bots/note';
import { loadPlaybook, getStageId } from '../config';

const AGENT_ID = 'bucket-reeval';

type Bucket = '1-month' | '4-month' | '1-year';

interface NrtEvent extends GunnerEvent {
  transcript?: string;
  outcome: string;
  currentStage?: string;
}

export async function runBucketReeval(event: NrtEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, tenantId } = event;
  const start = Date.now();
  const playbook = await loadPlaybook(tenantId);

  const text = event.transcript ?? event.message ?? '';
  const bucket = determineBucket(text, playbook);

  // Map bucket to CRM stage via playbook
  const bucketStageMap: Record<Bucket, string | null> = {
    '1-month': await getStageId(tenantId, 'sales', 'follow_up_1mo'),
    '4-month': await getStageId(tenantId, 'sales', 'follow_up_4mo'),
    '1-year': await getStageId(tenantId, 'sales', 'follow_up_1yr'),
  };

  const targetStage = bucketStageMap[bucket];

  // Guard: already in this bucket
  if (event.currentStage && event.currentStage === targetStage) {
    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'bucket:skipped',
      result: 'skipped',
      durationMs: Date.now() - start,
    });
    return;
  }

  if (!isDryRun() && targetStage && opportunityId) {
    await stageBot(opportunityId, targetStage);
    await noteBot(contactId, `📋 Bucket re-eval: "not right now" → ${bucket} follow-up.`);
  }

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: `bucket:${bucket}`,
    result: 'success',
    metadata: { bucket, callId: event.callId },
    durationMs: Date.now() - start,
  });
}

function determineBucket(text: string, playbook: any): Bucket {
  const lower = text.toLowerCase();

  const shortTermPatterns = playbook?.buckets?.shortTerm ?? [
    'few weeks', 'next month', 'couple weeks', 'soon', 'thinking about it',
    'after the holidays', 'end of the month',
  ];
  if (shortTermPatterns.some((p: string) => lower.includes(p))) return '1-month';

  const midTermPatterns = playbook?.buckets?.midTerm ?? [
    'few months', 'spring', 'summer', 'fall', 'winter', 'next quarter',
    'after tax season', 'not sure when',
  ];
  if (midTermPatterns.some((p: string) => lower.includes(p))) return '4-month';

  return '4-month';
}
