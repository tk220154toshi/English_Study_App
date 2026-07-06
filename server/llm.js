// llm.js — thin wrapper around the Anthropic SDK that always returns validated
// JSON via structured outputs.
import Anthropic from '@anthropic-ai/sdk';
import { record as recordUsage } from './usage.js';

const MODEL = process.env.ENGC_MODEL || 'claude-opus-4-8';

// Models the UI is allowed to pick from (id + Japanese label describing the
// speed/cost/quality tradeoff). Requests may specify any of these per call.
export const MODELS = [
  { id: 'claude-opus-4-8',  label: 'Opus 4.8 — 最高性能（既定）' },
  { id: 'claude-sonnet-5',  label: 'Sonnet 5 — バランス（速い・安い）' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5 — 最速・最安' },
  { id: 'claude-fable-5',   label: 'Fable 5 — 最上位（最も高価）' },
  { id: 'claude-opus-4-7',  label: 'Opus 4.7 — 旧世代Opus' },
];
const ALLOWED = new Set(MODELS.map((m) => m.id));
ALLOWED.add(MODEL); // whatever ENGC_MODEL is, always allow it

// The zero-arg client resolves credentials from the environment
// (ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an `ant auth login` profile).
const client = new Anthropic();

/**
 * Call Claude and get back JSON that conforms to `schema`.
 * Uses structured outputs (output_config.format) so the model is constrained to
 * emit valid JSON — no fragile prompt-parsing.
 */
export async function callJSON({ system, user, schema, maxTokens = 4000, model }) {
  const useModel = ALLOWED.has(model) ? model : MODEL;
  // .withResponse() also hands us the raw HTTP response so we can read the
  // anthropic-ratelimit-* headers for the usage dashboard.
  const { data: response, response: httpRes } = await client.messages.create({
    model: useModel,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { format: { type: 'json_schema', schema } },
  }).withResponse();

  try {
    recordUsage({ usage: response.usage, headers: httpRes?.headers, model: useModel });
  } catch { /* usage tracking is best-effort */ }

  if (response.stop_reason === 'refusal') {
    throw new Error('The model declined to respond to this input.');
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('Model returned no text content.');

  try {
    return JSON.parse(textBlock.text);
  } catch (err) {
    throw new Error(`Model returned invalid JSON: ${err.message}`);
  }
}

export { MODEL };
