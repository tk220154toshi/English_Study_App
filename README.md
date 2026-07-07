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
| ★ 英語でキャラを制御（プログラミング的） | 🤖 **Command モード**：書いた英語をアンドロイド「Reisia」が実行（`wave`, `move forward`, `turn around`…）。英語＝命令コード。**音声(TTS)で喋る**。間違った英語→間違った動作 |
| ⑥ 後から AI ニュース考察モード | 🗞️ **Discussion モード**：AIニュース（LLM生成）を読んで意見を英語で書くと、文法チェック＋AIとの対話 |
| ⑦ 理解度を可視化＋ゲーミフィケーション | XP・レベル・連続日数・**理解度レーダーチャート**・実績バッジ |
| ＋ あなた専用テストスイート（間違いの間隔反復） | 🧪 **Test Suite モード**：過去のミスを弱点カードとして蓄積し、Leitner 方式で忘れた頃に狙い撃ち出題。合否をテストランナー風に採点 |
| ＋ Claude API 利用状況の可視化 | 📊 **Usage モード**：レスポンスヘッダーから**レート上限（残量ゲージ＋リセット秒数）**を表示。消費トークン・キャッシュ・**概算コスト**の表、呼び出しごとのトークン数スパークライン |

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

> 📱 **スマホ対応済み**：画面幅が狭いと自動で1カラム表示に切り替わります（モード
> アイコンは上部に横並び、下部に「メニュー / エディタ / 統計」へジャンプするナビ）。
> エディタは画面サイズに追従（縦横回転OK）。

## 📱 スマホから動かす / 見る

このアプリは **Node サーバー＋Anthropic APIキー**が必要です（キーはブラウザに
置けないため、静的ページのように「開くだけ」では動きません）。スマホから使うには
次のいずれか。

### 方法A：GitHub Codespaces（PCが無くても、スマホのブラウザだけで動く / おすすめ）
1. スマホの**ブラウザ**（GitHubアプリではなく）で
   **https://github.com/tk220154toshi/Lab11** を開く
2. 緑の **Code** ボタン → **Codespaces** タブ → **Create codespace**
3. 起動したら下部のターミナルで API キーを設定して起動：
   ```bash
   printf 'ANTHROPIC_API_KEY=sk-ant-あなたのキー\n' > .env
   npm start
   ```
   （依存関係は devcontainer が自動で `npm install` 済み）
4. 「ポート 5173 を開きますか？」の通知、または **PORTS** タブの 5173 を開く。
   ポートの表示を **Public** にすると、外出先の別端末からもその URL で開けます。

### 方法B：自宅PCで起動 → 同じ Wi‑Fi のスマホから見る
1. PC で `npm install && npm start`
2. スマホのブラウザで `http://<PCのIPアドレス>:5173`
   （PCの IP：Windows は `ipconfig`、Mac は `ipconfig getifaddr en0`）
3. 外出先からアクセスしたい場合は Cloudflare Tunnel / ngrok で公開 URL 化。

### 方法C：常設の公開URLが欲しい → 無料ホスティングにデプロイ
Render / Railway などに接続し、環境変数 `ANTHROPIC_API_KEY` を設定、
Start command は `npm start`。デプロイ後のURLをスマホでブックマーク。

> 💡 現状のUIは VSCode 風の横並びレイアウト（デスクトップ最適化）で、縦長スマホでは
> 少し窮屈です。スマホ向けのレスポンシブ表示が必要なら対応します。

## 使い方

**文法モード 📝**
1. 難易度を選んで「新しい問題を生成 ✨」
2. 日本語のお題を読んで、英語をエディタに書く
3. `▶ Compile`（または `Ctrl/Cmd + Enter`）でチェック
4. `✨ Refactor` でより自然な言い回しに置き換え／`👁 模範解答` で答え合わせ
5. ノーミスでクリアすると XP ボーナス

**コマンドモード 🤖（英語でアンドロイドを制御）** ← いちばんプログラミングっぽい
1. 「新しいミッション」で日本語のお題（例：手を振ってから3歩前進、回れ右）が出る
2. **英語で命令**を書く（例：`Wave, then walk forward three steps and turn around.`）
3. `▶ Run` すると：英語がコンパイル（文法チェック）され、**書いた英語どおりに Reisia が動き**、
   実行トレース（`→ wave()` `→ move(forward, 3)` …）が出て、Reisia が**声で反応**する
4. 命令が達成条件を満たせば **mission accomplished** ＋XP。文法ミスは通常どおり弱点に蓄積
5. 命令セット（`move / turn / wave / jump / spin / nod / point / dance / speak …` 全19種）は
   左パネルに一覧表示。`speak("...")` で任意の英語を喋らせられる

> 英語が「命令型プログラミング言語」になり、アンドロイドが「ランタイム」になります。
> 間違った英語を書くと、意図と違う動作になる＝バグ、という体験です。

**テストスイートモード 🧪（間違いの間隔反復）**
1. 文法モードでミスをすると、その種類が「弱点カード」として自動で蓄積される
2. 🧪 モードで「▶ 弱点テストを生成」→ 期限が来た弱点を狙った問題が出る
3. 英語を書いて `▶ Run Tests` → カテゴリごとに **PASS / FAIL** を判定（テストランナー風）
4. 合格すると Leitner のボックスが昇格し、次回は先の日付へ（1→3→7→16日）。ミスすると即・復習キューへ
5. 各カードは過去の実際のミス（原文＋指摘）を「テストケース」として保存。🎯 で単一弱点だけドリルも可能

```
$ engc test — targeting: Prepositions, Articles (a/an/the)
  ✓ Prepositions  PASS  (box 2/5, next in 1d)
  ✗ Articles (a/an/the)  FAIL  — 復習キューに戻しました
Tests: 1 passed, 1 failed, 2 total
```

**ディスカッションモード 🗞️**
1. 「ニュースを生成」で AI 関連の短いニュースを読む
2. 自分の考察を英語で書いて `▶ Send`
3. 文法チェックに加えて、Claude が内容に踏み込んで返信＋追加質問＋語彙提案

**API利用状況モード 📊**
- 📊 タブで、Anthropic API が各レスポンスヘッダー（`anthropic-ratelimit-*`）で
  返す**レート上限**を残量ゲージ＋リセット秒数で表示（残量に応じ緑→黄→赤）。
- このサーバ起動以降の**消費トークン・キャッシュ・概算コスト（USD）**を表で、
  呼び出しごとのトークン数を棒スパークラインで可視化。5秒ごとに自動更新。
- ※レート上限ヘッダーはプロキシ環境で除去される場合があります。その際も消費量と
  コストは表示されます。

進捗（XP・レベル・実績・弱点カード）はブラウザの localStorage に保存されます。

## 設定

- **モデル切り替え** … 画面右上のドロップダウンでいつでも変更可能（Opus 4.8 /
  Sonnet 5 / Haiku 4.5 / Fable 5 / Opus 4.7）。選択はブラウザに保存され、以降の
  問題生成・チェック・ディスカッションに適用されます。📊 利用状況にモデル別の
  消費が反映されます。
- `ENGC_MODEL` … ドロップダウンの既定値（省略時 `claude-opus-4-8`）。
- `PORT` … ポート（既定 `5173`）。

## 仕組み

```
server/
  index.js     Express + 静的配信 + API（config/problem/check/news/discuss/usage）
  llm.js       Anthropic SDK ラッパー（structured outputs で必ず妥当な JSON）
  usage.js     レート上限ヘッダー＋トークン消費のトラッキング（プロセス内）
  prompts.js   エラー分類（コンパイラ仕様）・プロンプト・JSON スキーマ
public/
  index.html   VSCode 風レイアウト
  app.js       Monaco・API・診断表示・ゲーミフィケーション連携
  gamification.js  XP/レベル/連続日数/カテゴリ別正確度/バッジ（localStorage）
  srs.js       テストスイート：弱点カード＋Leitner 間隔反復（localStorage）
  charts.js    レベルリング＆理解度レーダー（依存ゼロの Canvas 描画）
```

診断は構造化出力（`output_config.format`）で JSON スキーマに固定しているため、
壊れた出力でUIが崩れません。各診断は `quote`（該当箇所の原文）を含み、フロントは
それを検索して正確に波線を引きます（列ズレに強い）。

---

## 🤖 キャラクター & 音声について（差し替え設計）

- **見た目**：同梱しているのは**オリジナルの汎用アンドロイド**（`public/stage.js` 内の
  インラインSVG）です。特定作品のキャラクター画像は著作権のため同梱していません。
  自分で正規に用意した立ち絵/スプライトに**差し替え可能**な設計です
  （`stage.js` の `SVG` 定数を置き換え、`sv-head/armL/armR/legL/legR` 等の
  パーツ id を合わせれば、既存のアニメーションがそのまま動きます）。名前 "Reisia" は
  ラベルなので自由に変更できます。
- **音声**：既定は**ブラウザ内蔵の音声合成（Web Speech API）**で、追加費用ゼロ・
  オフラインでも動作。ピッチ/速さ/ボイスは 🤖 パネルで調整できます。
- **特定キャラの声にそっくりにしたい場合**：内蔵音声では実現できません。
  正規にライセンスされた音声（例：外部TTSサービスや、権利元が提供するボイス）を
  使う必要があります。そのための**差し込み口（SEAM）**を `stage.js` の `speak()` に
  用意してあります。`POST /api/tts` のようなエンドポイントを足し、そこで正規TTSの
  音声を返す実装に置き換えれば、UIはそのまま声だけ差し替わります。
  ※他者の声や実在キャラの声を無断で複製する用途には使用しないでください。

## 💡 これから面白そうな機能の提案

実装済みの土台を活かせる、遊びとして面白い拡張アイデア:

1. **Git 風「英語コミット履歴」** — 書いた英文を `commit` して、ミスの傾向が
   時系列でどう改善したかを `git log` / diff 風に振り返る。過去の自分の英文を
   「リファクタ」して差分表示。

2. ~~**あなた専用の“テストスイート”（間違いの間隔反復）**~~ — ✅ **実装済み**
   （🧪 Test Suite モード / `public/srs.js`）。過去のエラーを弱点カードとして蓄積し、
   Leitner 方式で忘れた頃に狙い撃ち出題。合否をテストランナー風に採点します。

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
