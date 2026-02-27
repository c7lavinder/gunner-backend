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
import { stageBot } from '../bots';
import { searchBot } from '../bots/contact-search';
import { runFollowUpMessenger } from './follow-up-messenger';
import { getFieldName } from '../config';

const AGENT_ID = 'follow-up-organizer';

interface FollowUpBucket {
  stageId: string;
  name: string;
  cadenceDays: number;
  nextBucketStageId: string | null;
}

interface PlaybookConfig {
  buckets: FollowUpBucket[];
  touchField: string;
}

/**
 * Main poller entry — called by scheduler every 6 hours.
 */
export async function runFollowUpOrganizer(
  tenantId: string,
  playbook: PlaybookConfig
): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  try {
    const start = Date.now();

    const touchField = await getFieldName(tenantId, playbook.touchField);

    for (const bucket of playbook.buckets) {
      await processBucket(tenantId, bucket, touchField).catch(err => {
        auditLog({ agent: AGENT_ID, contactId: '*', action: `processBucket:${bucket.name}:failed`, result: 'error', reason: err?.message });
      });
    }

    auditLog({
      agent: AGENT_ID,
      contactId: '*',
      action: 'poll:complete',
      result: 'success',
      durationMs: Date.now() - start,
      metadata: { bucketCount: playbook.buckets.length },
    });
  } catch (err: any) {
    auditLog({ agent: AGENT_ID, contactId: '*', action: 'agent:crashed', result: 'error', reason: err?.message });
  }
}

async function processBucket(
  tenantId: string,
  bucket: FollowUpBucket,
  touchField: string
): Promise<void> {
  const contacts = await searchBot.searchContacts('', { pipelineStageId: bucket.stageId }).catch(err => {
    auditLog({ agent: AGENT_ID, contactId: '*', action: 'searchBot:failed', result: 'error', reason: err?.message });
    return [] as Array<{ id: string; customFields: Record<string, string> }>;
  }) as Array<{
    id: string;
    customFields: Record<string, string>;
  }>;

  const now = Date.now();

  for (const contact of contacts) {
    const lastTouch = Number(contact.customFields?.[touchField] || 0);
    const daysSinceTouch = (now - lastTouch) / (1000 * 60 * 60 * 24);

    if (lastTouch > 0 && daysSinceTouch < bucket.cadenceDays) continue;

    const fTouchCount = await getFieldName(tenantId, 'fu_touch_count');
    const touchCount = Number(contact.customFields?.[fTouchCount] || 0);
    const maxTouches = Math.ceil(bucket.cadenceDays / 7);

    if (touchCount >= maxTouches && bucket.nextBucketStageId) {
      await stageBot(contact.id, bucket.nextBucketStageId).catch(err => {
        auditLog({ agent: AGENT_ID, contactId: contact.id, action: 'stageBot:failed', result: 'error', reason: err?.message });
      });
      auditLog({
        agent: AGENT_ID,
        contactId: contact.id,
        action: 'bucket:advanced',
        result: 'success',
        metadata: { from: bucket.name, toStageId: bucket.nextBucketStageId },
      });
      continue;
    }

    await runFollowUpMessenger({
      tenantId,
      contactId: contact.id,
      bucketName: bucket.name,
      touchNumber: touchCount + 1,
      daysSinceLastTouch: Math.floor(daysSinceTouch),
    }).catch(err => {
      auditLog({ agent: AGENT_ID, contactId: contact.id, action: 'runFollowUpMessenger:failed', result: 'error', reason: err?.message });
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
