# EngC — English, compiled 🧑‍💻

VSCode みたいに **プログラミング的に英語を学習する** ためのアプリです。
エディタに英語を書いて **▶ Compile** すると、間違いが「コンパイルエラー」として
出力されます。文法だけでなく、スペル・冠詞・前置詞・時制・語順・自然さまで
網羅的にチェックします。

![mode](https://img.shields.io/badge/mode-grammar_%2B_discussion-007acc) ![llm](https://img.shields.io/badge/powered_by-Claude-4ec9b0)

## 何ができる？

| 要件 | 実装 |
|---|---|
| ① VSCode 風にプログラミング的に学ぶ | Monaco Editor（VSCode と同じエディタ）＋アクティビティバー／出力パネル |
| ② 間違いを「構文エラー」として吐く（文法以外も網羅） | `▶ Compile` で LLM が **19 種類のエラーコード**（`E001`〜`I001`）で診断。エディタに赤い波線＋コンパイラ風の OUTPUT／PROBLEMS パネル |
| ③ エラーは全部英語 | 診断メッセージ・修正提案・講評はすべて英語 |
| ④ 問題は LLM が自動生成 | `/api/problem` が難易度・苦手分野に応じて出題 |
| ⑤ 問題文は日本語 | 出題・ヒント・ニュース要約は日本語 |
| ⑥ 後から AI ニュース考察モード | 🗞️ **Discussion モード**：AIニュース（LLM生成）を読んで意見を英語で書くと、文法チェック＋AIとの対話 |
| ⑦ 理解度を可視化＋ゲーミフィケーション | XP・レベル・連続日数・**理解度レーダーチャート**・実績バッジ |

## エラーの種類（コンパイラ仕様）

`E` = error / `W` = warning / `I` = info。スペル・主述の一致・時制・冠詞・前置詞・
単複・代名詞・語順・句読点・大文字・語彙選択・語の過不足・接続・文の断片/run-on、
そして自然さ・冗長さ・トーン・言い換え候補までカバーします（`server/prompts.js`）。

出力はこんな感じ:

```
$ engc compile answer.en
answer.en:1:8: error[E003 verb-tense]: past-time adverb "yesterday" requires simple past; use "went", not "have gone"
answer.en:2:1: warning[W001 naturalness]: "very delicious" is redundant; "delicious" alone is natural
2 errors, 1 warning — naturalness 74/100
💬 Great sentence structure! Watch your tense with time markers.
```

## セットアップ

必要なもの: **Node.js 18.17+** と **Anthropic API キー**。

```bash
# 1. 依存関係をインストール
npm install

# 2. API キーを設定
cp .env.example .env
#   .env を開いて ANTHROPIC_API_KEY を貼り付ける
#   （`ant auth login` でログイン済みなら SDK が自動で認識します）

# 3. 起動
npm start
```

ブラウザで **http://localhost:5173** を開く。初回は Monaco を CDN
（jsdelivr）から読み込むためネット接続が必要です。

## 使い方

**文法モード 📝**
1. 難易度を選んで「新しい問題を生成 ✨」
2. 日本語のお題を読んで、英語をエディタに書く
3. `▶ Compile`（または `Ctrl/Cmd + Enter`）でチェック
4. `✨ Refactor` でより自然な言い回しに置き換え／`👁 模範解答` で答え合わせ
5. ノーミスでクリアすると XP ボーナス

**ディスカッションモード 🗞️**
1. 「ニュースを生成」で AI 関連の短いニュースを読む
2. 自分の考察を英語で書いて `▶ Send`
3. 文法チェックに加えて、Claude が内容に踏み込んで返信＋追加質問＋語彙提案

進捗（XP・レベル・実績）はブラウザの localStorage に保存されます。

## 設定

- `ENGC_MODEL` … 使用モデル（既定 `claude-opus-4-8`）。コスト/速度重視なら
  `claude-sonnet-5` や `claude-haiku-4-5` に変更可。
- `PORT` … ポート（既定 `5173`）。

## 仕組み

```
server/
  index.js     Express + 静的配信 + 4つの API
  llm.js       Anthropic SDK ラッパー（structured outputs で必ず妥当な JSON）
  prompts.js   エラー分類（コンパイラ仕様）・プロンプト・JSON スキーマ
public/
  index.html   VSCode 風レイアウト
  app.js       Monaco・API・診断表示・ゲーミフィケーション連携
  gamification.js  XP/レベル/連続日数/カテゴリ別正確度/バッジ（localStorage）
  charts.js    レベルリング＆理解度レーダー（依存ゼロの Canvas 描画）
```

診断は構造化出力（`output_config.format`）で JSON スキーマに固定しているため、
壊れた出力でUIが崩れません。各診断は `quote`（該当箇所の原文）を含み、フロントは
それを検索して正確に波線を引きます（列ズレに強い）。

---

## 💡 これから面白そうな機能の提案

実装済みの土台を活かせる、遊びとして面白い拡張アイデア:

1. **Git 風「英語コミット履歴」** — 書いた英文を `commit` して、ミスの傾向が
   時系列でどう改善したかを `git log` / diff 風に振り返る。過去の自分の英文を
   「リファクタ」して差分表示。

2. **あなた専用の“テストスイート”（間違いの間隔反復）** — 過去に出したエラーを
   ユニットテストのように蓄積し、`E005 preposition` が弱いなら **その穴を突く新問題**
   を自動生成。理解度レーダーが凹んだ軸を狙って出題する仕組みは既に土台があります。

3. **リアルタイム Linter（打つそばから波線）** — 入力停止 800ms でストリーミング
   チェックし、"as-you-type" で軽い警告を表示。重い診断は Compile 時のみ。

4. **ボス戦：制限時間デバッグ** — わざと 5 個の bug を仕込んだ英文が降ってきて、
   制限時間内に全部直すアーケードモード。連続正解でコンボ＆スコア。

5. **音声 I/O** — お題を読み上げ、話した英語を書き起こして「発音/文法」を同時採点。

6. **PR レビュー体験** — 長文エッセイを書くと、Claude が「コードレビュー」形式で
   インラインコメントを付け、Approve / Request changes を出す。

個人的な一押しは **②の「あなた専用テストスイート」**。学習を
「自分のバグを潰していくデバッグ作業」として体験でき、レーダーチャートの穴が
埋まっていく達成感とゲーミフィケーションが最もよく噛み合います。
（`EngcGame.weakCategories()` が既に苦手カテゴリを返すので、出題側を拡張するだけ）
