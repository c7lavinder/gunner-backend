/**
 * Appointment Prep
 *
 * Fires on: appointment confirmed (walkthrough or offer call)
 * Does: creates AM prep task (2h before), stores reminder schedule, handles cancellation.
 */

import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { taskBot, noteBot, fieldBot } from '../bots';

const AGENT_ID = 'apt-prep';

export interface AppointmentEvent {
  tenantId: string;
  contactId: string;
  appointmentId: string;
  appointmentTime: string; // ISO
  type: 'walkthrough' | 'offer-call';
  cancelled?: boolean;
}

export interface ReminderSchedule {
  appointmentId: string;
  contactId: string;
  confirmAt: string;   // +18 min after booking
  remind24h: string;   // -24h before apt
  remind2h: string;    // -2h before apt
  cancelled: boolean;
}

/**
 * Build reminder timestamps from appointment time and booking time.
 */
function buildSchedule(contactId: string, aptId: string, aptTime: Date, bookedAt: Date): ReminderSchedule {
  return {
    appointmentId: aptId,
    contactId,
    confirmAt: new Date(bookedAt.getTime() + 18 * 60 * 1000).toISOString(),
    remind24h: new Date(aptTime.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    remind2h: new Date(aptTime.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    cancelled: false,
  };
}

// In-memory store — replace with DB in production
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

  // --- CANCELLATION FLOW ---
  if (cancelled) {
    const existing = schedules.get(appointmentId);
    if (existing) {
      existing.cancelled = true;
      schedules.set(appointmentId, existing);
    }

    // Create reschedule task
    await taskBot(contactId, {
      title: `${type} CANCELLED — reschedule ASAP`,
      description: `Appointment ${appointmentId} was cancelled. Contact seller to reschedule.`,
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

  // --- CONFIRMATION FLOW ---

  // Guard: idempotency — don't create duplicate prep for same appointment
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

  // 1. Create AM prep task (due 2h before appointment)
  const prepDue = new Date(aptTime.getTime() - 2 * 60 * 60 * 1000);
  await taskBot(contactId, {
    title: `Prep for ${type} — ${aptTime.toLocaleDateString()}`,
    description: `${type} at ${aptTime.toLocaleTimeString()}. Review comps, motivation, timeline. Be ready.`,
    dueDate: prepDue.toISOString(),
    assignedTo: 'am',
  });

  // 2. Store reminder schedule
  const schedule = buildSchedule(contactId, appointmentId, aptTime, now);
  schedules.set(appointmentId, schedule);

  // 3. Store apt ID on contact for cross-reference
  await fieldBot(contactId, {
    active_appointment_id: appointmentId,
    active_appointment_time: appointmentTime,
    active_appointment_type: type,
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
