/**
 * Compliance Bot — DNC and regulatory checks.
 * Toggle: bot-compliance
 */

import { isEnabled } from '../core/toggles';

const BOT_ID = 'bot-compliance';

const DEFAULT_DNC_KEYWORDS = ['stop', 'unsubscribe', 'remove me', 'do not contact', 'dnc', 'opt out'];

export function isDnc(message: string, playbook?: any): boolean {
  if (!isEnabled(BOT_ID)) return false;
  const lower = message.toLowerCase().trim();
  const keywords = playbook?.sms?.dncKeywords ?? DEFAULT_DNC_KEYWORDS;
  return keywords.some((kw: string) => lower.includes(kw));
}

export function checkDncKeywords(message: string, playbook: any): boolean {
  return isDnc(message, playbook);
}

export function checkSendCompliance(
  _contactId: string,
  _tenantId: string,
): { canSend: boolean; reason?: string } {
  if (!isEnabled(BOT_ID)) return { canSend: false, reason: 'compliance-bot-disabled' };
  // Future: check TCPA hours, DNC registry, opt-out status, etc.
  return { canSend: true };
}

export const complianceBot = {
  isDnc,
  checkDncKeywords,
  checkSendCompliance,
};
