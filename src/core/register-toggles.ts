/**
 * Master Toggle Registry — registers ALL agents and bots.
 * Import this once at startup to populate the toggle map.
 */

import { registerToggle } from './toggles';

// === AGENTS ===
registerToggle({ id: 'new-lead-pipeline', kind: 'agent', label: 'New Lead Pipeline', description: 'Ingests new leads from GHL webhook and kicks off processing', enabled: true });
registerToggle({ id: 'lead-scorer', kind: 'agent', label: 'Lead Scorer', description: 'Scores incoming leads based on motivation and property signals', enabled: true });
registerToggle({ id: 'lead-tagger', kind: 'agent', label: 'Lead Tagger', description: 'Applies tags to contacts based on lead data', enabled: true });
registerToggle({ id: 'lead-noter', kind: 'agent', label: 'Lead Noter', description: 'Writes AI-generated notes on new leads', enabled: true });
registerToggle({ id: 'lead-task-creator', kind: 'agent', label: 'Lead Task Creator', description: 'Creates follow-up tasks for the team on new leads', enabled: true });
registerToggle({ id: 'initial-outreach', kind: 'agent', label: 'Initial Outreach', description: 'Sends the first SMS to new leads', enabled: true });
registerToggle({ id: 'response-agent', kind: 'agent', label: 'Response Agent', description: 'Handles inbound replies from leads', enabled: true });
registerToggle({ id: 'follow-up-messenger', kind: 'agent', label: 'Follow-Up Messenger', description: 'Sends scheduled follow-up messages', enabled: true });
registerToggle({ id: 'follow-up-organizer', kind: 'agent', label: 'Follow-Up Organizer', description: 'Organizes and prioritizes follow-up queue', enabled: true });
registerToggle({ id: 'follow-up-closer', kind: 'agent', label: 'Follow-Up Closer', description: 'Handles closing-stage follow-up sequences', enabled: true });
registerToggle({ id: 'ghosted-agent', kind: 'agent', label: 'Ghosted Agent', description: 'Re-engages leads that stopped responding', enabled: true });
registerToggle({ id: 'stage-change-router', kind: 'agent', label: 'Stage Change Router', description: 'Routes leads when their pipeline stage changes', enabled: true });
registerToggle({ id: 'bucket-reeval', kind: 'agent', label: 'Bucket Re-Eval', description: 'Re-evaluates lead buckets periodically', enabled: true });
registerToggle({ id: 'reality-check', kind: 'agent', label: 'Reality Check', description: 'Validates lead data against external sources', enabled: true });
registerToggle({ id: 'reality-check-poller', kind: 'agent', label: 'Reality Check Poller', description: 'Polls for leads needing reality checks', enabled: true });
registerToggle({ id: 'apt-prep', kind: 'agent', label: 'Appointment Prep', description: 'Prepares briefing docs before appointments', enabled: true });
registerToggle({ id: 'apt-reminder-poller', kind: 'agent', label: 'Appointment Reminder Poller', description: 'Sends reminders for upcoming appointments', enabled: true });
registerToggle({ id: 'call-coaching', kind: 'agent', label: 'Call Coaching', description: 'Analyzes calls and provides coaching feedback', enabled: true });
registerToggle({ id: 'callback-capture', kind: 'agent', label: 'Callback Capture', description: 'Captures and processes callback requests', enabled: true });
registerToggle({ id: 'offer-chase', kind: 'agent', label: 'Offer Chase', description: 'Follows up on pending offers', enabled: true });
registerToggle({ id: 'offer-reply', kind: 'agent', label: 'Offer Reply', description: 'Handles responses to offers', enabled: true });
registerToggle({ id: 'contract-bot', kind: 'agent', label: 'Contract Bot', description: 'Manages contract-stage workflow', enabled: true });
registerToggle({ id: 'already-sold-agent', kind: 'agent', label: 'Already Sold Agent', description: 'Handles leads where property is already sold', enabled: true });
registerToggle({ id: 'post-close-bot', kind: 'agent', label: 'Post-Close Bot', description: 'Manages post-closing follow-up and reviews', enabled: true });
registerToggle({ id: 'dispo-packager', kind: 'agent', label: 'Dispo Packager', description: 'Packages deals for disposition to buyers', enabled: true });
registerToggle({ id: 'tc-packager', kind: 'agent', label: 'TC Packager', description: 'Packages deal info for transaction coordinators', enabled: true });
registerToggle({ id: 'outbound-manager', kind: 'agent', label: 'Outbound Manager', description: 'Manages outbound calling campaigns', enabled: true });
registerToggle({ id: 'accountability-agent', kind: 'agent', label: 'Accountability Agent', description: 'Tracks team KPIs and sends accountability nudges', enabled: true });
registerToggle({ id: 'am-assistant', kind: 'agent', label: 'AM Assistant', description: 'Acquisition Manager daily assistant', enabled: true });
registerToggle({ id: 'lm-assistant', kind: 'agent', label: 'LM Assistant', description: 'Lead Manager daily assistant', enabled: true });
registerToggle({ id: 'uc-monitor', kind: 'agent', label: 'Under Contract Monitor', description: 'Monitors deals under contract for issues', enabled: true });
registerToggle({ id: 'working-drip', kind: 'agent', label: 'Working Drip', description: 'Drip sequences for leads in working status', enabled: true });

// === BOTS ===
registerToggle({ id: 'bot-assign', kind: 'bot', label: 'Assign Bot', description: 'Assigns opportunities to team members in GHL', enabled: true });
registerToggle({ id: 'bot-contact', kind: 'bot', label: 'Contact Bot', description: '⚠️ Fetches contact data from GHL — disabling this breaks most agents', enabled: true });
registerToggle({ id: 'bot-field', kind: 'bot', label: 'Field Bot', description: 'Updates custom fields on contacts in GHL', enabled: true });
registerToggle({ id: 'bot-note', kind: 'bot', label: 'Note Bot', description: 'Adds notes to contacts in GHL', enabled: true });
registerToggle({ id: 'bot-scorer', kind: 'bot', label: 'Scorer Bot', description: 'Runs AI lead scoring on contacts', enabled: true });
registerToggle({ id: 'bot-sms', kind: 'bot', label: 'SMS Bot', description: 'Sends text messages to leads via GHL', enabled: true });
registerToggle({ id: 'bot-stage', kind: 'bot', label: 'Stage Bot', description: 'Moves opportunities between pipeline stages in GHL', enabled: true });
registerToggle({ id: 'bot-tag', kind: 'bot', label: 'Tag Bot', description: 'Applies tags to contacts in GHL', enabled: true });
registerToggle({ id: 'bot-task', kind: 'bot', label: 'Task Bot', description: 'Creates tasks on contacts in GHL', enabled: true });
