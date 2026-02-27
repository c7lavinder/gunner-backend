import 'dotenv/config';
import http from 'http';
import express from 'express';
import path from 'path';
import { loadConfig } from './playbook/config';
import { configureGHL } from './integrations/ghl/client';
import { configureAI } from './integrations/ai/client';
import './core/register-toggles';
import { registerAll } from './core/registry';
import { wireTriggers } from './core/triggers';
import { startCrmSync } from './core/crm-sync';
import controlRouter from './api/control';
import auditRouter from './api/audit';
import webhookRouter from './api/webhooks';
import intelligenceRouter from './api/intelligence';
import setupRouter from './api/setup';
import { startIntelligencePoller } from './agents/intelligence-poller';
import { startIntelligenceResearcher } from './agents/intelligence-researcher';
import { setupWebSocket } from './core/ws';

async function main() {
  // 1. Load config (all env vars → typed config object)
  const config = loadConfig();

  // 2. Configure integrations
  configureGHL(process.env.GHL_TOKEN ?? '', config.locationId);
  configureAI(process.env.GEMINI_API_KEY ?? '', process.env.AI_MODEL);

  // 3. Register all agents + toggles
  registerAll();

  // 4. Wire triggers (event → agent)
  wireTriggers();

  // 5. Start server
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok', dryRun: process.env.DRY_RUN === 'true' }));

  // Dashboard static pages
  const dashboardDir = path.join(__dirname, '..', 'docs', 'dashboard');
  app.get('/dashboard', (_req, res) => res.sendFile(path.join(dashboardDir, 'index.html')));
  app.get('/dashboard/audit', (_req, res) => res.sendFile(path.join(dashboardDir, 'audit.html')));
  app.get('/dashboard/controls', (_req, res) => res.sendFile(path.join(dashboardDir, 'controls.html')));

  app.use('/api/control', controlRouter);
  app.use('/api/audit', auditRouter);
  app.use('/webhooks', webhookRouter);
  app.use('/api/intelligence', intelligenceRouter);
  app.use('/setup', setupRouter);

  const port = Number(process.env.PORT ?? 3000);
  const server = http.createServer(app);
  setupWebSocket(server);
  server.listen(port, () => console.log(`[server] listening on port ${port}`));

  // 6. Start intelligence agents
  startIntelligencePoller();
  startIntelligenceResearcher();

  // 7. Start CRM sync (5s after boot)
  startCrmSync();

  console.log('[server] Gunner Backend ready');
  console.log(`[server] DRY_RUN=${process.env.DRY_RUN ?? 'false'}`);
}

main().catch((err) => {
  console.error('[server] fatal startup error:', err);
  process.exit(1);
});
