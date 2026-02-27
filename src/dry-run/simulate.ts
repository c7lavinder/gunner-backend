#!/usr/bin/env tsx
/**
 * Dry Run Simulation — full lead lifecycle end-to-end.
 * Run: npx tsx src/dry-run/simulate.ts
 */

import path from 'path';

// ── Environment (must be set before dynamic imports) ────────
process.env.DRY_RUN = 'true';
process.env.TENANT_ID = 'nah';
process.env.PLAYBOOK_DIR = path.resolve(__dirname, '../playbooks');
process.env.GHL_LOCATION_ID = 'dry-run-location';
process.env.SEND_WINDOW_START = '0';
process.env.SEND_WINDOW_END = '24';

// ── Fake contact data ───────────────────────────────────────
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
    initial_sms_sent: '',
  },
};

const AI_SCORE_JSON = JSON.stringify({
  factors: [
    { name: 'Motivation', passed: true, reason: 'Inherited property — motivated seller' },
    { name: 'Timeline', passed: true, reason: 'Wants quick sale' },
    { name: 'Property Condition', passed: true, reason: 'Default pass — evaluated on call' },
    { name: 'Price Flexibility', passed: true, reason: 'Open to offers' },
    { name: 'Decision Maker', passed: false, reason: 'Unknown — need to confirm on call' },
  ],
});

// ── Mock node-fetch via require cache (before any dynamic imports) ──
const mockFetch = async (url: string, _opts?: any) => ({
  ok: true,
  status: 200,
  json: async () => {
    if (typeof url === 'string' && url.includes('generativelanguage.googleapis.com')) {
      return { candidates: [{ content: { parts: [{ text: AI_SCORE_JSON }] } }] };
    }
    if (typeof url === 'string' && url.includes('/contacts/')) {
      return { contact: { ...FAKE_CONTACT } };
    }
    return {};
  },
  text: async () => '{}',
});

// Patch require cache for node-fetch
try {
  const fetchPath = require.resolve('node-fetch');
  require.cache[fetchPath] = {
    id: fetchPath,
    filename: fetchPath,
    loaded: true,
    exports: Object.assign(mockFetch, { default: mockFetch, __esModule: true }),
    parent: null,
    children: [],
    paths: [],
    path: path.dirname(fetchPath),
  } as any;
} catch {
  console.warn('⚠️  Could not patch node-fetch — GHL calls may fail');
}

// ── Dynamic imports (after env + mocks) ─────────────────────
async function main() {
  const { configureGHL } = await import('../integrations/ghl/client');
  const { configureAI } = await import('../integrations/ai/client');
  const { loadConfig } = await import('../playbook/config');
  const { registerToggle } = await import('../core/toggles');
  const { scoreLead } = await import('../intelligence/lead-scorer');
  const { runNewLeadPipeline } = await import('../agents/new-lead-pipeline');
  const { runLeadTagger } = await import('../agents/lead-tagger');
  const { runLeadNoter } = await import('../agents/lead-noter');
  const { runLeadTaskCreator } = await import('../agents/lead-task-creator');
  const { runInitialOutreach } = await import('../agents/initial-outreach');
  const { runWorkingDrip } = await import('../agents/working-drip');
  const { GunnerEvent } = await import('../core/event-bus') as any;

  // Configure with dummy values
  configureGHL('dry-run-token', 'dry-run-location');
  configureAI('dry-run-key');
  loadConfig();

  // Toggle Registration
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

  // Register bot toggles
  const BOT_IDS = ['bot-assign', 'bot-contact', 'bot-field', 'bot-note', 'bot-scorer', 'bot-sms', 'bot-stage', 'bot-tag', 'bot-task'];
  for (const id of BOT_IDS) {
    registerToggle({ id, kind: 'bot', label: id, description: `Dry run toggle for ${id}`, enabled: true });
  }

  // Simulation
  interface StepResult { agent: string; ok: boolean; message: string }
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

  console.log('\n🚀 GUNNER DRY RUN SIMULATION');
  console.log('═'.repeat(50));
  console.log(`Lead: Marcus Thompson | 615-555-0147`);
  console.log(`Property: 1847 Shelby Ave, Nashville, TN 37206`);
  console.log(`Source: PropertyLeads | Market: Nashville | Tenant: nah`);
  console.log('═'.repeat(50));
  console.log('');

  const baseEvent = {
    kind: 'opportunity.created' as const,
    tenantId: 'nah',
    contactId: 'dry-run-contact-001',
    opportunityId: 'dry-run-opp-001',
    contact: FAKE_CONTACT,
  };

  // 1. New Lead Pipeline
  try {
    await runNewLeadPipeline(baseEvent);
    pass('new-lead-pipeline', 'Lead ingested — Marcus Thompson');
  } catch (e) { fail('new-lead-pipeline', e); }

  // 2. Lead Scorer
  let score: any;
  try {
    score = await scoreLead(FAKE_CONTACT);
    pass('lead-scorer', `Scored as ${score.tier} (${score.score} points)`);
  } catch (e) { fail('lead-scorer', e); }

  const scoredEvent = { ...baseEvent, kind: 'lead.scored' as const, score, contact: FAKE_CONTACT };

  // 3. Lead Tagger
  try {
    await runLeadTagger(scoredEvent);
    pass('lead-tagger', `Tagged: ${score?.tier === 'HOT' ? 'hot-lead' : 'warm-lead'}`);
  } catch (e) { fail('lead-tagger', e); }

  // 4. Lead Noter
  try {
    await runLeadNoter(scoredEvent);
    pass('lead-noter', `Note written: Lead scored ${score?.tier ?? 'UNKNOWN'}...`);
  } catch (e) { fail('lead-noter', e); }

  // 5. Lead Task Creator
  try {
    await runLeadTaskCreator(scoredEvent);
    pass('lead-task-creator', 'Task created: Call within 15 min');
  } catch (e) { fail('lead-task-creator', e); }

  // 6. Initial Outreach
  try {
    await runInitialOutreach({ ...baseEvent, kind: 'lead.new' as const });
    pass('initial-outreach', 'First SMS queued (DRY RUN)');
  } catch (e) { fail('initial-outreach', e); }

  // 7. Working Drip
  try {
    await runWorkingDrip({
      ...baseEvent,
      kind: 'lead.new' as const,
      dripStartDate: new Date().toISOString(),
      currentStep: -1,
    } as any);
    pass('working-drip', 'Drip step 1 queued for day 1 (DRY RUN)');
  } catch (e) { fail('working-drip', e); }

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
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
