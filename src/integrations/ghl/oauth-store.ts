/**
 * OAuth Token Store — persists GHL OAuth tokens.
 * Primary: OAUTH_TOKENS env var (survives Railway deploys)
 * Fallback: disk file (for local dev)
 * Auto-refreshes expired tokens.
 */

import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const TOKEN_FILE = path.join(process.cwd(), 'data', 'oauth-tokens.json');

// Railway API for persisting env vars across deploys
const RAILWAY_TOKEN = process.env.RAILWAY_TOKEN || '';
const RAILWAY_PROJECT_ID = process.env.RAILWAY_PROJECT_ID || 'f379b683-e34d-4e0e-a91a-f64d0ab499ea';
const RAILWAY_SERVICE_ID = process.env.RAILWAY_SERVICE_ID || '';
const RAILWAY_ENV_ID = process.env.RAILWAY_ENVIRONMENT_ID || '';

interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix ms
  locationId: string;
}

function ensureDataDir(): void {
  const dir = path.dirname(TOKEN_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function loadTokens(): OAuthTokens | null {
  // 1. Try env var first (survives deploys)
  const envTokens = process.env.OAUTH_TOKENS;
  if (envTokens) {
    try {
      return JSON.parse(envTokens) as OAuthTokens;
    } catch { /* fall through */ }
  }

  // 2. Fallback to disk
  try {
    if (!fs.existsSync(TOKEN_FILE)) return null;
    return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8')) as OAuthTokens;
  } catch {
    return null;
  }
}

export function saveTokens(tokens: OAuthTokens): void {
  const json = JSON.stringify(tokens);

  // Always update in-memory env for current process
  process.env.OAUTH_TOKENS = json;

  // Persist to disk (local dev / current container)
  try {
    ensureDataDir();
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
  } catch (err) {
    console.error('[oauth-store] disk write failed (non-fatal):', err);
  }

  // Persist to Railway env var (survives deploys)
  persistToRailway(json).catch(err =>
    console.error('[oauth-store] Railway persist failed (non-fatal):', err)
  );

  console.log('[oauth-store] tokens saved');
}

async function persistToRailway(tokensJson: string): Promise<void> {
  if (!RAILWAY_TOKEN || !RAILWAY_SERVICE_ID || !RAILWAY_ENV_ID) {
    return; // not on Railway or not configured
  }

  const query = `
    mutation($input: VariableCollectionUpsertInput!) {
      variableCollectionUpsert(input: $input)
    }
  `;

  const res = await fetch('https://backboard.railway.app/graphql/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RAILWAY_TOKEN}`,
    },
    body: JSON.stringify({
      query,
      variables: {
        input: {
          projectId: RAILWAY_PROJECT_ID,
          serviceId: RAILWAY_SERVICE_ID,
          environmentId: RAILWAY_ENV_ID,
          variables: { OAUTH_TOKENS: tokensJson },
        },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Railway API ${res.status}: ${await res.text()}`);
  }

  const data = await res.json() as any;
  if (data.errors) {
    throw new Error(`Railway GraphQL: ${JSON.stringify(data.errors)}`);
  }

  console.log('[oauth-store] persisted to Railway env var');
}

export async function getValidAccessToken(): Promise<string | null> {
  const tokens = loadTokens();
  if (!tokens) return null;

  // If token expires in less than 5 minutes, refresh
  if (Date.now() > tokens.expires_at - 5 * 60 * 1000) {
    console.log('[oauth-store] token expired or expiring soon, refreshing…');
    const refreshed = await refreshAccessToken(tokens.refresh_token);
    if (!refreshed) return null;
    return refreshed.access_token;
  }

  return tokens.access_token;
}

async function refreshAccessToken(refreshToken: string): Promise<OAuthTokens | null> {
  const clientId = process.env.GHL_CLIENT_ID;
  const clientSecret = process.env.GHL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error('[oauth-store] GHL_CLIENT_ID or GHL_CLIENT_SECRET not set');
    return null;
  }

  try {
    const res = await fetch('https://services.leadconnectorhq.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) {
      console.error('[oauth-store] refresh failed:', res.status, await res.text());
      return null;
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      locationId: string;
    };

    const tokens: OAuthTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
      locationId: data.locationId,
    };

    saveTokens(tokens);
    return tokens;
  } catch (err) {
    console.error('[oauth-store] refresh error:', err);
    return null;
  }
}

// ── Proactive refresh timer ──
// Checks every 30 min and refreshes if expiring within 10 min.
let refreshInterval: ReturnType<typeof setInterval> | null = null;

export function startAutoRefresh(): void {
  if (refreshInterval) return;
  console.log('[oauth-store] auto-refresh started (every 30m)');
  refreshInterval = setInterval(async () => {
    const tokens = loadTokens();
    if (!tokens) return;
    const minutesLeft = (tokens.expires_at - Date.now()) / 60000;
    if (minutesLeft < 10) {
      console.log(`[oauth-store] proactive refresh — ${minutesLeft.toFixed(1)} min left`);
      await refreshAccessToken(tokens.refresh_token);
    }
  }, 30 * 60 * 1000);
  // Also run immediately on start
  (async () => {
    const tokens = loadTokens();
    if (!tokens) return;
    const minutesLeft = (tokens.expires_at - Date.now()) / 60000;
    if (minutesLeft < 10) {
      console.log(`[oauth-store] startup refresh — ${minutesLeft.toFixed(1)} min left`);
      await refreshAccessToken(tokens.refresh_token);
    }
  })();
}

export function stopAutoRefresh(): void {
  if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
}

export async function exchangeCodeForTokens(code: string): Promise<OAuthTokens | null> {
  const clientId = process.env.GHL_CLIENT_ID;
  const clientSecret = process.env.GHL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error('[oauth-store] GHL_CLIENT_ID or GHL_CLIENT_SECRET not set');
    return null;
  }

  try {
    const res = await fetch('https://services.leadconnectorhq.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
      }),
    });

    if (!res.ok) {
      console.error('[oauth-store] token exchange failed:', res.status, await res.text());
      return null;
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      locationId: string;
    };

    const tokens: OAuthTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + data.expires_in * 1000,
      locationId: data.locationId,
    };

    saveTokens(tokens);
    return tokens;
  } catch (err) {
    console.error('[oauth-store] exchange error:', err);
    return null;
  }
}
