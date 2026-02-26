/**
 * Rate limiter — all GHL calls go through here.
 * Token bucket: sustained RPS + burst capacity.
 * Auto-retry on 429 with exponential backoff.
 */

const RPS = Number(process.env.GHL_RATE_LIMIT_RPS ?? 5);
const BURST = Number(process.env.GHL_RATE_LIMIT_BURST ?? 10);
const MAX_RETRIES = Number(process.env.GHL_RETRY_MAX ?? 5);
const BASE_BACKOFF_MS = Number(process.env.GHL_RETRY_BASE_MS ?? 2000);

let tokens = BURST;
let lastRefill = Date.now();
const queue: Array<() => void> = [];

function refill() {
  const now = Date.now();
  const elapsed = (now - lastRefill) / 1000;
  tokens = Math.min(BURST, tokens + elapsed * RPS);
  lastRefill = now;
}

function tryDrain() {
  refill();
  while (queue.length > 0 && tokens >= 1) {
    tokens -= 1;
    const next = queue.shift()!;
    next();
  }
}

setInterval(tryDrain, 200);

export function throttle<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const attempt = async (retries: number) => {
      try {
        resolve(await fn());
      } catch (err: any) {
        if (retries < MAX_RETRIES && (err?.message?.includes('429') || err?.message?.includes('503'))) {
          const delay = BASE_BACKOFF_MS * Math.pow(2, retries) * (0.8 + Math.random() * 0.4);
          console.warn(`[throttle] retrying in ${Math.round(delay)}ms (attempt ${retries + 1})`);
          setTimeout(() => queue.push(() => attempt(retries + 1)), delay);
        } else {
          reject(err);
        }
      }
    };
    queue.push(() => attempt(0));
    tryDrain();
  });
}
