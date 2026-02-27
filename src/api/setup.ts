/**
 * OAuth Setup Routes — handles GHL OAuth flow.
 */

import { Router } from 'express';
import { exchangeCodeForTokens, loadTokens } from '../integrations/ghl/oauth-store';
import { registerWebhooks } from '../integrations/ghl/webhook-register';
import pipelineRoutes from './pipelines';

const router = Router();

const SCOPES = [
  'contacts.readonly',
  'contacts.write',
  'opportunities.readonly',
  'opportunities.write',
  'conversations.readonly',
  'conversations.write',
  'locations.readonly',
  'users.readonly',
];

// GET /setup/oauth — redirect to GHL authorization
router.get('/oauth', (_req, res) => {
  const clientId = process.env.GHL_CLIENT_ID;
  if (!clientId) {
    res.status(500).json({ error: 'GHL_CLIENT_ID not configured' });
    return;
  }

  const redirectUri = 'https://gunner-backend-production.up.railway.app/setup/oauth/callback';
  const url = new URL('https://marketplace.leadconnectorhq.com/oauth/chooselocation');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('scope', SCOPES.join(' '));

  res.redirect(url.toString());
});

// GET /setup/oauth/callback — exchange code for tokens
router.get('/oauth/callback', async (req, res) => {
  const code = req.query.code as string | undefined;
  if (!code) {
    res.status(400).json({ error: 'Missing code parameter' });
    return;
  }

  const tokens = await exchangeCodeForTokens(code);
  if (!tokens) {
    res.status(500).json({ error: 'Failed to exchange code for tokens' });
    return;
  }

  // Auto-register webhooks
  try {
    await registerWebhooks(tokens.access_token, tokens.locationId);
  } catch (err) {
    console.error('[setup] webhook registration failed:', err);
  }

  res.json({
    success: true,
    message: 'OAuth tokens saved and webhooks registered',
    locationId: tokens.locationId,
  });
});

// POST /setup/oauth/register-webhooks — manually trigger webhook registration
router.post('/oauth/register-webhooks', async (_req, res) => {
  const tokens = loadTokens();
  if (!tokens) {
    res.status(400).json({ error: 'Not connected — authorize OAuth first' });
    return;
  }
  try {
    await registerWebhooks(tokens.access_token, tokens.locationId);
    res.json({ success: true, message: 'Webhook registration triggered' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /setup/oauth/status — check token status
router.get('/oauth/status', (_req, res) => {
  const tokens = loadTokens();
  if (!tokens) {
    res.json({ connected: false });
    return;
  }

  res.json({
    connected: true,
    locationId: tokens.locationId,
    expiresAt: new Date(tokens.expires_at).toISOString(),
    expired: Date.now() > tokens.expires_at,
  });
});

// Pipeline discovery
router.use('/pipelines', pipelineRoutes);

export default router;
