/**
 * Working Drip Agent — pure orchestration.
 * Fires on: drip.tick or lead.new
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { smsBot } from '../bots/sms';
import { getDripSchedule, getSendWindow, getTag, loadPlaybook } from '../config';
import { schedulerBot } from '../bots/scheduler';

const AGENT_ID = 'working-drip';

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

  const workingStages = [workingTag, ghostedTag];
  if (currentStage && !workingStages.includes(currentStage)) {
    auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'drip:stopped', result: 'skipped', metadata: { reason: `stage-changed:${currentStage}` }, durationMs: Date.now() - start });
    return;
  }

  if (event.lastRealContact) {
    const lastContact = new Date(event.lastRealContact);
    const dripStart = new Date(event.dripStartDate);
    if (lastContact > dripStart) {
      auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'drip:stopped', result: 'skipped', metadata: { reason: 'real-conversation' }, durationMs: Date.now() - start });
      return;
    }
  }

  if (schedulerBot.isSkipDay(sendWindow.skipDays)) {
    auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'drip:skipped', result: 'skipped', metadata: { reason: 'skip-day' }, durationMs: Date.now() - start });
    return;
  }

  if (!schedulerBot.isInSendWindow(sendWindow)) {
    auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'drip:skipped', result: 'skipped', metadata: { reason: 'outside-send-window' }, durationMs: Date.now() - start });
    return;
  }

  const step = schedulerBot.calculateDripStep(event.dripStartDate, schedule);
  if (!step) return;

  const { dayOffset, stepIndex } = step;

  const currentStep = event.currentStep ?? -1;
  if (stepIndex <= currentStep) {
    auditLog({ agent: AGENT_ID, contactId, opportunityId, action: 'drip:skipped', result: 'skipped', metadata: { reason: `step-${stepIndex}-already-sent` }, durationMs: Date.now() - start });
    return;
  }

  if (dayOffset >= ghostedDay && !event.lastRealContact) {
    await emit({ kind: 'lead.ghosted', tenantId, contactId, opportunityId, metadata: { dayOffset } });
  }

  const templates = pb?.drip?.templates ?? [];
  const template = templates[stepIndex] ?? `Follow-up message (step ${stepIndex + 1} of ${schedule.length})`;

  if (!isDryRun()) {
    await smsBot(contactId, template);
  }

  await emit({ kind: 'drip.step-sent', tenantId, contactId, opportunityId, metadata: { step: stepIndex, dayOffset } });

  auditLog({ agent: AGENT_ID, contactId, opportunityId, action: `drip:step-${stepIndex}`, result: 'success', metadata: { dayOffset, step: stepIndex, totalSteps: schedule.length }, durationMs: Date.now() - start });
}
