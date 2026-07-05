// prompts.js — Error taxonomy, prompt builders, and JSON schemas for
// structured output. This is the "compiler spec" for the English language.
//
// Design notes:
// - All diagnostic *messages* are written in English (requirement #3).
// - Problem statements are written in Japanese (requirement #5).
// - Every diagnostic includes a `quote` (the exact offending substring) so the
//   frontend can locate the squiggle robustly even if the model's column count
//   drifts by a character or two.

// ---------------------------------------------------------------------------
// Error taxonomy — a compiler-style catalogue of English "errors".
// Codes starting with E are errors, W are warnings, I are info/suggestions.
// The `category` slug is what the gamification radar chart is grouped by.
// ---------------------------------------------------------------------------
export const TAXONOMY = [
  { code: 'E001', category: 'spelling',              severity: 'error',   label: 'Spelling' },
  { code: 'E002', category: 'subject-verb-agreement',severity: 'error',   label: 'Subject–verb agreement' },
  { code: 'E003', category: 'verb-tense',            severity: 'error',   label: 'Verb tense / aspect' },
  { code: 'E004', category: 'article',               severity: 'error',   label: 'Articles (a/an/the)' },
  { code: 'E005', category: 'preposition',           severity: 'error',   label: 'Prepositions' },
  { code: 'E006', category: 'noun-number',           severity: 'error',   label: 'Singular / plural nouns' },
  { code: 'E007', category: 'pronoun',               severity: 'error',   label: 'Pronoun / reference' },
  { code: 'E008', category: 'word-order',            severity: 'error',   label: 'Word order / syntax' },
  { code: 'E009', category: 'punctuation',           severity: 'error',   label: 'Punctuation' },
  { code: 'E010', category: 'capitalization',        severity: 'error',   label: 'Capitalization' },
  { code: 'E011', category: 'word-choice',           severity: 'error',   label: 'Word choice / diction' },
  { code: 'E012', category: 'missing-word',          severity: 'error',   label: 'Missing word' },
  { code: 'E013', category: 'extra-word',            severity: 'error',   label: 'Extra / redundant word' },
  { code: 'E014', category: 'conjunction',           severity: 'error',   label: 'Conjunctions / linking' },
  { code: 'E015', category: 'sentence-structure',    severity: 'error',   label: 'Fragment / run-on' },
  { code: 'W001', category: 'naturalness',           severity: 'warning', label: 'Naturalness / idiom' },
  { code: 'W002', category: 'wordiness',             severity: 'warning', label: 'Wordiness / redundancy' },
  { code: 'W003', category: 'register',              severity: 'warning', label: 'Tone / formality' },
  { code: 'I001', category: 'alternative',           severity: 'info',    label: 'Alternative phrasing' },
];

const TAXONOMY_TEXT = TAXONOMY
  .map((t) => `  ${t.code} [${t.severity}] ${t.category} — ${t.label}`)
  .join('\n');

// ---------------------------------------------------------------------------
// JSON schemas (structured output). Structured output requires
// additionalProperties:false and every property listed in `required`.
// ---------------------------------------------------------------------------
const diagnosticSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    line:        { type: 'integer', description: '1-based line number in the submitted text' },
    column:      { type: 'integer', description: '1-based start column of the offending text' },
    endColumn:   { type: 'integer', description: '1-based end column (exclusive) of the offending text' },
    quote:       { type: 'string',  description: 'The EXACT offending substring, copied verbatim from the text' },
    severity:    { type: 'string',  enum: ['error', 'warning', 'info'] },
    code:        { type: 'string',  description: 'A taxonomy code such as E002 or W001' },
    category:    { type: 'string',  description: 'The taxonomy category slug' },
    message:     { type: 'string',  description: 'Compiler-style explanation, in ENGLISH' },
    suggestion:  { type: 'string',  description: 'A concrete fix, in ENGLISH (may be empty)' },
  },
  required: ['line', 'column', 'endColumn', 'quote', 'severity', 'code', 'category', 'message', 'suggestion'],
};

const summarySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    errorCount:       { type: 'integer' },
    warningCount:     { type: 'integer' },
    infoCount:        { type: 'integer' },
    naturalnessScore: { type: 'integer', description: '0-100, how natural a native speaker would find it' },
    corrected:        { type: 'string',  description: 'A fully corrected, natural version of the whole text (ENGLISH)' },
    overallComment:   { type: 'string',  description: 'One or two encouraging sentences of feedback (ENGLISH)' },
  },
  required: ['errorCount', 'warningCount', 'infoCount', 'naturalnessScore', 'corrected', 'overallComment'],
};

export const checkSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    diagnostics: { type: 'array', items: diagnosticSchema },
    summary: summarySchema,
  },
  required: ['diagnostics', 'summary'],
};

export const problemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    titleJa:       { type: 'string',  description: '短いタイトル（日本語）' },
    promptJa:      { type: 'string',  description: '英語で書くべき内容の指示（日本語）' },
    hintsJa:       { type: 'array', items: { type: 'string' }, description: '文法のヒント（日本語、0〜3個）' },
    targetGrammar: { type: 'string',  description: 'The grammar point being practised, in English (e.g. "present perfect")' },
    difficulty:    { type: 'integer', description: '1 (easiest) to 5 (hardest)' },
    referenceEn:   { type: 'string',  description: 'A natural model answer in English (hidden from the learner until they ask)' },
  },
  required: ['titleJa', 'promptJa', 'hintsJa', 'targetGrammar', 'difficulty', 'referenceEn'],
};

export const newsSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    headlineEn:         { type: 'string' },
    bodyEn:             { type: 'string', description: '3-5 sentence plausible AI-news style briefing (ENGLISH)' },
    summaryJa:          { type: 'string', description: '内容の日本語要約' },
    discussionPromptJa: { type: 'string', description: 'このニュースに対する自分の考えを英語で書くための問い（日本語）' },
    glossary:           {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          term:      { type: 'string' },
          meaningJa: { type: 'string' },
        },
        required: ['term', 'meaningJa'],
      },
    },
  },
  required: ['headlineEn', 'bodyEn', 'summaryJa', 'discussionPromptJa', 'glossary'],
};

export const discussSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    diagnostics: { type: 'array', items: diagnosticSchema },
    summary: summarySchema,
    replyEn:            { type: 'string', description: 'A thoughtful reply that engages with the learner\'s ideas (ENGLISH)' },
    replyGlossJa:       { type: 'string', description: '返信のごく短い日本語要約' },
    followupQuestionEn: { type: 'string', description: 'One probing follow-up question to push the discussion forward (ENGLISH)' },
    vocabulary: {
      type: 'array',
      description: 'Up to 4 useful words/phrases the learner could have used',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          term:      { type: 'string' },
          meaningJa: { type: 'string' },
          exampleEn: { type: 'string' },
        },
        required: ['term', 'meaningJa', 'exampleEn'],
      },
    },
  },
  required: ['diagnostics', 'summary', 'replyEn', 'replyGlossJa', 'followupQuestionEn', 'vocabulary'],
};

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------
const CHECKER_RULES = `You are "engc", a strict but fair compiler for the English language used in a
learning tool. The learner is a Japanese speaker studying English. Analyse the
submitted text and report EVERY mistake as a compiler-style diagnostic.

Coverage — do NOT stop at obvious grammar. Report, comprehensively:
- hard errors: spelling, subject–verb agreement, verb tense/aspect, articles,
  prepositions, singular/plural, pronouns, word order, punctuation,
  capitalization, wrong word choice, missing words, extra words, conjunctions,
  sentence fragments and run-ons;
- warnings: unnatural phrasing / non-idiomatic English, wordiness, wrong tone or
  register;
- info: optional nicer alternatives.

Use these taxonomy codes (pick the closest one):
${TAXONOMY_TEXT}

Rules:
- EVERY "message" and "suggestion" MUST be written in English. Never Japanese.
- Write messages like a real compiler: state what is wrong and why, e.g.
  "singular subject 'he' requires 'goes', found 'go'".
- "quote" MUST be the exact substring copied verbatim from the learner's text
  (this is used to underline the error). "line"/"column"/"endColumn" are 1-based
  positions of that quote in the submitted text.
- If the text is already correct, return an empty diagnostics array and say so
  warmly in overallComment.
- "corrected" must be a fully natural rewrite of the WHOLE submission.
- Be encouraging in overallComment — this learner is trying.`;

export function buildCheckPrompt({ text, promptJa, targetGrammar }) {
  const context = promptJa
    ? `The learner was asked to write the following (instruction shown in Japanese):
"""${promptJa}"""
Target grammar point: ${targetGrammar || 'general'}.
Judge whether the English fulfils that task, in addition to correctness.\n\n`
    : '';
  return `${context}Here is the learner's submission. Report diagnostics for it.
Lines are 1-based; column 1 is the first character of a line.

<<<SUBMISSION
${text}
SUBMISSION`;
}

export const CHECKER_SYSTEM = CHECKER_RULES;

export function buildProblemPrompt({ level = 2, focusCategories = [], recentGrammar = [] }) {
  const focus = focusCategories.length
    ? `The learner is currently weakest at these areas (bias the exercise toward them): ${focusCategories.join(', ')}.`
    : 'Pick any suitable common grammar point.';
  const avoid = recentGrammar.length
    ? `Avoid repeating these recently-used grammar points: ${recentGrammar.join(', ')}.`
    : '';
  return `Create ONE short English writing exercise for a Japanese learner.

Difficulty target: ${level} out of 5.
${focus}
${avoid}

The exercise asks the learner to write 1–3 English sentences that express a given
idea. Write the instruction ("promptJa") in natural Japanese describing WHAT to
write (the situation / meaning), WITHOUT giving away the English. Do not include
the English answer in promptJa or hintsJa. Keep it realistic and a little fun.
"referenceEn" is a natural model answer (kept hidden from the learner).`;
}

export const PROBLEM_SYSTEM =
  'You are a creative, encouraging English teacher for Japanese learners. ' +
  'You design bite-sized writing exercises. Japanese fields must be natural Japanese; ' +
  'English fields must be natural English.';

export function buildNewsPrompt() {
  return `Invent ONE short, plausible, self-contained briefing about a recent-sounding
development in AI (models, agents, robotics, policy, research — your choice).
It must be understandable without external context and safe/neutral. Then provide
a Japanese summary and a Japanese discussion prompt asking the learner to write
their own opinion in English. Include a small glossary of 3-5 useful terms.`;
}

export const NEWS_SYSTEM =
  'You write concise, engaging, neutral AI-news style briefings for language learners. ' +
  'English fields in English; Japanese fields in Japanese.';

export function buildDiscussPrompt({ news, text }) {
  return `Discussion mode. The learner read this AI briefing:

HEADLINE: ${news?.headlineEn || '(unknown)'}
BODY: ${news?.bodyEn || '(unknown)'}

The learner then wrote their OWN opinion in English (below). Do two things:
1) Check their English exactly like the compiler (diagnostics + summary), using
   the same taxonomy and the same rules (English messages, verbatim quotes).
2) As a thoughtful discussion partner, engage GENUINELY with the substance of
   their opinion in "replyEn": acknowledge a point, add a perspective or gently
   challenge them, and end with "followupQuestionEn". Keep replyEn to ~3-5
   sentences of clear English. Also suggest up to 4 useful vocabulary items they
   could have used.

<<<OPINION
${text}
OPINION`;
}

export const DISCUSS_SYSTEM =
  CHECKER_RULES +
  '\n\nIn addition to compiling their English, you are a curious, well-informed ' +
  'discussion partner. Be substantive and respectful. replyEn/followupQuestionEn ' +
  'in English; replyGlossJa in Japanese.';
