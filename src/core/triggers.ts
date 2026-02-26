/**
 * Triggers — wires events to agents via the playbook.
 * Agents don't know their triggers. This file does.
 * To add a trigger: add an entry in playbook/triggers.ts. Zero other files change.
 */

import { on, GunnerEvent, EventKind } from './event-bus';
import { getAgent } from './agent-registry';
import { isEnabled } from './toggles';
import { getTriggers, TriggerConfig } from '../playbook/triggers';

export function wireTriggers() {
  const triggers = getTriggers();

  for (const trigger of triggers) {
    on(trigger.event as EventKind, async (event: GunnerEvent) => {
      // Check conditions defined in playbook
      if (trigger.condition && !trigger.condition(event)) return;

      // Check toggle
      if (!isEnabled(trigger.agentId)) return;

      // Find and run the agent
      const handler = getAgent(trigger.agentId);
      if (!handler) {
        console.warn(`[triggers] no handler registered for agent: ${trigger.agentId}`);
        return;
      }

      try {
        await handler(event);
      } catch (err) {
        console.error(`[triggers] agent ${trigger.agentId} threw:`, err);
      }
    });
  }

  console.log(`[triggers] wired ${triggers.length} triggers`);
}
