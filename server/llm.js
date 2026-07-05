// llm.js — thin wrapper around the Anthropic SDK that always returns validated
// JSON via structured outputs.
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.ENGC_MODEL || 'claude-opus-4-8';

// The zero-arg client resolves credentials from the environment
// (ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an `ant auth login` profile).
const client = new Anthropic();

/**
 * Call Claude and get back JSON that conforms to `schema`.
 * Uses structured outputs (output_config.format) so the model is constrained to
 * emit valid JSON — no fragile prompt-parsing.
 */
export async function callJSON({ system, user, schema, maxTokens = 4000 }) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { format: { type: 'json_schema', schema } },
  });

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
