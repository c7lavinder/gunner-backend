/**
 * Follow-Up Organizer
 *
 * Polls: every 6 hours
 * Does: scans 1-month, 4-month, 1-year follow-up stages for contacts due a touch.
 * Calls: follow-up-messenger for each due contact.
 * Advances: contacts through buckets when touch cadence completed.
 */

import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { contactBot, stageBot } from '../bots';
import { runFollowUpMessenger } from './follow-up-messenger';

const AGENT_ID = 'follow-up-organizer';

interface FollowUpBucket {
  stageId: string;
  name: string;
  cadenceDays: number;
  nextBucketStageId: string | null;
}

interface PlaybookConfig {
  buckets: FollowUpBucket[];
  touchField: string; // custom field that stores last touch timestamp
}

/**
 * Main poller entry — called by scheduler every 6 hours.
 */
export async function runFollowUpOrganizer(
  tenantId: string,
  playbook: PlaybookConfig
): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const start = Date.now();

  for (const bucket of playbook.buckets) {
    await processBucket(tenantId, bucket, playbook.touchField);
  }

  auditLog({
    agent: AGENT_ID,
    contactId: '*',
    action: 'poll:complete',
    result: 'success',
    durationMs: Date.now() - start,
    metadata: { bucketCount: playbook.buckets.length },
  });
}

async function processBucket(
  tenantId: string,
  bucket: FollowUpBucket,
  touchField: string
): Promise<void> {
  // contactBot fetches contacts in a given stage
  const contacts = (await contactBot.listByStage(bucket.stageId)) as Array<{
    id: string;
    customFields: Record<string, string>;
  }>;

  const now = Date.now();

  for (const contact of contacts) {
    const lastTouch = Number(contact.customFields?.[touchField] || 0);
    const daysSinceTouch = (now - lastTouch) / (1000 * 60 * 60 * 24);

    // Guard: not yet due
    if (lastTouch > 0 && daysSinceTouch < bucket.cadenceDays) continue;

    // Determine if contact has exhausted touches in this bucket
    const touchCount = Number(contact.customFields?.['fu_touch_count'] || 0);
    const maxTouches = Math.ceil(bucket.cadenceDays / 7); // ~1 touch per week within cadence

    if (touchCount >= maxTouches && bucket.nextBucketStageId) {
      // Advance to next bucket
      await stageBot(contact.id, bucket.nextBucketStageId);
      auditLog({
        agent: AGENT_ID,
        contactId: contact.id,
        action: 'bucket:advanced',
        result: 'success',
        metadata: { from: bucket.name, toStageId: bucket.nextBucketStageId },
      });
      continue;
    }

    // Due for a touch — fire messenger
    await runFollowUpMessenger({
      tenantId,
      contactId: contact.id,
      bucketName: bucket.name,
      touchNumber: touchCount + 1,
      daysSinceLastTouch: Math.floor(daysSinceTouch),
    });

    auditLog({
      agent: AGENT_ID,
      contactId: contact.id,
      action: 'touch:dispatched',
      result: 'success',
      metadata: { bucket: bucket.name, touchNumber: touchCount + 1 },
    });
  }
}
