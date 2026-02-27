/**
 * Gemini AI Client Wrapper
 *
 * Clean abstraction over @google/generative-ai.
 * - generateText: returns raw string
 * - generateJSON<T>: parses response as JSON
 * - 1 retry on failure, 10s timeout
 * - Respects DRY_RUN
 * - Logs token usage
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { isDryRun } from '../../core/dry-run';

const MODEL_NAME = 'gemini-1.5-flash';

let _client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!_client) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY not set');
    _client = new GoogleGenerativeAI(key);
  }
  return _client;
}

async function callGemini(prompt: string, systemPrompt?: string): Promise<string> {
  const model = getClient().getGenerativeModel({
    model: MODEL_NAME,
    ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
  });

  const result = await Promise.race([
    model.generateContent(prompt),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Gemini timeout (10s)')), 10_000)),
  ]);

  const response = result.response;
  const usage = response.usageMetadata;
  if (usage) {
    console.log(`[gemini] tokens — prompt: ${usage.promptTokenCount}, completion: ${usage.candidatesTokenCount}, total: ${usage.totalTokenCount}`);
  }

  return response.text();
}

export async function generateText(prompt: string, systemPrompt?: string): Promise<string> {
  if (isDryRun()) return '';

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await callGemini(prompt, systemPrompt);
    } catch (err) {
      lastError = err as Error;
      console.warn(`[gemini] attempt ${attempt + 1} failed: ${lastError.message}`);
    }
  }
  throw lastError!;
}

export async function generateJSON<T>(prompt: string, systemPrompt?: string): Promise<T> {
  const raw = await generateText(prompt, systemPrompt);
  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  return JSON.parse(cleaned) as T;
}
