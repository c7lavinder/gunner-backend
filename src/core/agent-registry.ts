/**
 * Agent Registry — maps agent name → handler function.
 * This is the ONLY place agent names are bound to code.
 * Triggers.ts references agents by name string only.
 */

import { GunnerEvent } from './event-bus';

type AgentHandler = (event: GunnerEvent) => Promise<void>;

const registry: Map<string, AgentHandler> = new Map();

export function registerAgent(name: string, handler: AgentHandler) {
  registry.set(name, handler);
}

export function getAgent(name: string): AgentHandler | undefined {
  return registry.get(name);
}

export function registeredAgents(): string[] {
  return [...registry.keys()];
}
