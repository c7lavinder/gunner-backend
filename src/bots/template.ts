/**
 * Template Bot — ALL string/note/SMS construction.
 * Agents never build strings directly; they call this bot.
 * Toggle: bot-template
 */

import { isEnabled } from '../core/toggles';

const BOT_ID = 'bot-template';

// ─── Note Templates ───

export function buildNote(templateKey: string, vars: Record<string, string>): string {
  if (!isEnabled(BOT_ID)) return '';

  const templates: Record<string, string> = {
    'sold:under-contract': `🏠 Property under contract (not fully sold). Re-engaging. Call: {{callId}}`,
    'sold:lost': `❌ Property already sold ({{classification}}). Moved to Lost. Call: {{callId}}`,
    'bucket:reeval': `📋 Bucket re-eval: "not right now" → {{bucket}} follow-up.`,
    'callback:short-call': `📞 Inbound callback ({{duration}}s) — short call.\n{{notes}}`,
    'callback:conversation': `📞 Inbound callback ({{duration}}s) — real conversation.\nMoved to Warm. LM task created ({{lmTaskDueMinutes}}min).\n{{notes}}`,
    'callback:appointment': `📞 Inbound callback ({{duration}}s) — APPOINTMENT SET.\nDrip cancelled. Moved to appointment stage.\n{{notes}}`,
    'followup:re-engaged': `🔥 RE-ENGAGED from follow-up\nStage was: {{fromStage}}\nMessage: "{{message}}"\nAction: Moved to Warm. LM task created (due {{lmTaskDueMinutes}}min).`,
    'apt:cancelled': `📅 {{type}} cancelled. Reminders marked cancelled. Reschedule task created.`,
    'apt:prep': `📅 {{type}} confirmed for {{appointmentTime}}.\nPrep task created (due 2h before).\nReminders: +18min confirm, -24h, -2h.`,
    'am:accepted': `Offer ACCEPTED after {{callType}}. Moved to Under Contract.`,
    'am:no-show': `No-show for {{callType}}. Reschedule task created.`,
    'am:rejected': `Offer REJECTED after {{callType}}. Moved to 1-month follow-up.`,
    'am:pending': `{{callType}} completed — pending decision. Follow-up task created.`,
    'coaching:summary': `📞 Call Summary ({{callId}})\n{{summary}}`,
  };

  let text = templates[templateKey] ?? `[${templateKey}] ${JSON.stringify(vars)}`;
  for (const [k, v] of Object.entries(vars)) {
    text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
  }
  return text;
}

// ─── SMS Prompt Builder ───

export function buildSmsPrompt(
  contact: Record<string, unknown>,
  context: {
    tone: string;
    bucketName: string;
    daysSinceLastTouch: number;
    motivationField: string;
    propertyAddressField: string;
  },
): string {
  if (!isEnabled(BOT_ID)) return '';

  const name = (contact.firstName as string) || 'there';
  const customFields = (contact.customFields as Record<string, string>) ?? {};
  const motivation = customFields[context.motivationField] || 'unknown';
  const propertyAddress = customFields[context.propertyAddressField] || '';

  return [
    `Write a short re-engagement SMS (under 160 chars) for a real estate seller lead.`,
    `Tone: ${context.tone}.`,
    `Seller first name: ${name}.`,
    `Motivation: ${motivation}.`,
    `Property: ${propertyAddress || 'unknown'}.`,
    `Days since last contact: ${context.daysSinceLastTouch}.`,
    `Follow-up bucket: ${context.bucketName}.`,
    `Do NOT use exclamation marks. Sound human, not salesy.`,
    `Do NOT include company name or agent name — that's appended separately.`,
  ].join('\n');
}

// ─── Deal Package ───

export function buildDealPackage(contact: Record<string, unknown>, fields: Record<string, string>): string {
  if (!isEnabled(BOT_ID)) return '';

  const cf = (contact as any)?.customFields ?? {};
  const arv = cf.arv ?? fields.arv ?? 'N/A';
  const repairs = cf.repair_estimate ?? fields.repairs ?? 'N/A';
  const contractPrice = cf.contract_price ?? fields.contractPrice ?? 'N/A';
  const propertyAddress = cf.property_address ?? fields.propertyAddress ?? 'N/A';
  const spread = arv !== 'N/A' && contractPrice !== 'N/A'
    ? `$${Number(arv) - Number(contractPrice)}`
    : 'N/A';

  return [
    `📦 Dispo Deal Package`,
    `Property: ${propertyAddress}`,
    `ARV: ${arv} | Repairs: ${repairs} | Contract: ${contractPrice} | Spread: ${spread}`,
    cf.deal_summary ? `Summary: ${cf.deal_summary}` : '',
  ].filter(Boolean).join('\n');
}

// ─── Closing Checklist ───

export function buildClosingChecklist(contact: Record<string, unknown>, fields: Record<string, string>): string {
  if (!isEnabled(BOT_ID)) return '';

  const buyerName = (contact as any)?.firstName ?? fields.buyerName ?? 'Buyer';
  const propertyAddress = fields.propertyAddress ?? 'N/A';
  const closingDate = fields.closingDate ?? 'TBD';

  return [
    `✅ Closing Checklist — ${propertyAddress}`,
    `Buyer: ${buyerName}`,
    `Target Close: ${closingDate}`,
    `---`,
    `[ ] Contract sent to title`,
    `[ ] Earnest money received`,
    `[ ] Title search ordered`,
    `[ ] Title clear`,
    `[ ] Closing docs prepared`,
    `[ ] Closing scheduled`,
    `[ ] Funds wired`,
    `[ ] Closed & recorded`,
  ].join('\n');
}

// ─── Comparison Note ───

export function buildComparisonNote(
  offers: Array<{ buyerName: string; price: number; terms: string; proofOfFunds: boolean; closingTimeline: string }>,
  propertyAddress: string,
): string {
  if (!isEnabled(BOT_ID)) return '';

  const highest = offers[0];
  return [
    `💰 Offer Summary — ${propertyAddress}`,
    `${offers.length} offer(s) received — highest: $${highest?.price?.toLocaleString() ?? 'N/A'} from ${highest?.buyerName ?? 'N/A'}`,
    `---`,
    ...offers.map((o, i) => [
      `${i + 1}. ${o.buyerName}: $${o.price.toLocaleString()}`,
      `   Terms: ${o.terms} | POF: ${o.proofOfFunds ? '✅' : '❌'} | Close: ${o.closingTimeline}`,
    ].join('\n')),
  ].join('\n');
}

// ─── TC Handoff Package ───

export function buildTcPackage(contact: Record<string, unknown>, fields: Record<string, string>, missing: string[]): string {
  if (!isEnabled(BOT_ID)) return '';

  return [
    `📋 TC HANDOFF PACKAGE`,
    `Seller: ${fields.sellerName ?? 'Unknown'}`,
    `Property: ${fields.propertyAddress ?? 'N/A'}`,
    `Contract Price: ${fields.contractPrice ?? 'N/A'}`,
    `Closing Date: ${fields.closingDate ?? 'N/A'}`,
    `Access: ${fields.accessInstructions ?? 'N/A'}`,
    `Phone: ${(contact as any)?.phone ?? 'N/A'}`,
    `Email: ${(contact as any)?.email ?? 'N/A'}`,
    missing.length > 0 ? `⚠️ Missing: ${missing.join(', ')}` : '',
  ].filter(Boolean).join('\n');
}

// ─── Title Coordination Task Body ───

export function buildTitleCoordinationBody(fields: Record<string, string>): string {
  if (!isEnabled(BOT_ID)) return '';

  return [
    `Buyer: ${fields.buyerName ?? 'N/A'}`,
    `Property: ${fields.propertyAddress ?? 'N/A'}`,
    `Closing Date: ${fields.closingDate ?? 'TBD'}`,
    `\nAction items:`,
    `- Send contract to title company`,
    `- Confirm earnest money deposit`,
    `- Order title search`,
    `- Coordinate closing date`,
  ].join('\n');
}

// ─── Audit Report ───

export function formatAuditReport(report: Record<string, unknown>): string {
  if (!isEnabled(BOT_ID)) return '';
  return JSON.stringify(report, null, 2);
}

// ─── Initial Outreach SMS Prompt ───

export function buildInitialOutreachPrompt(
  contact: Record<string, unknown>,
  tone: string,
  includeCompanyName: boolean,
  companyName: string,
  playbook: any,
): string {
  if (!isEnabled(BOT_ID)) return '';

  const cf = playbook.customFields;
  const firstName = (contact.firstName as string) || '';
  const customFields = (contact.customFields as Record<string, string>) || {};
  const address = customFields[cf.property_address] || '';
  const motivation = customFields[cf.motivation] || '';

  return [
    `You are a real estate acquisitions rep texting a seller lead for the first time.`,
    `Write ONE conversational SMS opener — under 160 characters. No exclamation marks. Sound like a real person, not a script.`,
    ``,
    `Tone: ${tone}. Adjust warmth/energy to match the time of day.`,
    firstName ? `Lead's first name: ${firstName}.` : `Do not use a name — we don't have one yet.`,
    address ? `Property they may want to sell: ${address}.` : '',
    motivation ? `Their stated motivation: ${motivation}.` : '',
    includeCompanyName
      ? `Close with something natural that references "${companyName}" since they reached out to us.`
      : `Do NOT mention the company name.`,
    `Do NOT include a phone number, link, or opt-out language in the message body.`,
    `Output only the SMS text — no quotes, no labels.`,
  ].filter(Boolean).join('\n');
}

export const templateBot = {
  buildNote,
  buildSmsPrompt,
  buildDealPackage,
  buildClosingChecklist,
  buildComparisonNote,
  buildTcPackage,
  buildTitleCoordinationBody,
  formatAuditReport,
  buildInitialOutreachPrompt,
};
