/**
 * AI Client — raw calls only. No prompts live here.
 * Prompts are owned by the intelligence layer (agents/intelligence/).
 */

import fetch from 'node-fetch';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

let _apiKey: string | null = null;
let _model = 'gemini-2.0-flash';

export function configureAI(apiKey: string, model?: string) {
  _apiKey = apiKey;
  if (model) _model = model;
}

export async function aiComplete(prompt: string, systemInstruction?: string): Promise<string> {
  if (!_apiKey) throw new Error('AI client not configured — call configureAI() first');

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    ...(systemInstruction && {
      systemInstruction: { parts: [{ text: systemInstruction }] },
    }),
    generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
  };

  const res = await fetch(
    `${GEMINI_BASE}/models/${_model}:generateContent?key=${_apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );

  if (!res.ok) throw new Error(`AI request failed: ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as any;
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}
