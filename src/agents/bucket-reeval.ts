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
import { getPlaybook } from '../core/playbook';

const AGENT_ID = 'bucket-reeval';

type Bucket = '1-month' | '4-month' | '1-year';

interface NrtEvent extends GunnerEvent {
  callId?: string;
  transcript?: string;
  message?: string;
  outcome: string;
}

export async function runBucketReeval(event: NrtEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, tenantId } = event;
  const start = Date.now();
  const playbook = getPlaybook(tenantId);

  const text = event.transcript ?? event.message ?? '';
  const bucket = determineBucket(text, playbook);

  // Map bucket to CRM stage
  const bucketStageMap: Record<Bucket, string> = {
    '1-month': playbook?.stages?.followUp1Mo ?? 'Follow Up 1 Month',
    '4-month': playbook?.stages?.followUp4Mo ?? 'Follow Up 4 Month',
    '1-year': playbook?.stages?.followUp1Yr ?? 'Follow Up 1 Year',
  };

  const targetStage = bucketStageMap[bucket];

  // Guard: already in this bucket
  if (event.currentStage === targetStage) {
    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'bucket:skipped',
      result: `already-in-${bucket}`,
      durationMs: Date.now() - start,
    });
    return;
  }

  if (!isDryRun()) {
    await stageBot(opportunityId, { stage: targetStage });
    await noteBot(contactId, {
      body: `📋 Bucket re-eval: "not right now" → ${bucket} follow-up. Stage: ${targetStage}`,
    });
  }

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: `bucket:${bucket}`,
    result: targetStage,
    meta: { bucket, callId: event.callId },
    durationMs: Date.now() - start,
    dryRun: isDryRun(),
  });
}

function determineBucket(text: string, playbook: any): Bucket {
  const lower = text.toLowerCase();

  // Short-term indicators → 1 month
  const shortTermPatterns = playbook?.buckets?.shortTerm ?? [
    'few weeks', 'next month', 'couple weeks', 'soon', 'thinking about it',
    'after the holidays', 'end of the month',
  ];
  if (shortTermPatterns.some((p: string) => lower.includes(p))) return '1-month';

  // Mid-term indicators → 4 months
  const midTermPatterns = playbook?.buckets?.midTerm ?? [
    'few months', 'spring', 'summer', 'fall', 'winter', 'next quarter',
    'after tax season', 'not sure when',
  ];
  if (midTermPatterns.some((p: string) => lower.includes(p))) return '4-month';

  // Long-term / vague → 1 year
  const longTermPatterns = playbook?.buckets?.longTerm ?? [
    'next year', 'long time', 'no plans', 'not anytime soon', 'maybe someday',
  ];
  if (longTermPatterns.some((p: string) => lower.includes(p))) return '1-year';

  // Default: 4-month (middle ground)
  return '4-month';
}
