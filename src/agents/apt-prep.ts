/**
 * Appointment Prep — pure orchestration.
 * Fires on: appointment confirmed
 */

import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { taskBot, noteBot, fieldBot } from '../bots';
import { getFieldName } from '../config';
import { schedulerBot, ReminderSchedule } from '../bots/scheduler';
import { templateBot } from '../bots/template';

const AGENT_ID = 'apt-prep';

export interface AppointmentEvent {
  tenantId: string;
  contactId: string;
  appointmentId: string;
  appointmentTime: string;
  type: 'walkthrough' | 'offer-call';
  cancelled?: boolean;
}

const schedules: Map<string, ReminderSchedule> = new Map();

export function getSchedule(appointmentId: string): ReminderSchedule | undefined {
  return schedules.get(appointmentId);
}

export function getAllPendingSchedules(): ReminderSchedule[] {
  return [...schedules.values()].filter((s) => !s.cancelled);
}

export async function runAptPrep(event: AppointmentEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const start = Date.now();
  const { contactId, appointmentId, appointmentTime, type, cancelled } = event;

  if (cancelled) {
    const existing = schedules.get(appointmentId);
    if (existing) {
      existing.cancelled = true;
      schedules.set(appointmentId, existing);
    }

    await taskBot(contactId, {
      title: `${type} CANCELLED — reschedule ASAP`,
      body: `Appointment ${appointmentId} was cancelled. Contact seller to reschedule.`,
      dueDate: schedulerBot.dueInHours(2),
      assignedTo: 'am',
    });

    await noteBot(contactId, templateBot.buildNote('apt:cancelled', { type }));
    auditLog({ agent: AGENT_ID, contactId, action: 'apt:cancelled', result: 'success', durationMs: Date.now() - start, metadata: { appointmentId, type } });
    return;
  }

  if (schedules.has(appointmentId)) {
    auditLog({ agent: AGENT_ID, contactId, action: 'apt:prep:skipped', result: 'skipped', reason: 'Prep already exists for this appointment' });
    return;
  }

  const aptTime = new Date(appointmentTime);

  await taskBot(contactId, {
    title: `Prep for ${type} — ${aptTime.toLocaleDateString()}`,
    body: `${type} at ${aptTime.toLocaleTimeString()}. Review comps, motivation, timeline. Be ready.`,
    dueDate: new Date(aptTime.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    assignedTo: 'am',
  });

  const schedule = schedulerBot.buildReminderSchedule(event.tenantId, contactId, appointmentId, aptTime, new Date());
  schedules.set(appointmentId, schedule);

  const [fAptId, fAptTime, fAptType] = await Promise.all([
    getFieldName(event.tenantId, 'active_appointment_id'),
    getFieldName(event.tenantId, 'active_appointment_time'),
    getFieldName(event.tenantId, 'active_appointment_type'),
  ]);

  await fieldBot(contactId, { [fAptId]: appointmentId, [fAptTime]: appointmentTime, [fAptType]: type });
  await noteBot(contactId, templateBot.buildNote('apt:prep', { type, appointmentTime: aptTime.toLocaleString() }));

  auditLog({ agent: AGENT_ID, contactId, action: 'apt:prep:created', result: 'success', durationMs: Date.now() - start, metadata: { appointmentId, type, appointmentTime, schedule } });
}
