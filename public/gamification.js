// gamification.js — progress, XP, levels, streaks, per-category accuracy, badges.
// Everything is stored locally in the browser (localStorage). No account needed.
(function () {
  const KEY = 'engc.profile.v1';

  // Map the 19 fine-grained taxonomy categories to 7 macro-groups used as the
  // axes of the "理解度マップ" (comprehension radar).
  const MACRO = {
    'core-grammar':  ['subject-verb-agreement', 'verb-tense', 'noun-number'],
    'articles-prep': ['article', 'preposition'],
    'vocabulary':    ['word-choice', 'missing-word', 'extra-word'],
    'spelling':      ['spelling'],
    'mechanics':     ['punctuation', 'capitalization'],
    'structure':     ['word-order', 'sentence-structure', 'conjunction', 'pronoun'],
    'naturalness':   ['naturalness', 'wordiness', 'register', 'alternative'],
  };
  const MACRO_LABELS = {
    'core-grammar': '文法',
    'articles-prep': '冠詞・前置詞',
    'vocabulary': '語彙',
    'spelling': 'スペル',
    'mechanics': '記号・大文字',
    'structure': '構文',
    'naturalness': '自然さ',
  };
  const catToMacro = {};
  for (const [m, cats] of Object.entries(MACRO)) cats.forEach((c) => (catToMacro[c] = m));

  const BADGES = [
    { id: 'first_compile', icon: '🎉', label: '初コンパイル' },
    { id: 'clean_1',       icon: '✨', label: '初ノーミス' },
    { id: 'streak_7',      icon: '🔥', label: '7日連続' },
    { id: 'level_5',       icon: '⭐', label: 'Lv.5 到達' },
    { id: 'problems_25',   icon: '📚', label: '25問クリア' },
    { id: 'natural_90',    icon: '🪶', label: '自然さ 90+' },
    { id: 'discuss_1',     icon: '🗞️', label: '初ディスカッション' },
  ];

  function fresh() {
    return {
      xp: 0, streak: 0, lastActive: null,
      totalProblems: 0, cleanCompiles: 0, compiles: 0,
      naturalSum: 0, naturalCount: 0,
      // per macro-group: { good, bad } — "good" = a compile with no error of
      // that group; "bad" = a compile that had at least one.
      cat: {},
      badges: [],
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return fresh();
      return Object.assign(fresh(), JSON.parse(raw));
    } catch { return fresh(); }
  }

  let profile = load();
  function save() { localStorage.setItem(KEY, JSON.stringify(profile)); }

  // ---- level curve -------------------------------------------------------
  function threshold(L) { return 100 * (L - 1) + 25 * (L - 1) * (L - 2); }
  function levelFor(xp) { let L = 1; while (threshold(L + 1) <= xp) L++; return L; }
  function xpInfo() {
    const L = levelFor(profile.xp);
    const base = threshold(L), next = threshold(L + 1);
    return { level: L, into: profile.xp - base, span: next - base, xp: profile.xp, next };
  }

  // ---- streak ------------------------------------------------------------
  function today() { return new Date().toISOString().slice(0, 10); }
  function touchStreak() {
    const t = today();
    if (profile.lastActive === t) return;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    profile.streak = profile.lastActive === yesterday ? profile.streak + 1 : 1;
    profile.lastActive = t;
  }

  function grantBadges() {
    const has = (id) => profile.badges.includes(id);
    const add = (id) => { if (!has(id)) { profile.badges.push(id); newBadges.push(id); } };
    const newBadges = [];
    if (profile.compiles >= 1) add('first_compile');
    if (profile.cleanCompiles >= 1) add('clean_1');
    if (profile.streak >= 7) add('streak_7');
    if (levelFor(profile.xp) >= 5) add('level_5');
    if (profile.totalProblems >= 25) add('problems_25');
    if (profile.naturalCount && (profile.naturalSum / profile.naturalCount) >= 90) add('natural_90');
    return newBadges;
  }

  // Record one compile result. Returns { xpGained, levelUp, newBadges }.
  function recordCompile({ diagnostics = [], summary = {}, mode = 'grammar' }) {
    const before = levelFor(profile.xp);
    touchStreak();
    profile.compiles++;

    const errorCount = summary.errorCount ?? diagnostics.filter((d) => d.severity === 'error').length;
    const warnCount = summary.warningCount ?? diagnostics.filter((d) => d.severity === 'warning').length;
    const natural = summary.naturalnessScore ?? 0;

    // per-category accuracy bookkeeping
    const groupsHit = new Set();
    for (const d of diagnostics) {
      const m = catToMacro[d.category];
      if (m && d.severity === 'error') groupsHit.add(m);
    }
    for (const m of Object.keys(MACRO)) {
      profile.cat[m] = profile.cat[m] || { good: 0, bad: 0 };
      if (groupsHit.has(m)) profile.cat[m].bad++; else profile.cat[m].good++;
    }

    if (natural > 0) { profile.naturalSum += natural; profile.naturalCount++; }

    // XP
    let xp = 8;                                   // participation
    xp += Math.max(0, 40 - 6 * errorCount);       // quality
    xp += Math.round(natural / 5);                // naturalness (≤20)
    if (errorCount === 0 && warnCount === 0) { xp += 30; profile.cleanCompiles++; } // clean bonus
    if (mode === 'discuss') { xp += 10; if (!profile.badges.includes('discuss_1')) profile.badges.push('discuss_1'); }
    profile.xp += xp;

    const newBadges = grantBadges();
    save();
    return { xpGained: xp, levelUp: levelFor(profile.xp) > before, newBadges, errorCount, warnCount };
  }

  function recordProblemComplete() {
    profile.totalProblems++;
    profile.xp += 10;
    const nb = grantBadges();
    save();
    return nb;
  }

  function macroAccuracy() {
    const out = {};
    for (const m of Object.keys(MACRO)) {
      const c = profile.cat[m];
      out[m] = c && (c.good + c.bad) > 0 ? c.good / (c.good + c.bad) : null;
    }
    return out;
  }

  // Categories the learner is weakest at (for adaptive problem generation).
  function weakCategories(n = 3) {
    const scored = Object.entries(profile.cat)
      .filter(([, c]) => c.good + c.bad >= 2)
      .map(([m, c]) => [m, c.good / (c.good + c.bad)])
      .sort((a, b) => a[1] - b[1])
      .slice(0, n)
      .map(([m]) => MACRO[m]) // expand macro → fine categories
      .flat();
    return scored;
  }

  function badgeList() {
    return BADGES.map((b) => ({ ...b, earned: profile.badges.includes(b.id) }));
  }

  function reset() { profile = fresh(); save(); }

  window.EngcGame = {
    get: () => profile,
    recordCompile, recordProblemComplete,
    xpInfo, macroAccuracy, weakCategories, badgeList, reset,
    MACRO_LABELS,
    streak: () => profile.streak,
    avgNatural: () => (profile.naturalCount ? Math.round(profile.naturalSum / profile.naturalCount) : null),
  };
})();
