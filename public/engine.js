// engine.js — client-side LLM engine for "direct mode" (BYOK, no backend).
// When enabled, the frontend calls the Anthropic API directly with the user's
// own key instead of going through the Node server. This is what the iOS
// (Capacitor) build uses so no server is needed. The same code also runs in a
// normal browser for testing.
//
// SECURITY: the key is the USER'S OWN key, stored on-device. In the web build
// it lives in localStorage; in the Capacitor/iOS build, swap the get/set below
// for the iOS Keychain (see README → iOS). Never ship a shared key in a binary.
(function () {
  const KEY_STORE = 'engc.apiKey';
  const MODE_STORE = 'engc.apiMode'; // 'server' | 'direct'
  const MODEL_DEFAULT = 'claude-opus-4-8';

  const MODELS = [
    { id: 'claude-opus-4-8',  label: 'Opus 4.8 — 最高性能（既定）' },
    { id: 'claude-sonnet-5',  label: 'Sonnet 5 — バランス（速い・安い）' },
    { id: 'claude-haiku-4-5', label: 'Haiku 4.5 — 最速・最安' },
    { id: 'claude-fable-5',   label: 'Fable 5 — 最上位（最も高価）' },
    { id: 'claude-opus-4-7',  label: 'Opus 4.7 — 旧世代Opus' },
  ];
  const ALLOWED = new Set(MODELS.map((m) => m.id));

  const TAXONOMY = [
    { code: 'E001', category: 'spelling',               severity: 'error',   label: 'Spelling' },
    { code: 'E002', category: 'subject-verb-agreement', severity: 'error',   label: 'Subject–verb agreement' },
    { code: 'E003', category: 'verb-tense',             severity: 'error',   label: 'Verb tense / aspect' },
    { code: 'E004', category: 'article',                severity: 'error',   label: 'Articles (a/an/the)' },
    { code: 'E005', category: 'preposition',            severity: 'error',   label: 'Prepositions' },
    { code: 'E006', category: 'noun-number',            severity: 'error',   label: 'Singular / plural nouns' },
    { code: 'E007', category: 'pronoun',                severity: 'error',   label: 'Pronoun / reference' },
    { code: 'E008', category: 'word-order',             severity: 'error',   label: 'Word order / syntax' },
    { code: 'E009', category: 'punctuation',            severity: 'error',   label: 'Punctuation' },
    { code: 'E010', category: 'capitalization',         severity: 'error',   label: 'Capitalization' },
    { code: 'E011', category: 'word-choice',            severity: 'error',   label: 'Word choice / diction' },
    { code: 'E012', category: 'missing-word',           severity: 'error',   label: 'Missing word' },
    { code: 'E013', category: 'extra-word',             severity: 'error',   label: 'Extra / redundant word' },
    { code: 'E014', category: 'conjunction',            severity: 'error',   label: 'Conjunctions / linking' },
    { code: 'E015', category: 'sentence-structure',     severity: 'error',   label: 'Fragment / run-on' },
    { code: 'W001', category: 'naturalness',            severity: 'warning', label: 'Naturalness / idiom' },
    { code: 'W002', category: 'wordiness',              severity: 'warning', label: 'Wordiness / redundancy' },
    { code: 'W003', category: 'register',               severity: 'warning', label: 'Tone / formality' },
    { code: 'I001', category: 'alternative',            severity: 'info',    label: 'Alternative phrasing' },
  ];
  const TAX_TEXT = TAXONOMY.map((t) => `  ${t.code} [${t.severity}] ${t.category} — ${t.label}`).join('\n');

  const ACTIONS = ['move', 'turn', 'wave', 'raise_arm', 'lower_arm', 'nod', 'shake_head', 'jump', 'spin', 'bow', 'sit', 'stand', 'point', 'clap', 'dance', 'look', 'wait', 'speak', 'idle'];
  const DIRECTIONS = ['forward', 'back', 'left', 'right', 'up', 'down', 'around', ''];
  const ACTION_HELP = `move(direction, count): walk. direction ∈ forward|back|left|right, count = steps
turn(direction): left|right|around
wave / raise_arm(direction: left|right|up) / lower_arm / nod / shake_head
jump(count) / spin(count) / bow / sit / stand / point(direction) / clap(count) / dance
look(direction) / wait(seconds) / speak(text): SAY the English text aloud / idle`;

  // ---- schemas ----------------------------------------------------------
  const diag = {
    type: 'object', additionalProperties: false,
    properties: {
      line: { type: 'integer' }, column: { type: 'integer' }, endColumn: { type: 'integer' },
      quote: { type: 'string' }, severity: { type: 'string', enum: ['error', 'warning', 'info'] },
      code: { type: 'string' }, category: { type: 'string' }, message: { type: 'string' }, suggestion: { type: 'string' },
    },
    required: ['line', 'column', 'endColumn', 'quote', 'severity', 'code', 'category', 'message', 'suggestion'],
  };
  const summary = {
    type: 'object', additionalProperties: false,
    properties: {
      errorCount: { type: 'integer' }, warningCount: { type: 'integer' }, infoCount: { type: 'integer' },
      naturalnessScore: { type: 'integer' }, corrected: { type: 'string' }, overallComment: { type: 'string' },
    },
    required: ['errorCount', 'warningCount', 'infoCount', 'naturalnessScore', 'corrected', 'overallComment'],
  };
  const checkSchema = { type: 'object', additionalProperties: false, properties: { diagnostics: { type: 'array', items: diag }, summary }, required: ['diagnostics', 'summary'] };
  const problemSchema = {
    type: 'object', additionalProperties: false,
    properties: {
      titleJa: { type: 'string' }, promptJa: { type: 'string' }, hintsJa: { type: 'array', items: { type: 'string' } },
      targetGrammar: { type: 'string' }, difficulty: { type: 'integer' }, referenceEn: { type: 'string' },
    },
    required: ['titleJa', 'promptJa', 'hintsJa', 'targetGrammar', 'difficulty', 'referenceEn'],
  };
  const newsSchema = {
    type: 'object', additionalProperties: false,
    properties: {
      headlineEn: { type: 'string' }, bodyEn: { type: 'string' }, summaryJa: { type: 'string' }, discussionPromptJa: { type: 'string' },
      glossary: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { term: { type: 'string' }, meaningJa: { type: 'string' } }, required: ['term', 'meaningJa'] } },
    },
    required: ['headlineEn', 'bodyEn', 'summaryJa', 'discussionPromptJa', 'glossary'],
  };
  const discussSchema = {
    type: 'object', additionalProperties: false,
    properties: {
      diagnostics: { type: 'array', items: diag }, summary,
      replyEn: { type: 'string' }, replyGlossJa: { type: 'string' }, followupQuestionEn: { type: 'string' },
      vocabulary: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { term: { type: 'string' }, meaningJa: { type: 'string' }, exampleEn: { type: 'string' } }, required: ['term', 'meaningJa', 'exampleEn'] } },
    },
    required: ['diagnostics', 'summary', 'replyEn', 'replyGlossJa', 'followupQuestionEn', 'vocabulary'],
  };
  const programItem = {
    type: 'object', additionalProperties: false,
    properties: { action: { type: 'string', enum: ACTIONS }, direction: { type: 'string', enum: DIRECTIONS }, count: { type: 'integer' }, text: { type: 'string' }, seconds: { type: 'number' } },
    required: ['action', 'direction', 'count', 'text', 'seconds'],
  };
  const commandTaskSchema = {
    type: 'object', additionalProperties: false,
    properties: { titleJa: { type: 'string' }, taskJa: { type: 'string' }, hintsJa: { type: 'array', items: { type: 'string' } }, difficulty: { type: 'integer' }, sampleEn: { type: 'string' } },
    required: ['titleJa', 'taskJa', 'hintsJa', 'difficulty', 'sampleEn'],
  };
  const commandSchema = {
    type: 'object', additionalProperties: false,
    properties: {
      diagnostics: { type: 'array', items: diag }, summary, program: { type: 'array', items: programItem },
      reisiaLineEn: { type: 'string' }, reisiaLineJa: { type: 'string' }, taskSuccess: { type: 'boolean' }, taskComment: { type: 'string' },
    },
    required: ['diagnostics', 'summary', 'program', 'reisiaLineEn', 'reisiaLineJa', 'taskSuccess', 'taskComment'],
  };

  // ---- prompts (mirror server/prompts.js) --------------------------------
  const CHECKER_RULES = `You are "engc", a strict but fair compiler for the English language used in a learning tool. The learner is a Japanese speaker studying English. Analyse the submitted text and report EVERY mistake as a compiler-style diagnostic.

Coverage — do NOT stop at obvious grammar. Report comprehensively: spelling, subject–verb agreement, verb tense/aspect, articles, prepositions, singular/plural, pronouns, word order, punctuation, capitalization, wrong word choice, missing words, extra words, conjunctions, fragments/run-ons; warnings for unnatural phrasing, wordiness, wrong tone; info for nicer alternatives.

Use these taxonomy codes (pick the closest one):
${TAX_TEXT}

Rules:
- EVERY "message" and "suggestion" MUST be in English. Never Japanese.
- Write messages like a real compiler (what is wrong and why).
- "quote" MUST be the exact substring copied verbatim from the text (used to underline). line/column/endColumn are 1-based.
- If already correct, return empty diagnostics and say so warmly in overallComment.
- "corrected" must be a fully natural rewrite of the WHOLE submission. Be encouraging.`;

  function checkUser({ text, promptJa, targetGrammar }) {
    const ctx = promptJa ? `The learner was asked (Japanese): """${promptJa}""" Target grammar: ${targetGrammar || 'general'}. Judge whether the English fulfils that task too.\n\n` : '';
    return `${ctx}Report diagnostics for the learner's submission. Lines 1-based; column 1 is the first character.\n\n<<<SUBMISSION\n${text}\nSUBMISSION`;
  }

  const OPS = {
    '/api/problem': {
      schema: problemSchema, maxTokens: 1500,
      system: 'You are a creative, encouraging English teacher for Japanese learners. Japanese fields natural Japanese; English fields natural English.',
      user: ({ level = 2, focusCategories = [], recentGrammar = [] }) => {
        const focus = focusCategories.length ? `Bias the exercise toward the learner's weak areas: ${focusCategories.join(', ')}.` : 'Pick any suitable common grammar point.';
        const avoid = recentGrammar.length ? `Avoid these recent grammar points: ${recentGrammar.join(', ')}.` : '';
        return `Create ONE short English writing exercise for a Japanese learner.\nDifficulty: ${level}/5.\n${focus} ${avoid}\nThe learner writes 1–3 English sentences expressing a given idea. Write the instruction ("promptJa") in natural Japanese describing WHAT to write, WITHOUT giving away the English. "referenceEn" is a hidden model answer.`;
      },
    },
    '/api/check': {
      schema: checkSchema, maxTokens: 4000, system: CHECKER_RULES, user: checkUser,
    },
    '/api/news': {
      schema: newsSchema, maxTokens: 1500,
      system: 'You write concise, engaging, neutral AI-news style briefings for language learners. English fields English; Japanese fields Japanese.',
      user: () => 'Invent ONE short, plausible, self-contained, neutral AI briefing (models/agents/robotics/policy/research). Then a Japanese summary and a Japanese discussion prompt asking the learner to write their own opinion in English. Include a 3-5 term glossary.',
    },
    '/api/discuss': {
      schema: discussSchema, maxTokens: 5000,
      system: CHECKER_RULES + '\n\nYou are also a curious, well-informed discussion partner. replyEn/followupQuestionEn in English; replyGlossJa in Japanese.',
      user: ({ news, text }) => `Discussion mode. The learner read:\nHEADLINE: ${news?.headlineEn || '(unknown)'}\nBODY: ${news?.bodyEn || '(unknown)'}\n\nDo two things: (1) check their English exactly like the compiler (diagnostics + summary). (2) Engage genuinely with their opinion in replyEn (~3-5 sentences), end with followupQuestionEn, and suggest up to 4 vocabulary items.\n\n<<<OPINION\n${text}\nOPINION`,
    },
    '/api/command-task': {
      schema: commandTaskSchema, maxTokens: 1200,
      system: 'You design playful "program the robot in English" exercises for Japanese learners. Japanese fields Japanese; English fields English.',
      user: ({ level = 2, recent = [] }) => {
        const avoid = recent.length ? `Avoid repeating: ${recent.join(' / ')}.` : '';
        return `Create ONE task where the learner commands an android "Reisia" in English to perform a short sequence of PHYSICAL actions.\nDifficulty ${level}/5. ${avoid}\nDescribe in Japanese ("taskJa") WHAT Reisia should do (do NOT reveal the English). Must be achievable with:\n${ACTION_HELP}\nsampleEn = one correct English command sequence.`;
      },
    },
    '/api/command': {
      schema: commandSchema, maxTokens: 4000,
      system: CHECKER_RULES + '\n\nYou also act as the runtime for an android named Reisia: translate the learner\'s English commands into an ordered action program, parsing literally so incorrect English yields incorrect actions. reisiaLineEn in English; reisiaLineJa in Japanese.',
      user: ({ task, text }) => `The learner is PROGRAMMING an android named Reisia in English. (1) COMPILE their English (diagnostics + summary). (2) PARSE their ACTUAL English into an ordered "program" using ONLY this action set (fill unused fields with ""/1/0):\n${ACTION_HELP}\nMap faithfully to what they WROTE. If they tell Reisia to SAY something, use speak(text). (3) JUDGE taskSuccess vs the task; give taskComment; reisiaLineEn is a short in-character reaction.\n\nTASK (Japanese): """${task || '(free play)'}"""\n\n<<<COMMANDS\n${text}\nCOMMANDS`,
    },
  };

  // ---- key / mode --------------------------------------------------------
  // SEAM: replace these two with iOS Keychain in the Capacitor build.
  function getKey() { try { return localStorage.getItem(KEY_STORE) || ''; } catch { return ''; } }
  function setKey(k) { try { k ? localStorage.setItem(KEY_STORE, k) : localStorage.removeItem(KEY_STORE); } catch {} }
  function hasKey() { return !!getKey(); }
  function isNative() { try { return !!(window.Capacitor && (window.Capacitor.isNativePlatform ? window.Capacitor.isNativePlatform() : true)); } catch { return false; } }
  function getMode() {
    try { const s = localStorage.getItem(MODE_STORE); if (s) return s; } catch {}
    return isNative() ? 'direct' : 'server'; // native (iOS/Capacitor) has no backend
  }
  function setMode(m) { try { localStorage.setItem(MODE_STORE, m === 'direct' ? 'direct' : 'server'); } catch {} }

  // ---- usage tracking (client-side) -------------------------------------
  const PRICING = { 'claude-opus-4-8': { in: 5, out: 25 }, 'claude-opus-4-7': { in: 5, out: 25 }, 'claude-opus-4-6': { in: 5, out: 25 }, 'claude-sonnet-5': { in: 3, out: 15 }, 'claude-sonnet-4-6': { in: 3, out: 15 }, 'claude-haiku-4-5': { in: 1, out: 5 }, 'claude-fable-5': { in: 10, out: 50 } };
  const U = { startedAt: Date.now(), requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, byModel: {}, history: [], rateLimit: null };
  function recordUsage(usage, headers, model) {
    U.requests++;
    const inp = usage?.input_tokens || 0, out = usage?.output_tokens || 0;
    U.inputTokens += inp; U.outputTokens += out;
    U.cacheReadTokens += usage?.cache_read_input_tokens || 0; U.cacheCreationTokens += usage?.cache_creation_input_tokens || 0;
    const m = (U.byModel[model] = U.byModel[model] || { requests: 0, inputTokens: 0, outputTokens: 0 });
    m.requests++; m.inputTokens += inp; m.outputTokens += out;
    U.history.push({ t: Date.now(), tokens: inp + out }); if (U.history.length > 200) U.history.shift();
    // rate-limit headers may be hidden by CORS in a plain browser; available in native
    try {
      const g = (k) => { const v = headers && headers.get ? headers.get(k) : null; return v == null ? null : Number(v); };
      const metric = (b) => { const limit = g(`anthropic-ratelimit-${b}-limit`); const remaining = g(`anthropic-ratelimit-${b}-remaining`); const reset = headers && headers.get ? headers.get(`anthropic-ratelimit-${b}-reset`) : null; return (limit == null && remaining == null && !reset) ? null : { limit, remaining, reset }; };
      const rl = { requests: metric('requests'), tokens: metric('tokens'), inputTokens: metric('input-tokens'), outputTokens: metric('output-tokens') };
      if (rl.requests || rl.tokens || rl.inputTokens || rl.outputTokens) U.rateLimit = rl;
    } catch {}
  }
  function usageSnapshot() {
    let total = 0, known = false;
    for (const [model, m] of Object.entries(U.byModel)) { const p = PRICING[model]; if (!p) continue; known = true; total += (m.inputTokens / 1e6) * p.in + (m.outputTokens / 1e6) * p.out; }
    const secs = (r) => { if (!r) return null; const t = Date.parse(r); return Number.isNaN(t) ? (Number.isFinite(Number(r)) ? Math.max(0, Math.round(Number(r))) : null) : Math.max(0, Math.round((t - Date.now()) / 1000)); };
    const rl = U.rateLimit ? { requests: withSecs(U.rateLimit.requests), tokens: withSecs(U.rateLimit.tokens), inputTokens: withSecs(U.rateLimit.inputTokens), outputTokens: withSecs(U.rateLimit.outputTokens) } : null;
    function withSecs(mm) { return mm ? Object.assign({}, mm, { resetSec: secs(mm.reset) }) : null; }
    return { model: MODEL_DEFAULT, startedAt: U.startedAt, session: { requests: U.requests, inputTokens: U.inputTokens, outputTokens: U.outputTokens, cacheReadTokens: U.cacheReadTokens, cacheCreationTokens: U.cacheCreationTokens, byModel: U.byModel, estCostUSD: total, pricingKnown: known }, rateLimit: rl, history: U.history.slice(-60) };
  }

  // ---- the direct Anthropic call ----------------------------------------
  async function callJSON({ system, user, schema, maxTokens, model }) {
    const key = getKey();
    if (!key) throw new Error('APIキーが未設定です（⚙️ 設定で入力してください）');
    const useModel = ALLOWED.has(model) ? model : MODEL_DEFAULT;
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: useModel, max_tokens: maxTokens || 4000, system, messages: [{ role: 'user', content: user }], output_config: { format: { type: 'json_schema', schema } } }),
    });
    const bodyText = await res.text();
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { msg = JSON.parse(bodyText).error?.message || msg; } catch {}
      if (res.status === 401) msg = 'APIキーが無効です（401）。⚙️ 設定で確認してください。';
      throw new Error(msg);
    }
    const data = JSON.parse(bodyText);
    try { recordUsage(data.usage, res.headers, useModel); } catch {}
    if (data.stop_reason === 'refusal') throw new Error('The model declined to respond to this input.');
    const textBlock = (data.content || []).find((b) => b.type === 'text');
    if (!textBlock) throw new Error('Model returned no text content.');
    return JSON.parse(textBlock.text);
  }

  // ---- public API (mirrors the server endpoints) ------------------------
  async function call(path, body) {
    if (path === '/api/check' && !(body.text || '').trim()) {
      return { diagnostics: [], summary: { errorCount: 0, warningCount: 0, infoCount: 0, naturalnessScore: 0, corrected: '', overallComment: 'Nothing to compile yet — write something first!' } };
    }
    const op = OPS[path];
    if (!op) throw new Error('Unknown operation: ' + path);
    return callJSON({ system: op.system, user: op.user(body || {}), schema: op.schema, maxTokens: op.maxTokens, model: body && body.model });
  }

  function config() {
    return { model: MODEL_DEFAULT, models: MODELS, taxonomy: TAXONOMY, actions: ACTIONS, hasCredentials: hasKey(), direct: true };
  }

  window.EngcEngine = { call, config, usage: usageSnapshot, getKey, setKey, hasKey, getMode, setMode, MODELS };
})();
