// usage.js — tracks Claude API rate limits + token consumption for this server
// process, so the frontend can render a "利用状況" dashboard.
//
// The Anthropic API reports the org's real rate limits on every /v1/messages
// response via `anthropic-ratelimit-*` headers; token counts come from the
// response `usage` object. We snapshot both here.

// USD per 1,000,000 tokens (input / output). Used only for a rough cost estimate.
const PRICING = {
  'claude-opus-4-8':   { in: 5,  out: 25 },
  'claude-opus-4-7':   { in: 5,  out: 25 },
  'claude-opus-4-6':   { in: 5,  out: 25 },
  'claude-sonnet-5':   { in: 3,  out: 15 },
  'claude-sonnet-4-6': { in: 3,  out: 15 },
  'claude-haiku-4-5':  { in: 1,  out: 5 },
  'claude-fable-5':    { in: 10, out: 50 },
};

const session = {
  startedAt: Date.now(),
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  byModel: {},          // model -> { requests, inputTokens, outputTokens }
  history: [],          // [{ t, tokens }] recent per-call totals
};
let rateLimit = null;   // last snapshot of rate-limit headers

function num(h, key) {
  const v = h?.get ? h.get(key) : undefined;
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseRateLimit(headers) {
  if (!headers?.get) return null;
  const metric = (base) => {
    const limit = num(headers, `anthropic-ratelimit-${base}-limit`);
    const remaining = num(headers, `anthropic-ratelimit-${base}-remaining`);
    const reset = headers.get(`anthropic-ratelimit-${base}-reset`) || null;
    if (limit == null && remaining == null && !reset) return null;
    return { limit, remaining, reset };
  };
  const rl = {
    requests: metric('requests'),
    tokens: metric('tokens'),
    inputTokens: metric('input-tokens'),
    outputTokens: metric('output-tokens'),
    retryAfter: num(headers, 'retry-after'),
    capturedAt: Date.now(),
  };
  const any = rl.requests || rl.tokens || rl.inputTokens || rl.outputTokens;
  return any ? rl : null;
}

export function record({ usage, headers, model }) {
  session.requests++;
  const inp = usage?.input_tokens || 0;
  const out = usage?.output_tokens || 0;
  session.inputTokens += inp;
  session.outputTokens += out;
  session.cacheReadTokens += usage?.cache_read_input_tokens || 0;
  session.cacheCreationTokens += usage?.cache_creation_input_tokens || 0;

  const m = (session.byModel[model] = session.byModel[model] || { requests: 0, inputTokens: 0, outputTokens: 0 });
  m.requests++; m.inputTokens += inp; m.outputTokens += out;

  session.history.push({ t: Date.now(), tokens: inp + out });
  if (session.history.length > 200) session.history.shift();

  const rl = parseRateLimit(headers);
  if (rl) rateLimit = rl;
}

function estCost() {
  let total = 0;
  let known = false;
  for (const [model, m] of Object.entries(session.byModel)) {
    const p = PRICING[model];
    if (!p) continue;
    known = true;
    total += (m.inputTokens / 1e6) * p.in + (m.outputTokens / 1e6) * p.out;
  }
  // cache read is ~0.1x input, cache write ~1.25x input (use primary model's rate)
  const primary = PRICING[Object.keys(session.byModel)[0]];
  if (primary) {
    total += (session.cacheReadTokens / 1e6) * primary.in * 0.1;
    total += (session.cacheCreationTokens / 1e6) * primary.in * 1.25;
  }
  return { estCostUSD: total, pricingKnown: known };
}

function secsUntil(reset) {
  if (!reset) return null;
  const t = Date.parse(reset);
  if (!Number.isNaN(t)) return Math.max(0, Math.round((t - Date.now()) / 1000));
  const n = Number(reset); // some proxies return seconds
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
}

export function snapshot() {
  const { estCostUSD, pricingKnown } = estCost();
  let rl = null;
  if (rateLimit) {
    const withSecs = (mm) => (mm ? { ...mm, resetSec: secsUntil(mm.reset) } : null);
    rl = {
      requests: withSecs(rateLimit.requests),
      tokens: withSecs(rateLimit.tokens),
      inputTokens: withSecs(rateLimit.inputTokens),
      outputTokens: withSecs(rateLimit.outputTokens),
      retryAfter: rateLimit.retryAfter,
    };
  }
  return {
    startedAt: session.startedAt,
    session: {
      requests: session.requests,
      inputTokens: session.inputTokens,
      outputTokens: session.outputTokens,
      cacheReadTokens: session.cacheReadTokens,
      cacheCreationTokens: session.cacheCreationTokens,
      byModel: session.byModel,
      estCostUSD, pricingKnown,
    },
    rateLimit: rl,
    history: session.history.slice(-60),
  };
}
