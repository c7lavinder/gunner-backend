/**
 * Registry — registers all agents and all toggles.
 * Add an agent: write it, import it here, registerAgent() + registerToggle().
 */

import { registerAgent } from './agent-registry';
import { registerToggle } from './toggles';
import { runNewLeadPipeline } from '../agents/new-lead-pipeline';
import { runLeadScorer } from '../agents/lead-scorer';
import { runLeadTagger } from '../agents/lead-tagger';
import { runLeadNoter } from '../agents/lead-noter';
import { runLeadTaskCreator } from '../agents/lead-task-creator';
import { runStageChangeRouter } from '../agents/stage-change-router';
import { runDealBlaster } from '../agents/deal-blaster';
import { runBuyerMatcher } from '../agents/buyer-matcher';
import { runBuyerResponse } from '../agents/buyer-response';
import { runDispoCloser } from '../agents/dispo-closer';
import { runJvRouter } from '../agents/jv-router';
import { runDealTerminator } from '../agents/deal-terminator';
import { runOfferCollector } from '../agents/offer-collector';
import { runShowingManager } from '../agents/showing-manager';
import { runDispoPackager } from '../agents/dispo-packager';
import { runDealIntake } from '../agents/dispo/deal-intake';
import { runTitleCoordinator } from '../agents/dispo/title-coordinator';
import { runClosingAgent } from '../agents/dispo/closing-agent';
import { runBuyerIntake } from '../agents/dispo/buyer-intake';
import { runBuyerQualifier } from '../agents/dispo/buyer-qualifier';
import { runWorkingDrip } from '../agents/working-drip';
import { runContractBot } from '../agents/contract-bot';
import { runUCMonitor } from '../agents/uc-monitor';
import { runPostCloseBot } from '../agents/post-close-bot';
import { runGhostedAgent } from '../agents/ghosted-agent';
import { runOfferChase } from '../agents/offer-chase';
import { runFollowUpOrganizer } from '../agents/follow-up-organizer';
import { runResponseAgent } from '../agents/response-agent';
import { runCallbackCapture } from '../agents/callback-capture';
import { runInitialOutreach } from '../agents/initial-outreach';
import { runTCPackager } from '../agents/tc-packager';
import { runAccountabilityAgent } from '../agents/accountability-agent';
import { runOfferReply } from '../agents/offer-reply';
import { runBucketReeval } from '../agents/bucket-reeval';

export function registerAll() {
  // ── Agents ────────────────────────────────────────────────────────────────
  registerAgent('new-lead-pipeline',   runNewLeadPipeline);   // detects new lead, fetches contact, emits lead.new
  registerAgent('lead-scorer',         runLeadScorer);         // scores HOT/WARM, writes fields, emits lead.scored
  registerAgent('lead-tagger',         runLeadTagger);         // adds tier tag
  registerAgent('lead-noter',          runLeadNoter);          // writes score note
  registerAgent('lead-task-creator',   runLeadTaskCreator);    // creates LM call task
  registerAgent('stage-change-router', runStageChangeRouter);  // routes on stage changes

  // ── Sales Pipeline Agents ───────────────────────────────────────────────────
  registerAgent('working-drip',        runWorkingDrip as any);       // 104-day drip sequence
  registerAgent('contract-bot',        runContractBot);              // UC confirmation + TC/dispo handoff
  registerAgent('uc-monitor',          runUCMonitor);                // monitors under-contract communications
  registerAgent('post-close-bot',      runPostCloseBot);             // thank you, review, referral sequence
  registerAgent('ghosted-agent',       runGhostedAgent as any);      // handles ghosted leads
  registerAgent('offer-chase',         runOfferChase);               // follows up on pending offers
  registerAgent('follow-up-organizer', runFollowUpOrganizer as any); // routes to follow-up buckets
  registerAgent('response-agent',      runResponseAgent as any);     // handles inbound SMS replies
  registerAgent('callback-capture',    runCallbackCapture as any);   // captures callback requests
  registerAgent('initial-outreach',    runInitialOutreach);          // first SMS to new lead
  registerAgent('tc-packager',         runTCPackager);               // packages deal for TC
  registerAgent('accountability-agent', runAccountabilityAgent);     // task overdue escalation
  registerAgent('offer-reply',         runOfferReply);               // handles offer responses
  registerAgent('bucket-reeval',       runBucketReeval as any);      // re-evaluates follow-up bucket

  // ── Dispo Pipeline Agents ──────────────────────────────────────────────────
  registerAgent('deal-intake',         runDealIntake);         // validates new dispo deal, assigns Esteban
  registerAgent('deal-blaster',        runDealBlaster);        // AI-writes deal blast, sends to buyers
  registerAgent('offer-collector',     runOfferCollector);     // ranks incoming offers, creates comparison
  registerAgent('jv-router',           runJvRouter);           // routes JV partner deals
  registerAgent('deal-terminator',     runDealTerminator);     // handles deal termination
  registerAgent('dispo-closer',        runDispoCloser);        // UC with buyer — title coordination kickoff
  registerAgent('title-coordinator',   runTitleCoordinator);   // title work milestones and timeline
  registerAgent('dispo-closing-agent', runClosingAgent);       // final close — profit calc, summary
  registerAgent('dispo-packager',      runDispoPackager);      // packages deal for dispo
  registerAgent('showing-manager',     runShowingManager);     // manages showings

  // ── Buyer Pipeline Agents ──────────────────────────────────────────────────
  registerAgent('buyer-intake',        runBuyerIntake);        // new buyer — criteria capture, tagging
  registerAgent('buyer-qualifier',     runBuyerQualifier);     // scores/qualifies buyers
  registerAgent('buyer-matcher',       runBuyerMatcher);       // matches buyers to deals
  registerAgent('buyer-response',      runBuyerResponse);      // classifies buyer replies

  // ── Agent Toggles ─────────────────────────────────────────────────────────
  registerToggle({ id: 'new-lead-pipeline',   kind: 'agent', label: 'New Lead Pipeline',   description: 'Detects new lead, fetches contact data, hands off downstream',  enabled: false });
  registerToggle({ id: 'lead-scorer',         kind: 'agent', label: 'Lead Scorer',         description: 'Scores lead HOT/WARM, writes score to contact fields',           enabled: false });
  registerToggle({ id: 'lead-tagger',         kind: 'agent', label: 'Lead Tagger',         description: 'Adds lead-tier tag to contact',                                  enabled: false });
  registerToggle({ id: 'lead-noter',          kind: 'agent', label: 'Lead Noter',          description: 'Writes score breakdown note to contact',                         enabled: false });
  registerToggle({ id: 'lead-task-creator',   kind: 'agent', label: 'Lead Task Creator',   description: 'Creates call task for LM with SLA due date',                    enabled: false });
  registerToggle({ id: 'stage-change-router', kind: 'agent', label: 'Stage Change Router', description: 'Routes automation on every pipeline stage change',               enabled: false });
  registerToggle({ id: 'lm-assistant',        kind: 'agent', label: 'LM Assistant',        description: 'Post-call automation after Lead Manager calls',                  enabled: false });

  // ── Dispo Pipeline Toggles ─────────────────────────────────────────────────
  registerToggle({ id: 'deal-intake',         kind: 'agent', label: 'Deal Intake',         description: 'Validates new dispo deals, assigns to Esteban, creates review task',  enabled: false });
  registerToggle({ id: 'deal-blaster',        kind: 'agent', label: 'Deal Blaster',        description: 'AI-writes and sends deal blasts to qualified buyers',                 enabled: false });
  registerToggle({ id: 'offer-collector',     kind: 'agent', label: 'Offer Collector',     description: 'Logs and ranks buyer offers, creates comparison notes',               enabled: false });
  registerToggle({ id: 'jv-router',           kind: 'agent', label: 'JV Router',           description: 'Routes deals to JV partners and coordinates terms',                   enabled: false });
  registerToggle({ id: 'deal-terminator',     kind: 'agent', label: 'Deal Terminator',     description: 'Handles deal termination — logging, cleanup, re-evaluation',          enabled: false });
  registerToggle({ id: 'dispo-closer',        kind: 'agent', label: 'Dispo Closer',        description: 'Manages UC with buyer — title coordination, buyer check-ins',         enabled: false });
  registerToggle({ id: 'title-coordinator',   kind: 'agent', label: 'Title Coordinator',   description: 'Creates title work milestone tasks, monitors timeline',               enabled: false });
  registerToggle({ id: 'dispo-closing-agent', kind: 'agent', label: 'Closing Agent',       description: 'Calculates profit, closing summary, triggers post-close',             enabled: false });
  registerToggle({ id: 'dispo-packager',      kind: 'agent', label: 'Dispo Packager',      description: 'Packages deals for disposition to buyers',                            enabled: false });
  registerToggle({ id: 'showing-manager',     kind: 'agent', label: 'Showing Manager',     description: 'Manages showings — prep tasks, confirmations, reminders',             enabled: false });
  registerToggle({ id: 'buyer-intake',        kind: 'agent', label: 'Buyer Intake',        description: 'New buyer onboarding — criteria capture, tagging',                    enabled: false });
  registerToggle({ id: 'buyer-qualifier',     kind: 'agent', label: 'Buyer Qualifier',     description: 'Scores buyers, moves to qualified/unqualified/priority',              enabled: false });
  registerToggle({ id: 'buyer-matcher',       kind: 'agent', label: 'Buyer Matcher',       description: 'Scores and ranks buyers against new dispo deals',                     enabled: false });
  registerToggle({ id: 'buyer-response',      kind: 'agent', label: 'Buyer Response',      description: 'AI-classifies inbound buyer messages and routes accordingly',         enabled: false });
  registerToggle({ id: 'am-assistant',        kind: 'agent', label: 'AM Assistant',        description: 'Post-call automation after Acquisition Manager calls',           enabled: false });
  registerToggle({ id: 'response-agent',      kind: 'agent', label: 'Response Agent',      description: 'Handles every inbound SMS/email reply from a lead',              enabled: false });
  registerToggle({ id: 'working-drip',        kind: 'agent', label: 'Working Drip',        description: '104-day contact sprint for new leads',                           enabled: false });
  registerToggle({ id: 'follow-up-organizer', kind: 'agent', label: 'Follow-Up Organizer', description: 'Re-engagement for leads in follow-up pipeline buckets',          enabled: false });
  registerToggle({ id: 'call-coaching',       kind: 'agent', label: 'Call Coaching',       description: 'Scores and coaches every call for all team members',             enabled: false });
  registerToggle({ id: 'offer-chase',         kind: 'agent', label: 'Offer Chase',         description: 'Follows up on pending offers automatically',                     enabled: false });
  registerToggle({ id: 'uc-monitor',          kind: 'agent', label: 'UC Monitor',          description: 'Watches under-contract deals, routes seller messages',           enabled: false });
  registerToggle({ id: 'post-close',          kind: 'agent', label: 'Post-Close',          description: 'Thank you, review request, referral ask after purchase',         enabled: false });

  // ── Bot Toggles ───────────────────────────────────────────────────────────
  registerToggle({ id: 'stage-bot',  kind: 'bot', label: 'Stage Bot',  description: 'Moves opportunities between pipeline stages', enabled: false });
  registerToggle({ id: 'task-bot',   kind: 'bot', label: 'Task Bot',   description: 'Creates tasks on contacts',                  enabled: false });
  registerToggle({ id: 'note-bot',   kind: 'bot', label: 'Note Bot',   description: 'Writes notes on contacts',                   enabled: false });
  registerToggle({ id: 'tag-bot',    kind: 'bot', label: 'Tag Bot',    description: 'Adds tags to contacts',                      enabled: false });
  registerToggle({ id: 'field-bot',  kind: 'bot', label: 'Field Bot',  description: 'Updates custom fields on contacts',          enabled: false });
  registerToggle({ id: 'sms-bot',    kind: 'bot', label: 'SMS Bot',    description: 'Sends SMS messages to leads',                enabled: false });
  registerToggle({ id: 'assign-bot', kind: 'bot', label: 'Assign Bot', description: 'Assigns opportunities to team members',      enabled: false });
  registerToggle({ id: 'email-bot',  kind: 'bot', label: 'Email Bot',  description: 'Sends emails to leads',                     enabled: false });

  console.log('[registry] all agents and toggles registered');
}
