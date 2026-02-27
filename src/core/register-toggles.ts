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

// === DISPO PIPELINE AGENTS ===
registerToggle({ id: 'deal-blaster', kind: 'agent', label: 'Deal Blaster', description: 'AI-writes and sends deal blasts to qualified buyers', enabled: true });
registerToggle({ id: 'buyer-matcher', kind: 'agent', label: 'Buyer Matcher', description: 'Scores and ranks buyers against new dispo deals', enabled: true });
registerToggle({ id: 'buyer-response', kind: 'agent', label: 'Buyer Response', description: 'AI-classifies inbound buyer messages and routes accordingly', enabled: true });
registerToggle({ id: 'showing-manager', kind: 'agent', label: 'Showing Manager', description: 'Manages property showings — prep tasks, confirmations, reminders', enabled: true });
registerToggle({ id: 'offer-collector', kind: 'agent', label: 'Offer Collector', description: 'Logs and ranks buyer offers, creates comparison notes', enabled: true });
registerToggle({ id: 'dispo-closer', kind: 'agent', label: 'Dispo Closer', description: 'Manages closing workflow — title coordination, buyer check-ins', enabled: true });
registerToggle({ id: 'jv-router', kind: 'agent', label: 'JV Router', description: 'Routes deals to JV partners and coordinates terms', enabled: true });
registerToggle({ id: 'deal-terminator', kind: 'agent', label: 'Deal Terminator', description: 'Handles deal termination — logging, cleanup, re-evaluation', enabled: true });
registerToggle({ id: 'dispo-accountability', kind: 'agent', label: 'Dispo Accountability', description: 'Audits dispo pipeline health every 4 hours, alerts on stale deals', enabled: true });

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

// === READ BOTS ===
registerToggle({ id: 'bot-contact-search', kind: 'bot', label: 'Contact Search Bot', description: 'Searches and filters contacts in GHL (read-only)', enabled: true });
registerToggle({ id: 'bot-task-reader', kind: 'bot', label: 'Task Reader Bot', description: 'Reads tasks from GHL (read-only)', enabled: true });
registerToggle({ id: 'bot-note-reader', kind: 'bot', label: 'Note Reader Bot', description: 'Reads notes from GHL (read-only)', enabled: true });
registerToggle({ id: 'bot-opportunity', kind: 'bot', label: 'Opportunity Bot', description: 'Reads and creates opportunities in GHL', enabled: true });
registerToggle({ id: 'bot-pipeline-reader', kind: 'bot', label: 'Pipeline Reader Bot', description: 'Reads contacts by pipeline stage (read-only)', enabled: true });

// === AI BOTS ===
registerToggle({ id: 'bot-ai-writer', kind: 'bot', label: 'AI Writer Bot', description: 'Generates text via Gemini AI', enabled: true });
registerToggle({ id: 'bot-ai-classifier', kind: 'bot', label: 'AI Classifier Bot', description: 'Classifies/parses JSON via Gemini AI', enabled: true });

// === COMMUNICATION BOTS ===
registerToggle({ id: 'bot-email', kind: 'bot', label: 'Email Bot', description: 'Sends emails via GHL (stub)', enabled: true });

// === LOGIC BOTS ===
registerToggle({ id: 'bot-classifier', kind: 'bot', label: 'Classifier Bot', description: 'Consolidates all classification/detection logic', enabled: true });
registerToggle({ id: 'bot-template', kind: 'bot', label: 'Template Bot', description: 'All string/note/SMS construction', enabled: true });
registerToggle({ id: 'bot-scheduler', kind: 'bot', label: 'Scheduler Bot', description: 'All time/scheduling logic', enabled: true });
registerToggle({ id: 'bot-guard', kind: 'bot', label: 'Guard Bot', description: 'Idempotency/dedup/guard checks', enabled: true });
registerToggle({ id: 'bot-compliance', kind: 'bot', label: 'Compliance Bot', description: 'DNC and regulatory checks', enabled: true });

// === INTELLIGENCE BOTS ===
registerToggle({ id: 'bot-memory-writer', kind: 'bot', label: 'Memory Writer Bot', description: 'Writes actions to intelligence memory', enabled: true });
registerToggle({ id: 'bot-memory-reader', kind: 'bot', label: 'Memory Reader Bot', description: 'Reads from intelligence memory (recent, top/worst performers, stats)', enabled: true });
registerToggle({ id: 'bot-outcome-tracker', kind: 'bot', label: 'Outcome Tracker Bot', description: 'Matches actions to their outcomes', enabled: true });
registerToggle({ id: 'bot-learning-builder', kind: 'bot', label: 'Learning Builder Bot', description: 'Builds learning context strings for AI prompts', enabled: true });
registerToggle({ id: 'bot-pattern-analyzer', kind: 'bot', label: 'Pattern Analyzer Bot', description: 'Analyzes response rates and team performance patterns', enabled: true });
registerToggle({ id: 'bot-briefing-writer', kind: 'bot', label: 'Briefing Writer Bot', description: 'Generates daily intelligence briefings', enabled: true });
registerToggle({ id: 'bot-feedback-writer', kind: 'bot', label: 'Feedback Writer Bot', description: 'Records human feedback on actions', enabled: true });
registerToggle({ id: 'intelligence-poller', kind: 'agent', label: 'Intelligence Poller', description: 'Daily learning cycle — matches outcomes, updates learnings', enabled: true });
registerToggle({ id: 'intelligence-researcher', kind: 'agent', label: 'Intelligence Researcher', description: 'Weekly deep analysis — patterns, team stats, briefings', enabled: true });
registerToggle({ id: 'intelligence-feedback', kind: 'agent', label: 'Intelligence Feedback', description: 'Routes human feedback from API to feedback-writer bot', enabled: true });
registerToggle({ id: 'morning-briefing', kind: 'agent', label: 'Morning Briefing', description: 'Daily 8AM CST briefing — gathers stats and sends Telegram summary', enabled: true });
