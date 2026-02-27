/**
 * Webhook Auto-Registration — registers GHL webhooks after OAuth.
 * Idempotent: checks existing webhooks before creating.
 */

import fetch from 'node-fetch';

const BASE = 'https://services.leadconnectorhq.com';
const WEBHOOK_URL = 'https://gunner-backend-production.up.railway.app/webhooks/ghl';
const EVENTS = [
  'ContactCreate',
  'OpportunityCreate',
  'OpportunityStageUpdate',
  'InboundMessage',
  'TaskComplete',
];

interface WebhookEntry {
  id: string;
  url: string;
  events: string[];
}

interface WebhookListResponse {
  webhooks: WebhookEntry[];
}

export async function registerWebhooks(accessToken: string, locationId: string): Promise<void> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };

  try {
    // Check existing webhooks
    const listRes = await fetch(`${BASE}/webhooks/?locationId=${locationId}`, { headers });
    if (!listRes.ok) {
      console.error('[webhook-register] list failed:', listRes.status, await listRes.text());
      return;
    }

    const { webhooks } = (await listRes.json()) as WebhookListResponse;
    const existing = webhooks?.find((w) => w.url === WEBHOOK_URL);

    if (existing) {
      console.log('[webhook-register] webhook already exists, id:', existing.id);
      return;
    }

    // Create webhook
    const createRes = await fetch(`${BASE}/webhooks/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        url: WEBHOOK_URL,
        events: EVENTS,
        locationId,
      }),
    });

    if (!createRes.ok) {
      console.error('[webhook-register] create failed:', createRes.status, await createRes.text());
      return;
    }

    console.log('[webhook-register] webhook registered successfully');
  } catch (err) {
    console.error('[webhook-register] error:', err);
  }
}
