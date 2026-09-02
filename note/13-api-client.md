# 第 13 回 型付き API クライアント

- **ゴール**: フロント↔API の境界を 1 モジュールに集約する設計とジェネリクス活用を習得する
- **対象ファイル**: `frontend/src/lib/api.ts` (127 行、全体)

## 1. このファイルの役割 — 「境界の門番」

`api.ts` は backend の知識がフロントに**漏れないようにする** ためのモジュールです。

```
BookManager.tsx (UI)  ── api.list / api.create ... ──▶  api.ts (境界)  ── fetch ──▶  backend
```

- UI は **URL もステータスコードも知らない**。`api.list({q: "..."})` と
  書くだけ (第 12 回の `BookManager` を見返すと、fetch も URL も出てこない)
- backend との約束 (パス・クエリ・エラー形式) が変わるとき、
  フロントで直すべき場所が **この 1 ファイルに収まる**

「API 仕様の変更がフロントのどこに波及するか」を小さく保つ、が
境界モジュールの目的です。

## 2. 通信の心臓部 `request<T>`

```ts
// frontend/src/lib/api.ts:81-93
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  })
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const errors = extractErrors(data) ?? [`リクエストに失敗しました (HTTP ${res.status})`]
    throw new ApiError(errors)
  }
  return data as T
}
```

ジェネリック関数 `request<T>` は「呼び出し側が**期待する型** を申告すると、
その型の値を返す (失敗すれば throw する)」通信関数です。行ごとに読みます。

1. **`Content-Type` をデフォルトで付ける** — `...init?.headers` の spread が後ろ
   にあるので、呼び出し側が指定すれば上書きできる (デフォルト値の差し込み順)
2. **`res.json().catch(() => null)`** — 第 04 回の `c.req.json().catch(() => null)` と
   対になる書き方。サーバが JSON 以外 (502 の HTML など) を返しても壊れない
3. **`if (!res.ok)`** — HTTP ステータスが 2xx かどうか (第 06 回で並べた
   コード体系がここで消費される)。**fetch は 4xx/5xx でも reject しない** ので、
   この明示チェックが必須 — fetch の一番の初見ハマりポイントです
4. **`extractErrors(data) ?? [...HTTP ${res.status}]`** — backend 約束の
   `{ errors: string[] }` (第 04/06 回) を信頼するが、**壊れた応答にもフォールバック**。
   「契約 + 保険」の二段構え
5. **`data as T`** — 最後の `as` は「検査済みという前提での申告」。
   境界モジュールの責務は「検査の責任をここで引き受ける」こと。
   (第 07 回の `unknown` → 検査と比べると、ここでは検査を「サーバーを信じる」
   に簡略化している。zod 等で強化するのが発展形)

### 2.1. `ApiError` — エラーも型で運ぶ

```ts
// frontend/src/lib/api.ts:59-67
export class ApiError extends Error {
  errors: string[]
  constructor(errors: string[]) {
    super(errors.join(" / "))
    this.name = "ApiError"
  }
}
```

エラーの本体は `errors: string[]` です (backend 第 06 回の形式そのまま)。
第 12 回のハンドラで使った `err instanceof ApiError` の **instanceof による
絞り込み** により、UI 側は「サーバが書いた日本語のメッセージ」を
そのまま表示できていました。独自 Error サブクラスは「失敗にも型を付ける」
最も手軽な手段です。

## 3. 公開 API — オブジェクトでグルーピング

```ts
// frontend/src/lib/api.ts:105-127
export const api = {
  list: (params: ListParams = {}) =>
    request<{ total: number; items: Book[] }>(`/api/books${withQuery(params)}`),

  stats: () => request<Stats>("/api/stats"),

  create: (input: BookInput) =>
    request<{ item: Book }>("/api/books", { method: "POST", body: JSON.stringify(input) }),

  update: (id: string, patch: Partial<BookInput>) =>
    request<{ item: Book }>(`/api/books/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  remove: (id: string) =>
    request<{ deleted: boolean }>(`/api/books/${id}`, { method: "DELETE" }),

  reset: () => request<{ reset: boolean }>("/api/reset", { method: "POST" }),
}
```

書き方の教訓:

- **レスポンス型を呼び出し側で与える** (`request<{ item: Book }>`) — 
  エンドポイントごとの差分が型引数 1 つで表現できる。これがジェネリクスの
  「同じ処理・違う型」を 1 関数に集める威力です
- **引数の型も意味で切る**: `create` は必須項目 `BookInput`、`update` は
  **`Partial<BookInput>`** (一部分だけでよい — 第 07 回の PATCH マージ再検査の
  フロント側表現)
- `body: JSON.stringify(input)` — オブジェクトを渡すと呼び出し側は
  JSON 化を意識しない (境界の仕事)

### 3.1. `withQuery` — URL 組み立ての安全化

```ts
// frontend/src/lib/api.ts:95-103
function withQuery(params: ListParams): string {
  const q = new URLSearchParams()
  if (params.q) q.set("q", params.q)
  ...
  const s = q.toString()
  return s ? `?${s}` : ""
}
```

- `URLSearchParams` が**日本語や記号のエンコード**を請け負う
  (手で `?q=${q}` と書くと `コード` が化ける or `&` を含む入力で壊れる)
- 「値が空ならキー自体を出さない」— 第 08 回の「空文字 = フィルタ無効」との
  約束をここで守る (空 `q=` を送るとサーバの `if (q)` と意味が変わるため)

## 4. 環境変数で接続先を切り替える

```ts
// frontend/src/lib/api.ts:69
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787"
```

- `NEXT_PUBLIC_` 接頭辞の付いた環境変数は **クライアントバンドルに埋め込まれる**
  (機密を入れてはいけない接頭辞である理由がこれ)
- `??` のデフォルトで「cloned したらすぐ動く」経験を担保
- **Next.js では環境変数はビルド時に値が焼き付く** 点に注意
  (実行時に変えたい場合、Workers 側の `vars` と工夫が要る — 第 15 回)
- 開発用の値は `frontend/.dev.vars` に置ける (OpenNext の仕組み。
  本プロジェクトでは未設定 = デフォルトが効いている)

これは第 10 回 CORS の「フロントが向く先」の設定箇所そのものです。
URL 設定・CORS 許可・エラー形式の 3 つが揃って初めて連携が成立します。

## 5. フロント側の型はなぜ「緩い」か (第 02 回の再訪)

`api.ts` の `Book.category` は `string` で、backend の
`BookCategory | (string & {})` より緩く、`BookInput.rating` はオプショナルです。

- 境界モジュールは「**受けても壊れない**」形にする → サーバが将来カテゴリを
  増やしても、古いフロントが型エラーで詰まらない
- 一方 `BookStatus` は **ユニオンのまま** — 
  `StatusBadge` (第 14 回) が `Record<BookStatus, ...>` で全ケース網羅を
  強制するため、ここを緩めると網羅性が失われる

「どこを緩く、どこを厳しく」= 「将来変わりやすいものは緩く、
UI が全ケース処理を強制したいものは厳しく」。境界設計の判断練習として
この対比を覚えてください。

## 6. ハンズオン

```bash
npm run dev:frontend   # backend も起動しておく
```

1. DevTools → Network で登録ボタンを押す → `Request Payload` が
   `JSON.stringify` された `BookInput` であること、URL が `/api/books` 
   であることを確認 (UI には両者どこにも書かれていないことの体感)
2. **backend を止めて** (Ctrl-C) 登録を試す → `ApiError` ではなく
   `TypeError: fetch failed` 系のエラーになることを確認 (第 12 回の
   `err instanceof ApiError ? ... : "登録に失敗しました"` フォールバックが効く)
   → backend 再起動
3. `.dev.vars` に `NEXT_PUBLIC_API_URL=http://localhost:9999` を書いて
   フロントを再起動 → 一覧が取れないことを確認 → **ファイルを空に戻して** 再起動

## 7. 演習

1. **`getBook` を追加** せよ (`request<{ item: Book }>(`/api/books/${id}`)`)。
   UI は作らなくてよい (境界モジュールの拡張練習)
2. **`ApiError` に `status` を持たせる**: `constructor(errors: string[], status?: number)` 
   に拡張し、`request` で渡す。UI で 404 のときだけ特別扱いできるようにせよ
3. **タイムアウトを付ける**: `AbortSignal.timeout(5000)` を fetch の `signal` に
   渡すように変更し、backend を止めたときの挙動 (5 秒で失敗) を確認せよ
4. **思考問題**: `request<T>` の戻り値を `Promise<T>` ではなく
   「`{ ok: true; data: T } | { ok: false; errors: string[] }` な Promise」にすると
   どう変わるか? (第 07 回の結果型との対比。throw/instanceof を全部 if に
   書き換える作業量も見積もってみよ)

## 8. まとめ

- `api.ts` = 境界の門番。URL・メソッド・JSON・エラー形式をここに集約
- `request<T>` ジェネリック + `as T` で「型の申告」を 1 箇所で受ける
- fetch は 4xx/5xx で reject しない → `res.ok` チェックが必須
- `ApiError` (instanceof 可能なエラー) + フォールバックで「契約 + 保険」
- `NEXT_PUBLIC_*` はビルド時に焼き付く公開設定

## 9. 次回予告

第 14 回は UI に戻り、`BookManager.tsx` 前半の小コンポーネント群
(`StatusBadge` / `Stars` / `StatCard`) と Tailwind CSS によるスタイリング、
「いつコンポーネントを分けるか」を読み解きます。
