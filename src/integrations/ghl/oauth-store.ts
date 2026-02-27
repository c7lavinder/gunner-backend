/**
 * OAuth Token Store — persists GHL OAuth tokens to disk.
 * Auto-refreshes expired tokens.
 */

import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const TOKEN_FILE = path.join(process.cwd(), 'data', 'oauth-tokens.json');

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
  try {
    if (!fs.existsSync(TOKEN_FILE)) return null;
    return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8')) as OAuthTokens;
  } catch {
    return null;
  }
}

export function saveTokens(tokens: OAuthTokens): void {
  ensureDataDir();
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
  console.log('[oauth-store] tokens saved');
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
