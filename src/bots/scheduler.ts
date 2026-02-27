/**
 * Scheduler Bot — ALL time/scheduling logic.
 * Toggle: bot-scheduler
 */

import { isEnabled } from '../core/toggles';

const BOT_ID = 'bot-scheduler';

export interface ReminderSchedule {
  tenantId: string;
  appointmentId: string;
  contactId: string;
  confirmAt: string;
  remind24h: string;
  remind2h: string;
  cancelled: boolean;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function isInSendWindow(sendWindow: { start: string; end: string }): boolean {
  if (!isEnabled(BOT_ID)) return false;
  const startHour = parseInt(sendWindow.start.split(':')[0], 10);
  const endHour = parseInt(sendWindow.end.split(':')[0], 10);
  const hour = new Date().getHours();
  return hour >= startHour && hour < endHour;
}

export function isSkipDay(skipDays: string[]): boolean {
  if (!isEnabled(BOT_ID)) return false;
  return skipDays.includes(DAY_NAMES[new Date().getDay()]);
}

export function calculateDripStep(
  dripStartDate: string,
  schedule: number[],
): { dayOffset: number; stepIndex: number } | null {
  if (!isEnabled(BOT_ID)) return null;

  const now = new Date();
  const dripStart = new Date(dripStartDate);
  const dayOffset = Math.floor((now.getTime() - dripStart.getTime()) / (1000 * 60 * 60 * 24));
  const stepIndex = schedule.indexOf(dayOffset);
  if (stepIndex === -1) return null;
  return { dayOffset, stepIndex };
}

export function buildReminderSchedule(
  tenantId: string,
  contactId: string,
  appointmentId: string,
  appointmentTime: Date,
  bookedAt: Date,
): ReminderSchedule {
  // Works even if toggle is off — pure computation
  return {
    tenantId,
    appointmentId,
    contactId,
    confirmAt: new Date(bookedAt.getTime() + 18 * 60 * 1000).toISOString(),
    remind24h: new Date(appointmentTime.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    remind2h: new Date(appointmentTime.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    cancelled: false,
  };
}

export function isDue(dueAt: string | number, windowMs: number = 60_000): boolean {
  const due = typeof dueAt === 'string' ? new Date(dueAt).getTime() : dueAt;
  const now = Date.now();
  return now >= due && now < due + windowMs;
}

export function isStale(dueAt: string | number, windowMs: number = 60_000): boolean {
  const due = typeof dueAt === 'string' ? new Date(dueAt).getTime() : dueAt;
  return Date.now() >= due + windowMs;
}

export function getRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function dueIn(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export function dueInHours(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60_000).toISOString();
}

// ─── Time-of-day tone ───

export type TimeTone = 'morning' | 'afternoon' | 'evening' | 'overnight';

export function getTimeTone(localHour: number): TimeTone {
  if (localHour >= 6 && localHour < 12) return 'morning';
  if (localHour >= 12 && localHour < 17) return 'afternoon';
  if (localHour >= 17 && localHour < 21) return 'evening';
  return 'overnight';
}

export function getLeadLocalHour(contact: Record<string, unknown>): number {
  const tz = (contact.timezone as string) || (contact.timeZone as string) || null;
  if (tz) {
    try {
      const localTime = new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false });
      return parseInt(localTime, 10);
    } catch { /* fall through */ }
  }
  return new Date().getHours();
}

export function isInLeadSendWindow(localHour: number, playbook: any): boolean {
  const sw = playbook.communication?.send_window ?? { start: '09:00', end: '18:00' };
  const startHour = parseInt(sw.start.split(':')[0], 10);
  const endHour = parseInt(sw.end.split(':')[0], 10);
  return localHour >= startHour && localHour < endHour;
}

export const schedulerBot = {
  isInSendWindow,
  isSkipDay,
  calculateDripStep,
  buildReminderSchedule,
  isDue,
  isStale,
  getRelativeTime,
  dueIn,
  dueInHours,
  getTimeTone,
  getLeadLocalHour,
  isInLeadSendWindow,
};
