// index.js — Express server for EngC.
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { callJSON, MODEL } from './llm.js';
import { snapshot as usageSnapshot } from './usage.js';
import {
  CHECKER_SYSTEM, buildCheckPrompt, checkSchema,
  PROBLEM_SYSTEM, buildProblemPrompt, problemSchema,
  NEWS_SYSTEM, buildNewsPrompt, newsSchema,
  DISCUSS_SYSTEM, buildDiscussPrompt, discussSchema,
  TAXONOMY,
} from './prompts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 5173;

// Guard: surface a friendly message if there's no way to authenticate.
function hasCredentials() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

// Wrap async handlers so thrown errors become clean 500s.
const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal error' });
  });
};

// Expose config + the taxonomy so the frontend can render legends/charts.
app.get('/api/config', (req, res) => {
  res.json({ model: MODEL, hasCredentials: hasCredentials(), taxonomy: TAXONOMY });
});

// API usage + rate-limit snapshot for the dashboard.
app.get('/api/usage', (req, res) => {
  res.json({ model: MODEL, ...usageSnapshot() });
});

// Generate a grammar exercise (Japanese prompt).
app.post('/api/problem', wrap(async (req, res) => {
  const { level = 2, focusCategories = [], recentGrammar = [] } = req.body || {};
  const data = await callJSON({
    system: PROBLEM_SYSTEM,
    user: buildProblemPrompt({ level, focusCategories, recentGrammar }),
    schema: problemSchema,
    maxTokens: 1500,
  });
  res.json(data);
}));

// Compile / check the learner's English.
app.post('/api/check', wrap(async (req, res) => {
  const { text = '', promptJa = '', targetGrammar = '' } = req.body || {};
  if (!text.trim()) return res.json({ diagnostics: [], summary: emptySummary() });
  const data = await callJSON({
    system: CHECKER_SYSTEM,
    user: buildCheckPrompt({ text, promptJa, targetGrammar }),
    schema: checkSchema,
    maxTokens: 4000,
  });
  res.json(data);
}));

// Generate an AI-news briefing for discussion mode.
app.post('/api/news', wrap(async (req, res) => {
  const data = await callJSON({
    system: NEWS_SYSTEM,
    user: buildNewsPrompt(),
    schema: newsSchema,
    maxTokens: 1500,
  });
  res.json(data);
}));

// Discussion mode: check English + engage with the ideas.
app.post('/api/discuss', wrap(async (req, res) => {
  const { news = null, text = '' } = req.body || {};
  if (!text.trim()) return res.status(400).json({ error: 'Write your opinion first.' });
  const data = await callJSON({
    system: DISCUSS_SYSTEM,
    user: buildDiscussPrompt({ news, text }),
    schema: discussSchema,
    maxTokens: 5000,
  });
  res.json(data);
}));

function emptySummary() {
  return {
    errorCount: 0, warningCount: 0, infoCount: 0,
    naturalnessScore: 0, corrected: '',
    overallComment: 'Nothing to compile yet — write something first!',
  };
}

app.listen(PORT, () => {
  console.log(`\n  EngC running →  http://localhost:${PORT}`);
  console.log(`  model: ${MODEL}`);
  if (!hasCredentials()) {
    console.log('\n  ⚠  No ANTHROPIC_API_KEY found. Copy .env.example to .env and add your key.');
    console.log('     (If you use `ant auth login`, the SDK will pick up that profile automatically.)\n');
  }
});
