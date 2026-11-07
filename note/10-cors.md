# 第 10 回 CORS とオリジン間通信

- **ゴール**: Same-Origin Policy と CORS の仕組みを理解し、開発/本番で正しく設定できる
- **対象ファイル**: `backend/src/index.ts:9`、`frontend/src/lib/api.ts:69`、`frontend/.dev.vars`
- **AI 時代の位置づけ**: curl の成功とブラウザの成功を区別し、セキュリティ設定の意味をレビューする

## 1. なぜこの回が存在するか

第 01 回の構成図をもう一度見てください。

```
frontend  http://localhost:3000   ── fetch ──▶   backend  http://localhost:8787
```

**スキーマは同じ https/http でも、ポートが違う = オリジンが違う** ため、
この fetch は「クロスオリジン通信」です。CORS を理解していないと

- 「ローカルでは動くのにデプロイしたら動かない」
- 「ブラウザのコンソールに赤いエラー、でも curl では成功する」

という実務で最も詰まりやすい現象に直面します。この回で根本を押さえます。

## 2. オリジンとは

```
scheme : // host : port
http://localhost:3000
```

3 要素がすべて同じとき「同一オリジン (same-origin)」。1 つでも違えば
「別オリジン (cross-origin)」です。

| ページ | API | 判定 |
|--------|-----|------|
| `http://localhost:3000` | `http://localhost:3000/api` | 同一 |
| `http://localhost:3000` | `http://localhost:8787` | **別 (ポート不一致)** |
| `https://app.example.com` | `https://api.example.com` | **別 (ホスト不一致)** |
| `http://localhost:3000` | `https://localhost:3000` | **別 (スキーマ不一致)** |

## 3. Same-Origin Policy (SOP) — ブラウザの保安体制

ブラウザには「**あるオリジンのスクリプトが、別オリジンから得たレスポンスを
読み取ってよいか** を制限する」保安上の規則があります。

誤解しやすい点を 2 つ:

1. **SOP はブラウザの規則** です。curl やサーバー同士 (Workers→Workers) の
   fetch には適用されません — 第 05 回で「API は curl でも叩ける」と何度も
   確認した通り、サーバ側は誰のリクエストでも普通に応答しています
2. **リクエスト自体は「送れて」しまう** ことが多い (特に POST は実際に届き、
   処理までされる)。**ブロックされるのは「JS がレスポンスを読むこと」** です。
   「サーバが 403 を返して止めている」のではない、という点が最重要です

SOP の意義: 悪意サイト `evil.example` にアクセスしたままログイン Cookie の
ついたリクエストを銀行 API に飛ばされ、**レスポンス (残高) を読まれる**、
といった攻撃を防ぐ基盤になっています。

## 4. CORS (Cross-Origin Resource Sharing) — 許可の交渉

CORS は「別オリジンからの読み取りを、**サーバが HTTP ヘッダで明示的に許可する**」
仕組みです。キーワードは 3 つ:

| 概要 | 要素 |
|------|------|
| 誰に | `Access-Control-Allow-Origin` ヘッダ |
| 何を (メソッド/ヘッダ) | `Access-Control-Allow-Methods` / `-Headers` |
| どの種類のリクエストか | シンプル / プリフライト付き |

### 4.1. シンプルなリクエスト vs プリフライト

ブラウザは、条件 (GET/POST/HEAD かつ特定ヘッダのみ 等) を満たす
「シンプルなリクエスト」は**いきなり本番リクエスト**を送り、そうでないものは
**事前に `OPTIONS` (プリフライト)** を送って許可を問い合わせます。

本プロジェクトはどうか? — 前回までに見た通り:

- `GET /api/books?q=...` → シンプル (GET + 一般ヘッダのみ)
- `POST /api/books` + `Content-Type: application/json` → **JSON は「シンプル」な
  Content-Type ではない**ためプリフライト発生
- `PATCH` / `DELETE` → これらのメソッド自体がシンプル対象外 → **プリフライト発生**

つまりこのアプリは**登録・更新・削除のたびに OPTIONS が飛んでいます**。
DevTools の Network パネルで `OPTIONS` を探すのがこの回のハンズオンです。

### 4.2. プリフライトの流れ (DELETE の例)

```
1. ブラウザ → サーバ
   OPTIONS /api/books/b15
   Origin: http://localhost:3000
   Access-Control-Request-Method: DELETE

2. サーバ → ブラウザ (Hono の cors() が応答)
   Access-Control-Allow-Origin: http://localhost:3000
   Access-Control-Allow-Methods: GET, HEAD, PUT, PATCH, POST, DELETE

3. 許可を確認したブラウザ → 本番の DELETE を送信 → レスポンスを JS が読める
```

プリフライトは**ブラウザが勝手に送る**もので、アプリコード (fetch 呼び出し) には
一切現れません。「fetch を 1 回書いたのに Network に 2 つ出る」のはこのためです。

## 5. このプロジェクトの CORS 設定

```ts
// backend/src/index.ts:9
app.use("/api/*", cors())
```

- Hono 公式ミドルウェア `cors` を **`/api/*` にだけ** 適用。
  すべてのパスではなく API に限定しているのは、不要なヘッダを
  出さないという意味で良い習慣です
- 引数なし = **全オリジン許可** (`Access-Control-Allow-Origin: *`)。
  GET ルート (`/`) に CORS が付かないのはミドルウェアのパターン指定の通り

### 5.1. 引数なし `cors()` の安全性を考える

「全オリジン許可 = 危険?」— この API ではどうか:

- **認証がない** (Cookie もトークンも無い) → 「許可された誰かだけが読めて
  はいけないデータ」が存在しない
- 悪意サイトからこの API を読めても、得るのは公開デモデータ
- 一方、**Cookie を使う認証を導入した瞬間に `*` は重大な穴** になる
  (`credentials` との組み合わせ問題。詳しくは発展資料)

実務の目安:

```ts
// 許可オリジンを列挙する (本番向けの書き方の例)
app.use("/api/*", cors({
  origin: ["https://your-frontend.example.com"],
  allowMethods: ["GET", "POST", "PATCH", "DELETE"],
}))
```

**「開発では引数なしで楽、本番では閉じる」** をこのプロジェクトの
発展課題として第 15 回でも再掲します。

## 6. 本番で起こる典型的な CORS 事故 (予習)

デプロイして壊れるパターンを先に知っておくと強いです。

| 症状 | 原因 |
|------|------|
| コンソールに「CORS policy...」で API が全滅 | backend Worker に CORS が無い/設定漏れ |
| GET は動くのに POST/PATCH が全部失敗 | プリフライト (`OPTIONS`) が 404 (ミドルウェア未適用) |
| `NEXT_PUBLIC_API_URL` 未設定で localhost を向いたまま | ビルド時の環境変数の焼き付け忘れ (第 13 回) |
| curl では成功、ブラウザでは失敗 | サーバ側は正常 → SOP によるブロックと気づく定石 |

## 7. フロント側の URL 設定

```ts
// frontend/src/lib/api.ts:69
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787"
```

`frontend/.dev.vars` で開発値を与えられます (詳細は第 13 回)。
CORS は「バックエンドが許可するリスト」と「フロントが向く先」の
**2 つが噛み合って初めて機能する** 点がややこしさの正体です。

## 8. ハンズオン

```bash
# 1. サーバから見た OPTIONS (プリフライト) を模擬する
curl -i -X OPTIONS http://localhost:8787/api/books \
  -H 'Origin: http://localhost:3000' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
# → Access-Control-Allow-* ヘッダが並ぶことを確認

# 2. CORS ミドルウェアが /api/* 限定であることを確認
curl -i http://localhost:8787/ | grep -i access-control || echo '/ には CORS ヘッダが無い'
```

### ブラウザで観察する

1. `http://localhost:3000` を開き DevTools → Network
2. 書籍を 1 冊登録すると `books` が 2 行になる: `OPTIONS` と `POST`
3. `OPTIONS` の方を選び、Response Headers の `Access-Control-Allow-...` を確認
4. **実験 (壊し確認)**: `backend/src/index.ts` の `app.use("/api/*", cors())` を
   コメントアウトしてバックエンドを再起動 (ファイル保存で自動リロード) →
   ブラウザをリロード → コンソールの CORS エラーと Network の失敗を観察 →
   **コメントを戻す**

## 9. AI ドリル — 予測・レビュー・改修

### 9.1 予測 — 実行前に当てる

1. `curl -i -X OPTIONS` とブラウザからの POST で、どのヘッダーとリクエストが
   観測できるかを予測する
2. CORS をコメントアウトした状態で、curl とブラウザの結果が同じになるかを予測し、
   「リクエストが送れない」のか「レスポンスを読めない」のかを区別する

### 9.2 レビュー — AI の出力を審査する

AI が本番の CORS 設定として次を提案した。ワイルドカード、credentials、パス指定、
許可メソッドの組み合わせにどんな問題があるか指摘する。

```ts
app.use("/api", cors({
  origin: "*",
  credentials: true,
  allowMethods: ["GET"],
}))
```

### 9.3 改修 — AI の失敗を直す

AI に開発用 `http://localhost:3000` と本番用 origin の allowlist を実装させる。
`OPTIONS` の検証、GET/POST/PATCH/DELETE の許可、`NEXT_PUBLIC_API_URL` の切り替えを
確認し、curl とブラウザの両方で壊れていないことを記録する。

## 10. まとめ

- ポート違いも別オリジン。`3000 → 8787` はクロスオリジン通信
- SOP は「ブラウザがレスポンスを読ませない」規則。curl は無関係
- JSON/PATCH/DELETE はプリフライト (`OPTIONS`) が必要で、ブラウザが自動送信する
- `app.use("/api/*", cors())` は全許可。認証を入れるならオリジンを列挙する

## 11. 次回予告

後半戦 (第 11 回〜) はフロントエンドに入ります。Next.js App Router の
「サーバー/クライアントの境界」(`layout.tsx` / `page.tsx` / `"use client"`) から
始めて `BookManager` が動く仕組みを積み上げます。
