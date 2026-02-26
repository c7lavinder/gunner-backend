/**
 * Toggle system — every agent and bot has a toggle.
 * Toggles are stored in memory (persisted to DB in future).
 * Control API reads/writes from here.
 */

export type ToggleKind = 'agent' | 'bot';

export interface Toggle {
  id: string;
  kind: ToggleKind;
  label: string;
  description: string;
  enabled: boolean;
}

const toggles: Map<string, Toggle> = new Map();

export function registerToggle(toggle: Toggle) {
  toggles.set(toggle.id, { ...toggle });
}

export function isEnabled(id: string): boolean {
  return toggles.get(id)?.enabled ?? false;
}

export function setToggle(id: string, enabled: boolean): boolean {
  const t = toggles.get(id);
  if (!t) return false;
  t.enabled = enabled;
  return true;
}

export function getAllToggles(): Toggle[] {
  return [...toggles.values()];
}
