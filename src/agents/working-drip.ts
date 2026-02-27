/**
 * Working Drip Agent
 *
 * Fires on: drip.tick (scheduler) or lead.new
 * Does: 104-day / 24-step automated SMS sequence with decreasing frequency
 * Does NOT: touch CRM directly — uses smsBot, emits events
 *
 * Rules:
 *   - Respects send windows (playbook.sms.sendWindow)
 *   - Skips Sundays
 *   - Stops on real conversation or stage change
 *   - Day 14 no contact → fires Ghosted Agent
 */

import { GunnerEvent, emit } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { isDryRun } from '../core/dry-run';
import { smsBot } from '../bots/sms';
import { getPlaybook } from '../core/playbook';

const AGENT_ID = 'working-drip';

interface DripEvent extends GunnerEvent {
  dripStartDate: string; // ISO date drip began
  lastRealContact?: string; // ISO date of last real conversation
  currentStep?: number;
  currentStage?: string;
}

// Default 24-step schedule: day offsets from drip start
const DEFAULT_SCHEDULE = [
  1, 2, 3, 4, 5, 7, 9, 11, 14, 17,
  21, 25, 30, 37, 44, 51, 58, 65, 72, 80,
  88, 96, 100, 104,
];

export async function runWorkingDrip(event: DripEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, tenantId, currentStage } = event;
  const start = Date.now();
  const playbook = getPlaybook(tenantId);
  const schedule = playbook?.drip?.schedule ?? DEFAULT_SCHEDULE;

  // Guard: stop on stage change to non-working stage
  const workingStages = playbook?.stages?.working ?? ['Working', 'Ghosted'];
  if (currentStage && !workingStages.includes(currentStage)) {
    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'drip:stopped',
      result: `stage-changed:${currentStage}`,
      durationMs: Date.now() - start,
    });
    return;
  }

  // Guard: stop on real conversation
  if (event.lastRealContact) {
    const lastContact = new Date(event.lastRealContact);
    const dripStart = new Date(event.dripStartDate);
    if (lastContact > dripStart) {
      auditLog({
        agent: AGENT_ID,
        contactId,
        opportunityId,
        action: 'drip:stopped',
        result: 'real-conversation',
        durationMs: Date.now() - start,
      });
      return;
    }
  }

  const now = new Date();

  // Guard: skip Sundays
  if (now.getDay() === 0) {
    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'drip:skipped',
      result: 'sunday',
      durationMs: Date.now() - start,
    });
    return;
  }

  // Guard: respect send window
  const sendWindow = playbook?.sms?.sendWindow ?? { startHour: 9, endHour: 19 };
  const hour = now.getHours();
  if (hour < sendWindow.startHour || hour >= sendWindow.endHour) {
    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'drip:skipped',
      result: 'outside-send-window',
      durationMs: Date.now() - start,
    });
    return;
  }

  // Calculate current day offset
  const dripStart = new Date(event.dripStartDate);
  const dayOffset = Math.floor((now.getTime() - dripStart.getTime()) / (1000 * 60 * 60 * 24));

  // Find the current step
  const stepIndex = schedule.indexOf(dayOffset);
  if (stepIndex === -1) {
    // Not a scheduled send day
    return;
  }

  // Idempotency: check if this step was already sent
  const currentStep = event.currentStep ?? -1;
  if (stepIndex <= currentStep) {
    auditLog({
      agent: AGENT_ID,
      contactId,
      opportunityId,
      action: 'drip:skipped',
      result: `step-${stepIndex}-already-sent`,
      durationMs: Date.now() - start,
    });
    return;
  }

  // Day 14 no contact check → fire Ghosted Agent
  if (dayOffset >= 14 && !event.lastRealContact) {
    await emit({
      kind: 'lead.ghosted',
      tenantId,
      contactId,
      opportunityId,
      dayOffset,
    });
  }

  // Get template for this step from playbook
  const templates = playbook?.drip?.templates ?? [];
  const template = templates[stepIndex] ?? `Follow-up message (step ${stepIndex + 1} of ${schedule.length})`;

  // Send SMS via bot
  if (!isDryRun()) {
    await smsBot(contactId, { body: template });
  }

  await emit({
    kind: 'drip.step-sent',
    tenantId,
    contactId,
    opportunityId,
    step: stepIndex,
    dayOffset,
  });

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: `drip:step-${stepIndex}`,
    result: 'sent',
    meta: { dayOffset, step: stepIndex, totalSteps: schedule.length },
    durationMs: Date.now() - start,
    dryRun: isDryRun(),
  });
}
