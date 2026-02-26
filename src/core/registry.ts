/**
 * Registry — registers all agents and all toggles.
 * This is the ONLY place agents are bound to names.
 * Add an agent: write it, import it here, registerAgent() + registerToggle().
 */

import { registerAgent } from './agent-registry';
import { registerToggle } from './toggles';
import { runNewLeadPipeline } from '../agents/new-lead-pipeline';
import { runStageChangeRouter } from '../agents/stage-change-router';

export function registerAll() {
  // ── Agents ────────────────────────────────────────────────────────────────
  registerAgent('new-lead-pipeline', runNewLeadPipeline);
  registerAgent('stage-change-router', runStageChangeRouter);
  // Add future agents here: registerAgent('lm-assistant', runLMAssistant);

  // ── Agent Toggles ─────────────────────────────────────────────────────────
  registerToggle({ id: 'new-lead-pipeline',   kind: 'agent', label: 'New Lead Pipeline',   description: 'Scores and tags new leads when they enter the pipeline', enabled: false });
  registerToggle({ id: 'stage-change-router', kind: 'agent', label: 'Stage Change Router', description: 'Routes automation on every pipeline stage change',          enabled: false });
  registerToggle({ id: 'lm-assistant',        kind: 'agent', label: 'LM Assistant',        description: 'Post-call automation after Lead Manager calls',             enabled: false });
  registerToggle({ id: 'am-assistant',        kind: 'agent', label: 'AM Assistant',        description: 'Post-call automation after Acquisition Manager calls',      enabled: false });
  registerToggle({ id: 'response-agent',      kind: 'agent', label: 'Response Agent',      description: 'Handles every inbound SMS/email reply from a lead',         enabled: false });
  registerToggle({ id: 'working-drip',        kind: 'agent', label: 'Working Drip',        description: '104-day contact sprint sequence for new leads',             enabled: false });
  registerToggle({ id: 'follow-up-organizer', kind: 'agent', label: 'Follow-Up Organizer', description: 'Re-engagement for leads in follow-up pipeline buckets',     enabled: false });
  registerToggle({ id: 'call-coaching',       kind: 'agent', label: 'Call Coaching',       description: 'Scores and coaches every call for all team members',        enabled: false });
  registerToggle({ id: 'offer-chase',         kind: 'agent', label: 'Offer Chase',         description: 'Follows up on pending offers automatically',                enabled: false });
  registerToggle({ id: 'uc-monitor',          kind: 'agent', label: 'UC Monitor',          description: 'Watches under-contract deals, routes seller messages',      enabled: false });
  registerToggle({ id: 'post-close',          kind: 'agent', label: 'Post-Close',          description: 'Thank you, review request, referral ask after purchase',    enabled: false });

  // ── Bot Toggles ───────────────────────────────────────────────────────────
  registerToggle({ id: 'stage-bot',  kind: 'bot', label: 'Stage Bot',  description: 'Moves opportunities between pipeline stages', enabled: false });
  registerToggle({ id: 'task-bot',   kind: 'bot', label: 'Task Bot',   description: 'Creates tasks on contacts',                  enabled: false });
  registerToggle({ id: 'note-bot',   kind: 'bot', label: 'Note Bot',   description: 'Writes notes on contacts',                   enabled: false });
  registerToggle({ id: 'tag-bot',    kind: 'bot', label: 'Tag Bot',    description: 'Adds tags to contacts',                      enabled: false });
  registerToggle({ id: 'field-bot',  kind: 'bot', label: 'Field Bot',  description: 'Updates custom fields on contacts',          enabled: false });
  registerToggle({ id: 'sms-bot',    kind: 'bot', label: 'SMS Bot',    description: 'Sends SMS messages to leads',                enabled: false });
  registerToggle({ id: 'assign-bot', kind: 'bot', label: 'Assign Bot', description: 'Assigns opportunities to team members',     enabled: false });
  registerToggle({ id: 'email-bot',  kind: 'bot', label: 'Email Bot',  description: 'Sends emails to leads',                     enabled: false });

  console.log('[registry] all agents and toggles registered');
}
