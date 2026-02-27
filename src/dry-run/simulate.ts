#!/usr/bin/env tsx
/**
 * Dry Run Simulation — full lead lifecycle end-to-end.
 * Run: npx tsx src/dry-run/simulate.ts
 */

import path from 'path';

// ── Environment ─────────────────────────────────────────────
process.env.DRY_RUN = 'true';
process.env.TENANT_ID = 'nah';
process.env.PLAYBOOK_DIR = path.resolve(__dirname, '../playbooks');

// Provide dummy env so playbook/config.ts loadConfig() doesn't blow up
process.env.GHL_LOCATION_ID = 'dry-run-location';
process.env.SEND_WINDOW_START = '0';   // always inside window for sim
process.env.SEND_WINDOW_END = '24';

// ── Mock GHL + AI before any imports ────────────────────────
// contactBot calls ghlGet which throws without a token. We intercept.

import { configureGHL } from '../integrations/ghl/client';
import { configureAI } from '../integrations/ai/client';
import { loadConfig } from '../playbook/config';

// Configure with dummy values so the guards don't throw
configureGHL('dry-run-token', 'dry-run-location');
configureAI('dry-run-key');
loadConfig();

// Now monkey-patch the GHL HTTP functions so no real calls go out
import * as ghlClient from '../integrations/ghl/client';

const FAKE_CONTACT: Record<string, any> = {
  id: 'dry-run-contact-001',
  firstName: 'Marcus',
  lastName: 'Thompson',
  name: 'Marcus Thompson',
  phone: '615-555-0147',
  email: 'marcus@example.com',
  source: 'PropertyLeads',
  timezone: 'America/Chicago',
  customFields: {
    property_address: '1847 Shelby Ave, Nashville, TN 37206',
    motivation: 'Inherited property, wants quick sale',
    initial_sms_sent: '',   // not yet sent
  },
};

// Override ghlGet to return fake contact
(ghlClient as any).ghlGet = async (_path: string) => {
  return { contact: { ...FAKE_CONTACT } };
};
// Override ghlPost/ghlPut to no-op
(ghlClient as any).ghlPost = async () => ({});
(ghlClient as any).ghlPut = async () => ({});

// Override AI client to return a deterministic score
import * as aiClient from '../integrations/ai/client';
(aiClient as any).aiComplete = async () => {
  return JSON.stringify({
    factors: [
      { name: 'Motivation', passed: true, reason: 'Inherited property — motivated seller' },
      { name: 'Timeline', passed: true, reason: 'Wants quick sale' },
      { name: 'Property Condition', passed: true, reason: 'Default pass — evaluated on call' },
      { name: 'Price Flexibility', passed: true, reason: 'Open to offers' },
      { name: 'Decision Maker', passed: false, reason: 'Unknown — need to confirm on call' },
    ],
  });
};

// ── Imports (after mocks) ───────────────────────────────────
import { registerToggle, setToggle } from '../core/toggles';
import { emit, GunnerEvent } from '../core/event-bus';
import { scoreLead } from '../intelligence/lead-scorer';
import { runNewLeadPipeline } from '../agents/new-lead-pipeline';
import { runLeadTagger } from '../agents/lead-tagger';
import { runLeadNoter } from '../agents/lead-noter';
import { runLeadTaskCreator } from '../agents/lead-task-creator';
import { runInitialOutreach } from '../agents/initial-outreach';
import { runWorkingDrip } from '../agents/working-drip';

// ── Toggle Registration ─────────────────────────────────────
const AGENT_IDS = [
  'new-lead-pipeline',
  'lead-scorer',
  'lead-tagger',
  'lead-noter',
  'lead-task-creator',
  'initial-outreach',
  'working-drip',
];

for (const id of AGENT_IDS) {
  registerToggle({ id, kind: 'agent', label: id, description: `Dry run toggle for ${id}`, enabled: true });
}

// ── Simulation ──────────────────────────────────────────────

interface StepResult {
  agent: string;
  ok: boolean;
  message: string;
}

const results: StepResult[] = [];
const startTime = Date.now();

function pass(agent: string, msg: string) {
  results.push({ agent, ok: true, message: msg });
  console.log(`✅ [${agent}] ${msg}`);
}

function fail(agent: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  results.push({ agent, ok: false, message: msg });
  console.log(`❌ [${agent}] FAILED: ${msg}`);
}

async function main() {
  console.log('\n🚀 GUNNER DRY RUN SIMULATION');
  console.log('═'.repeat(50));
  console.log(`Lead: Marcus Thompson | 615-555-0147`);
  console.log(`Property: 1847 Shelby Ave, Nashville, TN 37206`);
  console.log(`Source: PropertyLeads | Market: Nashville | Tenant: nah`);
  console.log('═'.repeat(50));
  console.log('');

  const baseEvent: GunnerEvent = {
    kind: 'opportunity.created',
    tenantId: 'nah',
    contactId: 'dry-run-contact-001',
    opportunityId: 'dry-run-opp-001',
    contact: FAKE_CONTACT,
  };

  // 1. New Lead Pipeline
  try {
    await runNewLeadPipeline(baseEvent);
    pass('new-lead-pipeline', 'Lead ingested — Marcus Thompson');
  } catch (e) {
    fail('new-lead-pipeline', e);
  }

  // 2. Lead Scorer
  let score: any;
  try {
    score = await scoreLead(FAKE_CONTACT);
    pass('lead-scorer', `Scored as ${score.tier} (${score.score} points)`);
  } catch (e) {
    fail('lead-scorer', e);
  }

  const scoredEvent: GunnerEvent = {
    ...baseEvent,
    kind: 'lead.scored',
    score,
    contact: FAKE_CONTACT,
  };

  // 3. Lead Tagger
  try {
    await runLeadTagger(scoredEvent);
    const tag = score?.tier === 'HOT' ? 'hot-lead' : 'warm-lead';
    pass('lead-tagger', `Tagged: ${tag}`);
  } catch (e) {
    fail('lead-tagger', e);
  }

  // 4. Lead Noter
  try {
    await runLeadNoter(scoredEvent);
    pass('lead-noter', `Note written: Lead scored ${score?.tier ?? 'UNKNOWN'}...`);
  } catch (e) {
    fail('lead-noter', e);
  }

  // 5. Lead Task Creator
  try {
    await runLeadTaskCreator(scoredEvent);
    pass('lead-task-creator', 'Task created: Call within 15 min');
  } catch (e) {
    fail('lead-task-creator', e);
  }

  // 6. Initial Outreach
  try {
    await runInitialOutreach({ ...baseEvent, kind: 'lead.new' });
    pass('initial-outreach', 'First SMS queued (DRY RUN)');
  } catch (e) {
    fail('initial-outreach', e);
  }

  // 7. Working Drip
  try {
    await runWorkingDrip({
      ...baseEvent,
      kind: 'lead.new',
      dripStartDate: new Date().toISOString(),
      currentStep: -1,
    } as any);
    pass('working-drip', 'Drip step 1 queued for day 1 (DRY RUN)');
  } catch (e) {
    fail('working-drip', e);
  }

  // ── Summary ───────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const passed = results.filter((r) => r.ok).length;
  const errors = results.filter((r) => !r.ok).length;

  console.log('');
  console.log('═'.repeat(50));
  console.log('=== DRY RUN COMPLETE ===');
  console.log(`Agents fired: ${results.length}/${AGENT_IDS.length}`);
  console.log(`Errors: ${errors}`);
  console.log(`Time: ${elapsed}s`);
  console.log(errors === 0 ? 'All systems GO ✅' : `⚠️  ${errors} agent(s) failed — check above`);
  console.log('═'.repeat(50));

  process.exit(errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('💥 Simulation crashed:', err);
  process.exit(1);
});
