/**
 * GHL Client — raw HTTP only. No business logic. No decisions.
 * All callers go through the rate limiter.
 */

import fetch from 'node-fetch';
import { throttle } from '../../core/throttle';

const BASE = 'https://services.leadconnectorhq.com';

let _token: string | null = null;
let _locationId: string | null = null;

export function configureGHL(token: string, locationId: string) {
  _token = token;
  _locationId = locationId;
}

function headers() {
  if (!_token) throw new Error('GHL client not configured — call configureGHL() first');
  return {
    Authorization: `Bearer ${_token}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
}

export async function ghlGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  return throttle(async () => {
    const url = new URL(`${BASE}${path}`);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString(), { headers: headers() });
    if (!res.ok) throw new Error(`GHL GET ${path} → ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  });
}

export async function ghlPost<T>(path: string, body: unknown): Promise<T> {
  return throttle(async () => {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`GHL POST ${path} → ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  });
}

export async function ghlPut<T>(path: string, body: unknown): Promise<T> {
  return throttle(async () => {
    const res = await fetch(`${BASE}${path}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`GHL PUT ${path} → ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  });
}

export function getLocationId(): string {
  if (!_locationId) throw new Error('GHL locationId not configured');
  return _locationId;
}
