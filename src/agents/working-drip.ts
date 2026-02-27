/**
 * Working Drip Agent
 *
 * Fires on: drip.tick (scheduler) or lead.new
 * Does: 104-day / 24-step automated SMS sequence with decreasing frequency
 * Does NOT: touch CRM directly — uses smsBot, emits events
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { smsBot } from '../bots/sms';
import { getDripSchedule, getSendWindow, getTag, loadPlaybook } from '../config';

const AGENT_ID = 'working-drip';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface DripEvent extends GunnerEvent {
  dripStartDate: string;
  lastRealContact?: string;
  currentStep?: number;
  currentStage?: string;
}

export async function runWorkingDrip(event: DripEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, tenantId, currentStage } = event;
  const start = Date.now();

  const [{ days: schedule, ghostedDay }, sendWindow, workingTag, ghostedTag, pb] = await Promise.all([
    getDripSchedule(tenantId),
    getSendWindow(tenantId),
    getTag(tenantId, 'working'),
    getTag(tenantId, 'ghosted'),
    loadPlaybook(tenantId),
  ]);

  // Guard: stop on stage change to non-working stage
  const workingStages = [workingTag, ghostedTag];
  if (currentStage && !workingStages.includes(currentStage)) {
    auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'drip:stopped', result: 'skipped', metadata: { reason: `stage-changed:${currentStage}` }, durationMs: Date.now() - start });
    return;
  }

  // Guard: stop on real conversation
  if (event.lastRealContact) {
    const lastContact = new Date(event.lastRealContact);
    const dripStart = new Date(event.dripStartDate);
    if (lastContact > dripStart) {
      auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'drip:stopped', result: 'skipped', metadata: { reason: 'real-conversation' }, durationMs: Date.now() - start });
      return;
    }
  }

  const now = new Date();

  // Guard: skip configured days
  if (sendWindow.skipDays.includes(DAY_NAMES[now.getDay()])) {
    auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'drip:skipped', result: 'skipped', metadata: { reason: 'skip-day' }, durationMs: Date.now() - start });
    return;
  }

  // Guard: respect send window
  const startHour = parseInt(sendWindow.start.split(':')[0], 10);
  const endHour = parseInt(sendWindow.end.split(':')[0], 10);
  const hour = now.getHours();
  if (hour < startHour || hour >= endHour) {
    auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'drip:skipped', result: 'skipped', metadata: { reason: 'outside-send-window' }, durationMs: Date.now() - start });
    return;
  }

  // Calculate current day offset
  const dripStart = new Date(event.dripStartDate);
  const dayOffset = Math.floor((now.getTime() - dripStart.getTime()) / (1000 * 60 * 60 * 24));

  // Find the current step
  const stepIndex = schedule.indexOf(dayOffset);
  if (stepIndex === -1) return;

  // Idempotency: check if this step was already sent
  const currentStep = event.currentStep ?? -1;
  if (stepIndex <= currentStep) {
    auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'drip:skipped', result: 'skipped', metadata: { reason: `step-${stepIndex}-already-sent` }, durationMs: Date.now() - start });
    return;
  }

  // Ghosted check
  if (dayOffset >= ghostedDay && !event.lastRealContact) {
    await emit({ kind: 'lead.ghosted', tenantId, contactId, opportunityId, metadata: { dayOffset } });
  }

  // Get template for this step
  const templates = pb?.drip?.templates ?? [];
  const template = templates[stepIndex] ?? `Follow-up message (step ${stepIndex + 1} of ${schedule.length})`;

  if (!isDryRun()) {
    await smsBot(contactId, template);
  }

  await emit({ kind: 'drip.step-sent', tenantId, contactId, opportunityId, metadata: { step: stepIndex, dayOffset } });

  auditLog({
    agent: AGENT_ID, contactId, opportunityId,
    action: `drip:step-${stepIndex}`,
    result: 'success',
    metadata: { dayOffset, step: stepIndex, totalSteps: schedule.length },
    durationMs: Date.now() - start,
  });
}
