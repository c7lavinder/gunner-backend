/**
 * Lead Noter
 *
 * Fires on: lead.scored
 * Does: writes score breakdown note to contact via note-bot
 * Does NOT: anything else
 */

import { GunnerEvent } from '../core/event-bus';
import { auditLog } from '../core/audit';
import { isEnabled } from '../core/toggles';
import { noteBot } from '../bots/note';
import { loadPlaybook } from '../config/loader';

const AGENT_ID = 'lead-noter';

/** Minimal Mustache-style renderer supporting {{var}} and {{#list}}...{{/list}} blocks. */
function renderTemplate(template: string, vars: Record<string, string>, list?: { key: string; items: Record<string, string>[] }): string {
  let out = template;
  if (list) {
    const blockRe = new RegExp(`\\{\\{#${list.key}\\}\\}([\\s\\S]*?)\\{\\{\\/${list.key}\\}\\}`, 'g');
    out = out.replace(blockRe, (_, tpl: string) =>
      list.items.map((item) => tpl.replace(/\{\{(\w+)\}\}/g, (__, k) => item[k] ?? '')).join('')
    );
  }
  return out.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

export async function runLeadNoter(event: GunnerEvent): Promise<void> {
  if (!isEnabled(AGENT_ID)) return;

  const { contactId, opportunityId, tenantId, score } = event;
  if (!score) return;

  const start = Date.now();
  const playbook = await loadPlaybook(tenantId);

  const template = playbook.notes?.score_breakdown ??
    'Lead Score: {{score}}/5 ({{tier}})\n{{#factors}}• {{name}}: {{passed}} — {{reason}}\n{{/factors}}';

  const note = renderTemplate(
    template,
    { score: String(score.score), tier: score.tier },
    {
      key: 'factors',
      items: score.factors.map((f) => ({ name: f.name, passed: f.passed ? '✅' : '❌', reason: f.reason })),
    }
  );

  await noteBot(contactId, note);

  auditLog({
    agent: AGENT_ID,
    contactId,
    opportunityId,
    action: 'lead:noted',
    result: 'success',
    durationMs: Date.now() - start,
  });
}
