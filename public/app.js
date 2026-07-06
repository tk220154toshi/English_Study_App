// app.js — wires Monaco, the API, the compiler-style output, and gamification.
(function () {
  let editor = null;
  let monacoRef = null;
  let taxonomy = [];
  const taxByCode = {};

  const state = {
    mode: 'grammar',            // 'grammar' | 'test' | 'discuss'
    problem: null,              // current grammar/test problem
    news: null,                 // current AI-news briefing
    lastResult: null,           // last check/discuss payload
    problemScored: false,       // has the current problem awarded completion XP?
    testTargets: null,          // categories being graded by the current SRS test
  };

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---- boot --------------------------------------------------------------
  require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } });
  require(['vs/editor/editor.main'], function () {
    monacoRef = window.monaco;
    editor = monaco.editor.create($('#editor'), {
      value: '',
      language: 'plaintext',
      theme: 'vs-dark',
      fontSize: 15,
      lineHeight: 24,
      fontFamily: 'Cascadia Code, Consolas, Menlo, monospace',
      wordWrap: 'on',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      padding: { top: 12 },
      renderWhitespace: 'boundary',
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runCompile);
    boot();
  });

  async function boot() {
    try {
      const cfg = await fetch('/api/config').then((r) => r.json());
      $('#modelBadge').textContent = 'model: ' + cfg.model;
      taxonomy = cfg.taxonomy || [];
      taxonomy.forEach((t) => (taxByCode[t.code] = t));
      EngcSRS.setTaxonomy(taxonomy);
      if (!cfg.hasCredentials) {
        term(`⚠  No ANTHROPIC_API_KEY configured on the server.\n    Copy .env.example → .env and add your key, then restart.`, 'warn', true);
      }
    } catch (e) { /* offline config is non-fatal */ }
    renderStats();
    renderTestPanel();
    wire();
  }

  // ---- UI wiring ---------------------------------------------------------
  function wire() {
    document.querySelectorAll('.act').forEach((b) =>
      b.addEventListener('click', () => setMode(b.dataset.mode)));
    document.querySelectorAll('.otab').forEach((b) =>
      b.addEventListener('click', () => showOutputTab(b.dataset.tab)));

    $('#newProblem').addEventListener('click', newProblem);
    $('#newNews').addEventListener('click', newNews);
    $('#newTest').addEventListener('click', () => newTest());
    $('#tsCards').addEventListener('click', onTestCardClick);
    $('#compileBtn').addEventListener('click', runCompile);
    $('#refactorBtn').addEventListener('click', runRefactor);
    $('#revealBtn').addEventListener('click', reveal);
    $('#resetBtn').addEventListener('click', () => {
      if (confirm('学習の進捗（XP・レベル・実績・弱点カード）をすべて消去します。よろしいですか？')) {
        EngcGame.reset(); EngcSRS.reset(); renderStats(); renderTestPanel(); toast('進捗をリセットしました');
      }
    });
  }

  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll('.act').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    $('#panel-grammar').classList.toggle('hidden', mode !== 'grammar');
    $('#panel-test').classList.toggle('hidden', mode !== 'test');
    $('#panel-discuss').classList.toggle('hidden', mode !== 'discuss');
    $('#fileName').textContent = mode === 'discuss' ? 'opinion.en' : mode === 'test' ? 'test.en' : 'answer.en';
    $('#compileBtn').innerHTML = mode === 'discuss' ? '▶ Send' : mode === 'test' ? '▶ Run Tests' : '▶ Compile';
    const hideExtras = mode === 'discuss';
    $('#revealBtn').style.display = hideExtras ? 'none' : '';
    $('#refactorBtn').style.display = hideExtras ? 'none' : '';
  }

  function showOutputTab(tab) {
    document.querySelectorAll('.otab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $('#tab-terminal').classList.toggle('hidden', tab !== 'terminal');
    $('#tab-problems').classList.toggle('hidden', tab !== 'problems');
  }

  // ---- terminal helpers --------------------------------------------------
  function clearTerm() { $('#tab-terminal').innerHTML = ''; }
  function term(html, cls = '', raw = false) {
    const div = document.createElement('div');
    div.className = 'term-line ' + cls;
    div.innerHTML = raw ? html : esc(html);
    $('#tab-terminal').appendChild(div);
    $('#tab-terminal').scrollTop = $('#tab-terminal').scrollHeight;
    return div;
  }
  function busy(msg) { clearTerm(); showOutputTab('terminal'); return term(`<span class="spinner"></span> ${esc(msg)}`, 'muted', true); }

  async function api(path, body) {
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    return data;
  }

  // ---- problem generation -----------------------------------------------
  async function newProblem() {
    const btn = $('#newProblem'); btn.disabled = true;
    busy('生成中… problem');
    try {
      const adaptive = $('#adaptive').checked;
      const p = await api('/api/problem', {
        level: Number($('#level').value),
        focusCategories: adaptive ? EngcGame.weakCategories(3) : [],
        recentGrammar: state.problem ? [state.problem.targetGrammar] : [],
      });
      state.problem = p; state.problemScored = false; state.testTargets = null;
      renderProblem(p);
      editor.setValue('');
      clearTerm(); term('engc: 新しい問題を読み込みました。英語で書いて ▶ Compile してください。', 'ok');
      editor.focus();
    } catch (e) { errTerm(e); } finally { btn.disabled = false; }
  }

  function renderProblem(p) {
    const hints = (p.hintsJa || []).map((h) => `<li>${esc(h)}</li>`).join('');
    $('#problemCard').classList.remove('empty');
    $('#problemCard').innerHTML = `
      <div class="ptitle">${esc(p.titleJa)}</div>
      <div class="pmeta">Lv.${esc(p.difficulty)} · target: ${esc(p.targetGrammar)}</div>
      <div class="pbody">${esc(p.promptJa)}</div>
      ${hints ? `<ul class="phints">${hints}</ul>` : ''}
      <div id="refBox"></div>`;
  }

  function reveal() {
    if (!state.problem) { toast('先に問題を生成してください'); return; }
    const box = state.mode === 'test' ? $('#refBoxTest') : $('#refBox');
    if (!box) return;
    if (box.dataset.shown) { box.innerHTML = ''; delete box.dataset.shown; return; }
    box.dataset.shown = '1';
    box.innerHTML = `<div class="reference">📖 模範解答:\n${esc(state.problem.referenceEn)}</div>`;
  }

  // ---- news / discussion -------------------------------------------------
  async function newNews() {
    const btn = $('#newNews'); btn.disabled = true;
    busy('生成中… AI news');
    try {
      const n = await api('/api/news', {});
      state.news = n; renderNews(n);
      editor.setValue('');
      clearTerm(); term('engc: ニュースを読み込みました。あなたの意見を英語で書いて ▶ Send してください。', 'ok');
    } catch (e) { errTerm(e); } finally { btn.disabled = false; }
  }

  function renderNews(n) {
    const gloss = (n.glossary || []).map((g) => `<div class="g"><b>${esc(g.term)}</b> — ${esc(g.meaningJa)}</div>`).join('');
    $('#newsCard').classList.remove('empty');
    $('#newsCard').innerHTML = `
      <div class="news-headline">${esc(n.headlineEn)}</div>
      <div class="news-body">${esc(n.bodyEn)}</div>
      <div class="news-ja">🇯🇵 ${esc(n.summaryJa)}</div>
      <div class="news-ja"><b>お題:</b> ${esc(n.discussionPromptJa)}</div>
      ${gloss ? `<div class="glossary">${gloss}</div>` : ''}`;
  }

  // ---- compile / send ----------------------------------------------------
  function runCompile() { state.mode === 'discuss' ? sendDiscuss() : compile(); }

  async function compile() {
    const text = editor.getValue();
    if (!text.trim()) { busy(''); term('engc: エディタが空です。英語を書いてください。', 'warn'); return; }
    const line = busy('compiling answer.en …');
    setButtons(false);
    try {
      const res = await api('/api/check', {
        text,
        promptJa: state.problem?.promptJa || '',
        targetGrammar: state.problem?.targetGrammar || '',
      });
      state.lastResult = res;
      applyResult(res, 'answer.en', 'grammar');
      // award problem-completion XP once, when a problem is solved cleanly enough
      if (state.problem && !state.problemScored && res.summary.errorCount === 0) {
        state.problemScored = true;
        EngcGame.recordProblemComplete();
        toast('問題クリア！ +10 XP 📚', 'xp');
      }
      renderStats();
    } catch (e) { errTerm(e); } finally { setButtons(true); }
  }

  async function sendDiscuss() {
    const text = editor.getValue();
    if (!text.trim()) { busy(''); term('engc: 意見を英語で書いてください。', 'warn'); return; }
    if (!state.news) { busy(''); term('engc: 先に「ニュースを生成」してください。', 'warn'); return; }
    busy('checking & thinking …'); setButtons(false);
    try {
      const res = await api('/api/discuss', { news: state.news, text });
      state.lastResult = res;
      applyResult(res, 'opinion.en', 'discuss');
      renderDiscussion(res);
      renderStats();
    } catch (e) { errTerm(e); } finally { setButtons(true); }
  }

  async function runRefactor() {
    // "Refactor": get the natural rewrite and offer to apply it, like a code fixer.
    let res = state.lastResult;
    const text = editor.getValue();
    if (!text.trim()) { toast('先に英語を書いてください'); return; }
    if (!res || res._for !== text) {
      busy('analysing for refactor …'); setButtons(false);
      try { res = await api('/api/check', { text, promptJa: state.problem?.promptJa || '', targetGrammar: state.problem?.targetGrammar || '' }); res._for = text; state.lastResult = res; }
      catch (e) { errTerm(e); setButtons(true); return; }
      setButtons(true);
    }
    const corrected = res.summary?.corrected || '';
    clearTerm(); showOutputTab('terminal');
    term('engc refactor — より自然な言い回しの提案:', 'info');
    term(corrected, 'ok');
    const applyLine = term('<button id="applyRefactor" class="btn primary" style="margin-top:8px">✨ この形に置き換える</button>', '', true);
    applyLine.querySelector('#applyRefactor').addEventListener('click', () => {
      editor.setValue(corrected); toast('リファクタを適用しました');
    });
  }

  // ---- render a check/discuss result -------------------------------------
  function applyResult(res, fileName, mode) {
    const diags = res.diagnostics || [];
    const model = editor.getModel();

    // Monaco squiggles
    const markers = diags.map((d) => {
      const range = rangeFor(model, d);
      return {
        severity: mode2sev(d.severity),
        message: `${d.code} ${d.category}: ${d.message}` + (d.suggestion ? `\n→ ${d.suggestion}` : ''),
        code: d.code,
        source: 'engc',
        startLineNumber: range.startLineNumber, startColumn: range.startColumn,
        endLineNumber: range.endLineNumber, endColumn: range.endColumn,
      };
    });
    monaco.editor.setModelMarkers(model, 'engc', markers);

    // Terminal (compiler-style)
    clearTerm(); showOutputTab('terminal');
    term(`$ engc compile ${fileName}`, 'muted');
    const order = { error: 0, warning: 1, info: 2 };
    const sorted = [...diags].sort((a, b) => (a.line - b.line) || (order[a.severity] - order[b.severity]));
    for (const d of sorted) {
      const cls = d.severity === 'error' ? 'err' : d.severity === 'warning' ? 'warn' : 'info';
      term(
        `<span class="loc">${esc(fileName)}:${d.line}:${d.column}:</span> ${d.severity}<span class="code">[${esc(d.code)} ${esc(d.category)}]</span>: ${esc(d.message)}`,
        cls, true);
      if (d.suggestion) term(`   → ${esc(d.suggestion)}`, 'muted');
    }
    const s = res.summary || {};
    const parts = [];
    if (s.errorCount) parts.push(`${s.errorCount} error${s.errorCount > 1 ? 's' : ''}`);
    if (s.warningCount) parts.push(`${s.warningCount} warning${s.warningCount > 1 ? 's' : ''}`);
    if (s.infoCount) parts.push(`${s.infoCount} note${s.infoCount > 1 ? 's' : ''}`);
    const line = document.createElement('div'); line.className = 'term-line term-summary';
    if (!parts.length) {
      line.innerHTML = `<span class="ok">✔ Build succeeded — 0 errors. naturalness ${esc(s.naturalnessScore)}/100</span>`;
    } else {
      const cls = s.errorCount ? 'err' : 'warn';
      line.innerHTML = `<span class="${cls}">${parts.join(', ')}</span> <span class="muted">— naturalness ${esc(s.naturalnessScore)}/100</span>`;
    }
    $('#tab-terminal').appendChild(line);
    if (s.overallComment) term('💬 ' + s.overallComment, 'muted');

    // Problems panel
    renderProblemsPanel(sorted, fileName);

    // Gamification
    const r = EngcGame.recordCompile({ diagnostics: diags, summary: s, mode });
    flashRewards(r);

    // Spaced-repetition test suite: capture every error as a weakness card,
    // and — if this compile was an SRS test — grade the targeted categories.
    const errored = EngcSRS.observe(diags);
    if (state.testTargets && state.testTargets.length) {
      const report = EngcSRS.grade(state.testTargets, errored);
      renderTestReport(report, state.testTargets);
      state.testTargets = null;
    }
    renderTestPanel();
  }

  function renderProblemsPanel(diags, fileName) {
    $('#probCount').textContent = diags.length;
    const box = $('#tab-problems');
    if (!diags.length) { box.innerHTML = '<div class="term-line ok" style="padding:6px">No problems detected. 🎉</div>'; return; }
    box.innerHTML = diags.map((d, i) => {
      const ico = d.severity === 'error' ? '⛔' : d.severity === 'warning' ? '⚠️' : 'ℹ️';
      return `<div class="prob" data-i="${i}">
        <div class="sev">${ico}</div>
        <div class="ptext">
          <div>${esc(d.message)} <span class="pcode">${esc(d.code)}</span></div>
          <div class="ploc">${esc(fileName)}:${d.line}:${d.column} · ${esc(d.category)}</div>
          ${d.suggestion ? `<div class="pfix">→ ${esc(d.suggestion)}</div>` : ''}
        </div></div>`;
    }).join('');
    box.querySelectorAll('.prob').forEach((el) => el.addEventListener('click', () => {
      const d = diags[Number(el.dataset.i)];
      const range = rangeFor(editor.getModel(), d);
      editor.revealRangeInCenter(range);
      editor.setSelection(range);
      editor.focus();
    }));
  }

  function renderDiscussion(res) {
    term('', '');
    term('🤝 Discussion:', 'info');
    term(res.replyEn, 'ok');
    if (res.replyGlossJa) term('🇯🇵 ' + res.replyGlossJa, 'muted');
    if (res.followupQuestionEn) term('❓ ' + res.followupQuestionEn, 'info');
    if (res.vocabulary?.length) {
      term('📔 使えると良い表現:', 'muted');
      res.vocabulary.forEach((v) => term(`   • ${v.term} — ${v.meaningJa}  (e.g. ${v.exampleEn})`, 'muted'));
    }
  }

  // ---- helpers -----------------------------------------------------------
  function rangeFor(model, d) {
    const lineCount = model.getLineCount();
    let line = Math.min(Math.max(1, d.line || 1), lineCount);
    if (d.quote) {
      let content = model.getLineContent(line);
      let idx = content.indexOf(d.quote);
      if (idx === -1) {
        for (let l = 1; l <= lineCount; l++) {
          const i = model.getLineContent(l).indexOf(d.quote);
          if (i !== -1) { line = l; idx = i; break; }
        }
      }
      if (idx !== -1) return new monaco.Range(line, idx + 1, line, idx + d.quote.length + 1);
    }
    const sc = Math.max(1, d.column || 1);
    const ec = Math.max(sc + 1, d.endColumn || sc + 1);
    return new monaco.Range(line, sc, line, ec);
  }
  function mode2sev(s) {
    return s === 'error' ? monaco.MarkerSeverity.Error
      : s === 'warning' ? monaco.MarkerSeverity.Warning
      : monaco.MarkerSeverity.Info;
  }
  function setButtons(on) {
    ['#compileBtn', '#refactorBtn', '#newProblem', '#newNews'].forEach((s) => { const el = $(s); if (el) el.disabled = !on; });
  }
  function errTerm(e) { clearTerm(); term('engc: ' + (e.message || 'error'), 'err'); }

  // ---- stats sidebar -----------------------------------------------------
  function renderStats() {
    const info = EngcGame.xpInfo();
    $('#levelNum').textContent = info.level;
    $('#xpNow').textContent = info.into;
    $('#xpNext').textContent = info.span;
    EngcCharts.drawLevelRing($('#levelRing'), info.span ? info.into / info.span : 0, info.level);

    const p = EngcGame.get();
    $('#statProblems').textContent = p.totalProblems;
    $('#statClean').textContent = p.cleanCompiles;
    const avg = EngcGame.avgNatural();
    $('#statNatural').textContent = avg == null ? '–' : avg;
    $('#streakBadge').textContent = '🔥 ' + EngcGame.streak();

    EngcCharts.drawRadar($('#radar'), EngcGame.macroAccuracy(), EngcGame.MACRO_LABELS);

    $('#badges').innerHTML = EngcGame.badgeList().map((b) =>
      `<div class="badge ${b.earned ? '' : 'locked'}" title="${esc(b.label)}"><span class="bico">${b.icon}</span>${esc(b.label)}</div>`).join('');
  }

  function flashRewards(r) {
    if (!r) return;
    if (r.xpGained) toast(`+${r.xpGained} XP` + (r.levelUp ? ' — LEVEL UP! 🎉' : ''), 'xp');
    (r.newBadges || []).forEach((id, i) => setTimeout(() => {
      const b = EngcGame.badgeList().find((x) => x.id === id);
      if (b) toast(`実績解除: ${b.icon} ${b.label}`);
    }, 400 * (i + 1)));
  }

  // ---- personal test suite (spaced repetition) ---------------------------
  function labelOf(cat) { return (taxonomy.find((t) => t.category === cat)?.label) || cat; }

  async function newTest(explicitTargets) {
    setMode('test');
    const targets = (explicitTargets && explicitTargets.length) ? explicitTargets : EngcSRS.dueTargets(2);
    const btn = $('#newTest'); btn.disabled = true;
    busy('generating targeted test …');
    try {
      const p = await api('/api/problem', {
        level: Number($('#level').value),
        focusCategories: targets,
        recentGrammar: state.problem ? [state.problem.targetGrammar] : [],
      });
      state.problem = p; state.problemScored = false;
      state.testTargets = targets.length ? targets : null;
      renderTestProblem(p, targets);
      editor.setValue('');
      clearTerm();
      if (targets.length) term('engc test — 弱点 [' + targets.map(labelOf).join(', ') + '] を狙った問題です。英語で書いて ▶ Run Tests。', 'info');
      else term('engc: まだ弱点データがありません。通常問題を出しました。ミスすると弱点カードが蓄積されます。', 'muted');
      editor.focus();
    } catch (e) { errTerm(e); } finally { btn.disabled = false; }
  }

  function renderTestProblem(p, targets) {
    const banner = targets.length
      ? `<div class="test-banner">🧪 テスト対象: <b>${targets.map((t) => esc(labelOf(t))).join(' / ')}</b></div>` : '';
    const hints = (p.hintsJa || []).map((h) => `<li>${esc(h)}</li>`).join('');
    $('#testProblemCard').innerHTML = banner + `
      <div class="problem-card">
        <div class="ptitle">${esc(p.titleJa)}</div>
        <div class="pmeta">Lv.${esc(p.difficulty)} · target: ${esc(p.targetGrammar)}</div>
        <div class="pbody">${esc(p.promptJa)}</div>
        ${hints ? `<ul class="phints">${hints}</ul>` : ''}
        <div id="refBoxTest"></div>
      </div>`;
  }

  function renderTestReport(report, targets) {
    term('$ engc test — targeting: ' + targets.map(labelOf).join(', '), 'muted');
    let pass = 0;
    for (const r of report) {
      if (r.pass) { pass++; term(`  ✓ ${labelOf(r.category)}  PASS  (box ${r.toBox}/5, next in ${r.nextDays}d)`, 'ok'); }
      else term(`  ✗ ${labelOf(r.category)}  FAIL  — 復習キューに戻しました`, 'err');
    }
    const failed = report.length - pass;
    const line = document.createElement('div');
    line.className = 'term-line term-summary ' + (failed ? 'err' : 'ok');
    line.textContent = `Tests: ${pass} passed, ${failed} failed, ${report.length} total`;
    $('#tab-terminal').appendChild(line);
    if (!failed && report.length) toast('全テスト合格！ 🧪✅', 'xp');
  }

  function renderTestPanel() {
    if (!window.EngcSRS) return;
    const s = EngcSRS.stats();
    $('#tsTracked').textContent = s.tracked;
    $('#tsDue').textContent = s.due;
    const cards = EngcSRS.list();
    const box = $('#tsCards');
    if (!cards.length) {
      box.innerHTML = '<p class="hint" style="color:var(--fg-dim)">まだ弱点がありません。文法モードでミスをすると、ここに「テストケース」が溜まっていきます。</p>';
      return;
    }
    box.innerHTML = cards.map((c) => {
      const pips = '●'.repeat(c.box) + '○'.repeat(5 - c.box);
      const due = c.isDue ? '<span class="ts-due now">🔴 due</span>' : `<span class="ts-due">🕒 ${c.dueInDays}d</span>`;
      const ex = c.examples.map((e) =>
        `<div class="ts-ex"><div class="exq">“${esc(e.quote || '—')}”</div><div class="exm">${esc(e.message)}</div>${e.suggestion ? `<div class="exf">→ ${esc(e.suggestion)}</div>` : ''}</div>`).join('');
      return `<div class="ts-card ${c.isDue ? 'due' : ''}" data-cat="${esc(c.category)}">
        <div class="ts-head" data-act="toggle">
          <span class="ts-pips">${pips}</span>
          <span class="ts-label">${esc(c.label)} <span class="ts-meta">${c.passed}/${c.seen}✓</span></span>
          ${due}
          <button class="ts-drill" data-act="drill" title="この弱点だけ出題">🎯</button>
        </div>
        <div class="ts-examples">${ex || '<div class="ts-meta">事例なし</div>'}</div>
      </div>`;
    }).join('');
  }

  function onTestCardClick(e) {
    const card = e.target.closest('.ts-card');
    if (!card) return;
    if (e.target.closest('[data-act="drill"]')) { e.stopPropagation(); newTest([card.dataset.cat]); return; }
    card.classList.toggle('open');
  }

  // ---- toast -------------------------------------------------------------
  let toastTimer = null;
  function toast(msg, cls = '') {
    let el = document.querySelector('.toast');
    if (el) el.remove();
    el = document.createElement('div');
    el.className = 'toast ' + cls;
    el.textContent = msg;
    document.body.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 2600);
  }
})();
