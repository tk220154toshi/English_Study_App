// srs.js — "あなた専用テストスイート"。過去のミスを弱点カードとして蓄積し、
// Leitner 方式の間隔反復（spaced repetition）で復習をスケジュールする。
//
// カードは細分類（taxonomy の category slug 単位）。ミスするとボックス1へ降格し
// 「今すぐ復習」に。ターゲットにしたテストで無ミスなら昇格し、次回は先の日付へ。
(function () {
  const KEY = 'engc.srs.v1';
  const DAY = 86400000;
  // ボックス B に昇格したとき、次回出題までの日数。
  const PROMO_DAYS = { 2: 1, 3: 3, 4: 7, 5: 16 };
  const MAX_EXAMPLES = 6;

  let taxByCat = {};
  function setTaxonomy(tax) { (tax || []).forEach((t) => (taxByCat[t.category] = t)); }
  function labelFor(cat) { return taxByCat[cat]?.label || cat; }

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || { cards: {} }; }
    catch { return { cards: {} }; }
  }
  let db = load();
  function save() { localStorage.setItem(KEY, JSON.stringify(db)); }

  function ensure(cat, code) {
    if (!db.cards[cat]) {
      db.cards[cat] = { category: cat, code: code || '', box: 1, due: 0, seen: 0, passed: 0, failed: 0, examples: [] };
    } else if (code && !db.cards[cat].code) {
      db.cards[cat].code = code;
    }
    return db.cards[cat];
  }

  // 1つのチェック結果を観測：エラーのあった細分類ごとにカードを降格＋事例を保存。
  // 返り値：今回エラーになった category の Set。
  function observe(diagnostics) {
    const errored = new Set();
    for (const d of diagnostics || []) {
      if (d.severity !== 'error') continue;
      const c = ensure(d.category, d.code);
      errored.add(d.category);
      c.box = 1;
      c.due = Date.now();          // すぐ復習対象に
      c.seen++; c.failed++;
      c.examples.unshift({ quote: d.quote || '', message: d.message || '', suggestion: d.suggestion || '', ts: Date.now() });
      c.examples = c.examples.slice(0, MAX_EXAMPLES);
    }
    save();
    return errored;
  }

  // テストの採点：targets のうち errored に無いものを「合格」として昇格。
  // errored に有るものは observe() 側で既に降格済みなので report だけ返す。
  function grade(targets, erroredSet) {
    const report = [];
    for (const cat of targets || []) {
      const c = ensure(cat);
      if (erroredSet.has(cat)) {
        report.push({ category: cat, label: labelFor(cat), pass: false, toBox: c.box, nextDays: 0 });
      } else {
        const nb = Math.min(5, c.box + 1);
        c.box = nb;
        c.due = Date.now() + (PROMO_DAYS[nb] || 16) * DAY;
        c.seen++; c.passed++;
        report.push({ category: cat, label: labelFor(cat), pass: true, toBox: nb, nextDays: PROMO_DAYS[nb] || 16 });
      }
    }
    save();
    return report;
  }

  // 出題ターゲット：期限切れ（due<=now）を弱い順に。足りなければ他カードで補完。
  function dueTargets(n = 2) {
    const now = Date.now();
    const all = Object.values(db.cards);
    const due = all.filter((c) => c.due <= now).sort((a, b) => a.box - b.box || a.due - b.due);
    const rest = all.filter((c) => c.due > now).sort((a, b) => a.box - b.box || a.due - b.due);
    return [...due, ...rest].slice(0, n).map((c) => c.category);
  }

  function stats() {
    const now = Date.now();
    const all = Object.values(db.cards);
    return { tracked: all.length, due: all.filter((c) => c.due <= now).length };
  }

  // 表示用：弱点カード一覧（弱い順→期限順）。
  function list() {
    const now = Date.now();
    return Object.values(db.cards)
      .map((c) => ({
        ...c,
        label: labelFor(c.category),
        isDue: c.due <= now,
        dueInDays: Math.max(0, Math.ceil((c.due - now) / DAY)),
        rate: c.seen ? Math.round((c.passed / c.seen) * 100) : 0,
      }))
      .sort((a, b) => (a.isDue === b.isDue ? a.box - b.box || a.due - b.due : a.isDue ? -1 : 1));
  }

  function reset() { db = { cards: {} }; save(); }

  window.EngcSRS = { setTaxonomy, observe, grade, dueTargets, stats, list, reset };
})();
