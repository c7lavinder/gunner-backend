/**
 * Appointment Reminder Poller
 *
 * Polls: every 15 minutes
 * Does: checks for due reminders, fires AI-written SMS for each stage.
 * Idempotent: tracks sent reminders, skips cancelled appointments.
 */

import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { smsBot, contactBot } from '../bots';
import { getAllPendingSchedules, ReminderSchedule } from './apt-prep';
import { getFieldName } from '../config';

const AGENT_ID = 'apt-reminder-poller';

type ReminderStage = 'confirm' | '24h' | '2h';

// Tracks which reminders have been sent: `${appointmentId}:${stage}`
const sentReminders = new Set<string>();

function reminderKey(aptId: string, stage: ReminderStage): string {
  return `${aptId}:${stage}`;
}

/**
 * Generate reminder SMS based on stage.
 * TODO: wire to AI (Gemini) for personalized messages.
 */
function generateReminderSMS(stage: ReminderStage, aptTime: string, type: string): string {
  const time = new Date(aptTime).toLocaleString();
  switch (stage) {
    case 'confirm':
      return `Hey! Just confirming your ${type} is all set. Looking forward to seeing the property. Any questions before then?`;
    case '24h':
      return `Quick reminder — your ${type} is tomorrow at ${time}. We'll be there. See you then!`;
    case '2h':
      return `Almost time! Your ${type} is in about 2 hours. Heading your way soon. See you shortly.`;
  }
}

/**
 * Check a single schedule for due reminders.
 */
async function processSchedule(schedule: ReminderSchedule): Promise<void> {
  const now = Date.now();
  const { appointmentId, contactId } = schedule;

  const checks: Array<{ stage: ReminderStage; dueAt: string }> = [
    { stage: 'confirm', dueAt: schedule.confirmAt },
    { stage: '24h', dueAt: schedule.remind24h },
    { stage: '2h', dueAt: schedule.remind2h },
  ];

  for (const { stage, dueAt } of checks) {
    const key = reminderKey(appointmentId, stage);

    // Guard: already sent
    if (sentReminders.has(key)) continue;

    // Guard: not yet due
    if (now < new Date(dueAt).getTime()) continue;

    // Guard: don't send if due time was more than 30 min ago (stale)
    if (now - new Date(dueAt).getTime() > 30 * 60 * 1000) {
      sentReminders.add(key); // mark as handled to avoid retrying
      auditLog({
        agent: AGENT_ID,
        contactId,
        action: `reminder:${stage}:stale`,
        result: 'skipped',
        reason: 'Reminder window expired (>30min past due)',
      });
      continue;
    }

    // Fetch contact to determine appointment type
    const contact = await contactBot(contactId) as Record<string, any>;
    const [fAptType, fAptTime] = await Promise.all([
      getFieldName(schedule.tenantId, 'active_appointment_type'),
      getFieldName(schedule.tenantId, 'active_appointment_time'),
    ]);
    const aptType = contact.customFields?.[fAptType] || 'appointment';
    const aptTime = contact.customFields?.[fAptTime] || dueAt;

    const message = generateReminderSMS(stage, aptTime, aptType);

    // Send via smsBot (handles DRY_RUN)
    await smsBot(contactId, message);

    // Mark sent
    sentReminders.add(key);

    auditLog({
      agent: AGENT_ID,
      contactId,
      action: `reminder:${stage}:sent`,
      result: 'success',
      metadata: { appointmentId, stage, aptType },
    });
  }
}

/**
 * Main poller entry — called by scheduler every 15 minutes.
 */
export async function runAptReminderPoller(): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const start = Date.now();
  const schedules = getAllPendingSchedules();

  let processed = 0;
  for (const schedule of schedules) {
    await processSchedule(schedule);
    processed++;
  }

  auditLog({
    agent: AGENT_ID,
    contactId: '*',
    action: 'poll:complete',
    result: 'success',
    durationMs: Date.now() - start,
    metadata: { schedulesChecked: processed },
  });
}
