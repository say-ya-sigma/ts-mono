# 第 12 回 React の状態管理とデータ取得

- **ゴール**: 実務的なフックの使い方 (状態設計・副作用・デバウンス・並行取得) を習得する
- **対象ファイル**: `frontend/src/components/BookManager.tsx` (163-417 行を主に)
- **AI 時代の位置づけ**: 状態・副作用・依存関係を追跡し、AI が作る race condition を実験で確かめる

## 1. `BookManager` の状態設計

まず全体像から。「何を状態として持つか」が React 設計の核心です。

```ts
// frontend/src/components/BookManager.tsx:163-177 (要旨)
const [books, setBooks] = useState<Book[]>([])       // 一覧 (サーバの真実を映す)
const [stats, setStats] = useState<Stats | null>(null) // 統計 (null = 未取得)
const [loading, setLoading] = useState(true)         // 通信中か
const [error, setError] = useState<string | null>(null) // 表示中のエラー

const [q, setQ] = useState("")                        // 検索文字列
const [category, setCategory] = useState("")
const [status, setStatus] = useState("")
const [sort, setSort] = useState("-registeredAt")     // クエリ条件

const [lendingId, setLendingId] = useState<string | null>(null) // 貸出入力中の行
const [borrowerName, setBorrowerName] = useState("")
```

設計眼を養うポイント:

- **サーバー由来の状態 (books/stats) と UI 状態 (q/lendingId) を区別** している。
  前者は「再取得でまるごと置換」、後者は「利用者が操作する」もので、
  混ぜると更新タイミングの推理ゲームになる
- `stats: Stats | null` — 「まだ取れていない」ことを `null` で表現 (第 09 回の
  `oldest: null` と同型の発想)。`Stats` を `?` (undefined) にする流派もあるが、
  このファイルでは null を使っている
- `books: Book[]` は「**今のクエリ条件での** 一覧」— 絞り込みはサーバーに
  任せている (第 08 回) ため、クライアント側で filter をしない
  (状態の重複を持たない、が原則。「一覧と検索条件から導けるもの」を
  状態にしない = Single Source of Truth)

## 2. `refresh` — 取得の中心化と `useCallback`

```ts
// frontend/src/components/BookManager.tsx:179-194 (要旨)
const refresh = useCallback(async () => {
  setLoading(true)
  setError(null)
  try {
    const [{ items }, s] = await Promise.all([
      api.list({ q, category, status, sort }),
      api.stats(),
    ])
    setBooks(items)
    setStats(s)
  } catch (err) {
    setError(err instanceof ApiError ? err.errors.join(" / ") : "一覧の取得に失敗しました")
  } finally {
    setLoading(false)
  }
}, [q, category, status, sort])
```

この 1 関数が「取得の単一経路」です。注目点:

1. **`Promise.all` で並行取得** — 一覧と統計は互いに依存しないので直列に
   `await` するのは損 (合計待ち時間 = 各待ち時間の和になるため)。
   第 09 回で「統計を別エンドポイントに分けた」効果がここで回収される
2. **`try / catch / finally`** — 成功時だけ `setLoading(false)` と書くと
   失敗時に loading が永久に true になる。`finally` が鉄則
3. **`useCallback` の依存配列 `[q, category, status, sort]`** — 条件が変わると
   「新鮮な refresh 関数」が作り直される。この指定が次の `useEffect` と
   組み合わさって「条件が変わったら再取得」を実現する
4. `err instanceof ApiError` — API クライアントが投げる型付きエラー (第 13 回)
   だけ特別扱いし、それ以外は汎用メッセージにフォールバック

### 2.1. 取得ライブラリを使わない理由

React Query / SWR 等を使えばキャッシュ・再試行・ローディングを
ライブラリに任せられます。このプロジェクトが「素の fetch + フック」で
書いてあるのは学習上の選択です。**どのライブラリもやっていることは
この `refresh` の一般化** だと知ってから導入する、が本講義の方針です
(第 15 回の発展課題)。

## 3. `useEffect` とデバウンス

```ts
// frontend/src/components/BookManager.tsx:196-200
useEffect(() => {
  // 検索文字列の入力ごとに API が飛びすぎないよう 300ms のデバウンス
  const timer = setTimeout(refresh, 300)
  return () => clearTimeout(timer)
}, [refresh])
```

この 5 行は「入力 → 取得」の連動の中心です。分解します。

1. `q` が変わる → `refresh` が新しく作られる (依存配列より) →
   `useEffect` の `refresh` 依存が変化 → 効果が再実行
2. 効果: **300ms 後に `refresh` を走らせるタイマー** を予約
3. 300ms 以内にさらに `q` が変わる → React は **クリーンアップ 
   (`clearTimeout`) を呼んでから** 次の効果を予約 → 
   古いタイマーの `refresh` は発火しない

結果: 連打している間はリクエストが飛ばず、**入力が止まって 300ms 後に 1 回だけ** 
飛ぶ。これがデバウンスです。クリーンアップ関数を返す `useEffect` の規約が
「前の効果の取消」を担う典型例です。

### 3.1. なぜ即時実行しないのか

「`q` が変わるたびに即 `refresh()`」だと、`"リファクタリング"` と打つだけで
10 リクエスト (リ/リフ/リファ…) が飛びます。1 文字ごとに結果は使い捨てられ、
サーバーにもブラウザにも無駄な負荷です。**UI の見た目の滑らかさと API の
呼び出し回数のバランスを取る** のがこの手の実装の本質です。
(「300ms」は体感で許容される遅延として常用される値。50ms では意味が薄く、
1000ms では「反応が悪い」と感じ始めます)

### 3.2. 「effect 内で setState してもよいか」問題 (発展)

厳密には effect での取得は「結果が届く頃には条件が変わっている」
競合 (race condition) を抱え得ます。この実装ではデバウンスが実質的な
緩和になっていますが、React 18+ の厳格モードや並行機能と組み合わせる
場合は「前のリクエストを中断 (AbortController)」やライブラリ利用が
定石です — この API はシンプルなのでここでは深入りしませんが、知っておく
トピックとして挙げます。

## 4. 操作ハンドラ — 「API を呼んで refresh」

```ts
// frontend/src/components/BookManager.tsx:204-218 (要旨)
const handleLend = async (id: string) => {
  const name = borrowerName.trim()
  if (!name) { setError("借用者名を入力してください"); return }
  try {
    await api.update(id, { status: "貸出中", borrower: name })
    setLendingId(null)
    setBorrowerName("")
    await refresh()
  } catch (err) {
    setError(err instanceof ApiError ? err.errors.join(" / ") : "貸出処理に失敗しました")
  }
}
```

`handleReturn` / `handleDelete` / `handleReset` も同じ型
(`操作 → 成功なら refresh、失敗なら setError`) です。ここに読み取れる作法:

- **クライアント側でも最低限の検証** (`name` の空チェック) は行うが、
  最終判断はサーバー (第 07 回) — 400 が返ってきたら `errors` をそのまま表示
- **操作後の手動 `refresh`** — クライアントで `books` を直接書き換えて
  「済んだふり」をしない。**サーバーの真実を引き直す** 方が、
  状態の整合を 1 か所 (サーバー) に集約できる (「楽観的更新」という
  対策はあるが、まずは確実な方針を覚える)
- `handleDelete` / `handleReset` は `window.confirm` で確認を挟む — 
  **破壊的操作は 1 クリックで実行させない** UI 原則
- 「予約取消」ボタンが `handleReturn` を使い回している (第 06 回で予告した通り) — 
  `PATCH {status:"在庫あり"}` という「同じ API 操作」だから

## 5. 派生的な表示は `useMemo`

```ts
// frontend/src/components/BookManager.tsx:249-259 (要旨)
const summary = useMemo(() => {
  if (!stats) return null
  return <div className="grid ...">...StatCard 4 枚...</div>
}, [stats])
```

`stats` が変わらない限り **同じ要素を再計算しない**。今回は軽い JSX なので
効果は小さいですが、「**状態から導けるものをメモ化して伝える**」という
`useMemo` の正しい使い方の例です (依存配列 `[stats]` がその条件)。

注意: `useMemo` は「基本的にはパフォーマンス最適化」であり、
多用が推奨されるものではありません。まずは「派生値を **`useState` に
しない**」という設計自体が本質です。

## 6. フォーム管理 (登録フォームの抜粋)

`AddBookForm` (72-159 行) では「1 オブジェクトで form 全体を持つ」方式を取ります。

```ts
const [form, setForm] = useState<FormState>(emptyForm)

const set = (key: keyof FormState) => (e: React.ChangeEvent<...>) =>
  setForm((f) => ({ ...f, [key]: e.target.value }))
```

- フィールドごとに `useState` を作らず、**オブジェクト + 差分スプレッド** で
  管理 (state の数を増やさない)
- `set("title")` のように **キーを渡して setter を作るファクトリ** で
  input の `onChange` を簡潔に共通化
- `submitting` で二重送信を防止 (`disabled={submitting}`) — ボタンの連打に
  対する実務的な防御
- 全フィールド **`string` で持って送信時に `Number()` 変換** (第 07 回で
  サーバーが `typeof === "number"` を要求する理由がこれ)

## 7. ハンズオン

1. DevTools → Network で検索ボックスに `リーダブル` と **素早く** 打ち込む →
   リクエストが 1 回だけ飛ぶことを確認 (遅く打つと文字数分飛ぶ)
2. **デバウンスを 3000ms に変えて体感** (BookManager.tsx の `300`) →
   「反応が悪い」を体感したら戻す
3. **`refresh` 内の `Promise.all` を直列に変える**:
   `const items = await api.list(...)` → `const s = await api.stats()` 
   (分割代入も書き換え)。Network のウォーターフォールが直列になるのを確認 → 戻す

## 8. AI ドリル — 予測・レビュー・改修

### 8.1 予測 — 実行前に当てる

1. 検索文字を 300ms 以内に 3 文字入力したとき、リクエストが何回飛ぶかを予測し、
   Network パネルで確認する
2. `Promise.all` を一覧取得の後の stats 取得に書き換えたとき、待ち時間と loading の
   表示がどう変わるかを予測する

### 8.2 レビュー — AI の出力を審査する

AI が `refresh` を短く書き直した。依存配列、タイマーの cleanup、失敗時の loading、
古い検索条件の捕捉 (stale closure) の観点から問題を指摘する。

```tsx
const refresh = useCallback(async () => {
  const [{ items }, s] = await Promise.all([
    api.list({ q, category, status, sort }),
    api.stats(),
  ])
  setBooks(items)
  setStats(s)
  setLoading(false)
}, [])

useEffect(() => {
  setTimeout(refresh, 300)
}, [refresh])
```

### 8.3 改修 — AI の失敗を直す

AI に「登録後は検索条件をリセットし、操作中の行だけ busy 表示にして」と依頼する。
生成された変更を適用し、デバウンスによる二重取得がないか、失敗時に `loading` が
永久に残らないか、複数行の入力状態を持つ設計が本当に必要かを検証する。

## 9. まとめ

- 状態は「サーバー由来」「UI」「その派生」に分類し、派生は `useMemo` で
- 取得は `refresh` に単一経路化。独立した取得は `Promise.all` で並行に
- `useEffect` + タイマー破棄で 300ms デバウンス。`finally` で loading を必ず落とす
- 操作は「API を呼び、成功したら refresh」。クライアントで楽観的に書き換えない

## 10. 次回予告

第 13 回は `refresh` が呼んでいる相手 `frontend/src/lib/api.ts` を解剖し、
`request<T>` ジェネリクス・`ApiError`・環境変数の扱いといった
「境界モジュール」の設計を学びます。
