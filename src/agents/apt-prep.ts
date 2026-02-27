/**
 * Appointment Prep
 *
 * Fires on: appointment confirmed (walkthrough or offer call)
 * Does: creates AM prep task (2h before), stores reminder schedule, handles cancellation.
 */

import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { taskBot, noteBot, fieldBot } from '../bots';
import { getFieldName } from '../config';

const AGENT_ID = 'apt-prep';

export interface AppointmentEvent {
  tenantId: string;
  contactId: string;
  appointmentId: string;
  appointmentTime: string;
  type: 'walkthrough' | 'offer-call';
  cancelled?: boolean;
}

export interface ReminderSchedule {
  tenantId: string;
  appointmentId: string;
  contactId: string;
  confirmAt: string;
  remind24h: string;
  remind2h: string;
  cancelled: boolean;
}

function buildSchedule(tenantId: string, contactId: string, aptId: string, aptTime: Date, bookedAt: Date): ReminderSchedule {
  return {
    tenantId,
    appointmentId: aptId,
    contactId,
    confirmAt: new Date(bookedAt.getTime() + 18 * 60 * 1000).toISOString(),
    remind24h: new Date(aptTime.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    remind2h: new Date(aptTime.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    cancelled: false,
  };
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
      dueDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      assignedTo: 'am',
    });

    await noteBot(contactId, `📅 ${type} cancelled. Reminders marked cancelled. Reschedule task created.`);

    auditLog({
      agent: AGENT_ID,
      contactId,
      action: 'apt:cancelled',
      result: 'success',
      durationMs: Date.now() - start,
      metadata: { appointmentId, type },
    });
    return;
  }

  if (schedules.has(appointmentId)) {
    auditLog({
      agent: AGENT_ID,
      contactId,
      action: 'apt:prep:skipped',
      result: 'skipped',
      reason: 'Prep already exists for this appointment',
    });
    return;
  }

  const aptTime = new Date(appointmentTime);
  const now = new Date();

  const prepDue = new Date(aptTime.getTime() - 2 * 60 * 60 * 1000);
  await taskBot(contactId, {
    title: `Prep for ${type} — ${aptTime.toLocaleDateString()}`,
    body: `${type} at ${aptTime.toLocaleTimeString()}. Review comps, motivation, timeline. Be ready.`,
    dueDate: prepDue.toISOString(),
    assignedTo: 'am',
  });

  const schedule = buildSchedule(event.tenantId, contactId, appointmentId, aptTime, now);
  schedules.set(appointmentId, schedule);

  const [fAptId, fAptTime, fAptType] = await Promise.all([
    getFieldName(event.tenantId, 'active_appointment_id'),
    getFieldName(event.tenantId, 'active_appointment_time'),
    getFieldName(event.tenantId, 'active_appointment_type'),
  ]);

  await fieldBot(contactId, {
    [fAptId]: appointmentId,
    [fAptTime]: appointmentTime,
    [fAptType]: type,
  });

  await noteBot(contactId, [
    `📅 ${type} confirmed for ${aptTime.toLocaleString()}.`,
    `Prep task created (due 2h before).`,
    `Reminders: +18min confirm, -24h, -2h.`,
  ].join('\n'));

  auditLog({
    agent: AGENT_ID,
    contactId,
    action: 'apt:prep:created',
    result: 'success',
    durationMs: Date.now() - start,
    metadata: { appointmentId, type, appointmentTime, schedule },
  });
}
