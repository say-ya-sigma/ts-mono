# 第 14 回 UI コンポーネント設計と Tailwind CSS

- **ゴール**: 小コンポーネントの分割判断と Tailwind による効率的なスタイリングを習得する
- **対象ファイル**: `frontend/src/components/BookManager.tsx` 1-159 行 (表示コンポーネント群) と表部分

## 1. このファイルのコンポーネント構成

```
BookManager.tsx
├── StatusBadge   ステータス 1 個 → 色付きラベル
├── Stars         rating 1 個 → ★ 表示
├── StatCard      label + value → 統計カード 1 枚
├── AddBookForm   登録フォーム (閉じた状態と送信を所有)
└── BookManager   状態とデータ取得を所有する本体
```

「**状態を持たない小コンポーネント + 状態を 1 か所に持つ本体**」という
2 層構造です。この回の主題は「なぜこの切り方なのか」です。

## 2. 小コンポーネントから学ぶ — まずは `StatusBadge`

```tsx
// frontend/src/components/BookManager.tsx:17-24
function StatusBadge({ status }: { status: BookStatus }) {
  const styles: Record<BookStatus, string> = {
    在庫あり: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
    貸出中:   "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    予約中:   "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  }
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[status]}`}>{status}</span>
}
```

見るべき点が 3 つ:

1. **`Record<BookStatus, string>` の全網羅** — 第 02 回から続くユニオン型の恩恵の
   着地地点。新しい status を足すと `styles` に 1 エントリ足すまで
   **コンパイルが通らない**。「case 忘れ」という UI バグを型が防ぐ、
   React × TypeScript の代表テクニックです
2. **`props` が 1 個で状態を持たない** = 同じ props から必ず同じ見た目
   (純粋な表示関数)。テストも再利用も容易
3. 色 = 意味 (emerald=在庫, amber=貸出, sky=予約) を 1 か所に集中。
   表の中に散らばらない

### 2.1. `Stars` — 「未評価」の表示分岐

```tsx
// frontend/src/components/BookManager.tsx:26-34
function Stars({ rating }: { rating: number }) {
  if (rating === 0) return <span className="text-xs opacity-50">未評価</span>
  return (
    <span className="text-amber-500" title={`評価: ${rating}/5`}>
      {"★".repeat(rating)}
      <span className="opacity-30">{"★".repeat(5 - rating)}</span>
    </span>
  )
}
```

第 02 回のデータ設計 (`rating: 0` = 未評価) が UI でどう着地するかを示す
コンポーネントです。`"★".repeat(rating)` — 絵文字やアイコンライブラリを
使わず文字列演算で間に合わせる軽量さはデモらしい選択です
(实務では `lucide-react` 等の StarIcon + aria-label が堅牢)。

## 3. Tailwind CSS の読み方 — 「クラス名で UI を組み上げる」

Tailwind は「あらかじめ用意されたユーティリティクラスの組み合わせで
見た目を宣言する」方式です。`StatCard` を解剖します。

```tsx
// frontend/src/components/BookManager.tsx:36-43
function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-black/10 bg-white/70 p-4 dark:border-white/15 dark:bg-white/5">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs opacity-60">{label}</div>
    </div>
  )
}
```

| クラス | 意味 |
|--------|------|
| `rounded-xl` | 角を大きく丸める |
| `border border-black/10` | 1px 枠・黒の 10% 透過 |
| `bg-white/70` | 白 70% の背景 (透け感) |
| `p-4` | padding 1rem |
| `dark:...` | **ダークモード時の上書き** |
| `tabular-nums` | 数字を等幅に (カードの数値がちらつかない) |

### 3.1. なぜ CSS を書かずにクラス並べなのか

- **ローカル性**: 見た目の定義が JSX のすぐそばにある。CSS ファイルを
  またぐ追跡がない
- **命名が不要**: `.stat-card-title` のような名前を考える労力と
  「同じ見た目に別名が乱立する」問題が消える
- **未使用クラスが残らない**: ビルド時に使用クラスだけが CSS に出力される
  (Tailwind 4 では CSS 側 `@import "tailwindcss"` で有効化 — `globals.css` 参照)
- 代价: className が長い。**繰り返し出てきたら定数化する** のがこの
  プロジェクトの流儀です — まさに次節

### 3.2. 繰り返しの抽出 — `inputClass` / `buttonClass`

```ts
// frontend/src/components/BookManager.tsx:45-48
const inputClass =
  "rounded-lg border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/20 dark:bg-white/10 dark:[color-scheme:dark]"
const buttonClass =
  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40"
```

「Tailwind で書くと長い」問題へのこのファイルの答えは、
**CSS モジュールでもコンポーネント化でもなく、文字列定数** です。

- `disabled:opacity-40` — 状態バリアント (`submitting` 中のボタンが
  半透明になるのはこれ。第 12 回の二重送信防止と接続)
- 検索欄・セレクト・貸出入力欄が **全部同じ `inputClass`** を使うことで、
  アプリ全体の入力欄の見た目が自然に統一される

「共通化はまず定数 → 本当に増えたらコンポーネント」の段階的な判断は
小規模 UI の実務的な黄金比です。

## 4. 表 (テーブル) の設計 — 368-410 行を眺める

データ一覧の表示パターンとして押さえる点:

- **3 状態の行**: `loading` →「読み込み中…」/ 0 件 →「該当する書籍がありません」/
  一覧 → `books.map(...)`。**「空と通信中を区別する」** は一覧 UI 最低限の作法
- `key={book.id}` — リスト要素の key は安定な ID (配列 index は NG — 
  並び替え・削除で DOM の対応が崩れるため)
- `hover:bg-black/[.02]` — 任意値構文 `[.02]` で細かい透過を直接指定
- ステータスごとに **操作ボタンが条件分岐** (`在庫あり` → 貸出、`貸出中` → 
  返却、`予約中` → 予約取消) — 第 06 回 API 設計 (同じ PATCH に集約) と
  第 12 回 (handleReturn 共有) がここで見た目に着地する
- 貸出行だけ **入力欄に差し替わる** (`lendingId === book.id` 分岐) — 
  モーダルを持ち出さない「行内編集 (inline edit)」の簡潔な実装例。
  `autoFocus`、Enter で確定 / Escape で取消のキー操作まで面倒を見ている

## 5. アクセシビリティの作法と限界

このファイルで **やっている** こと:

- `<label>` が入力欄を包む → クリック領域の拡大と読み上げ対応 (フォーム)
- `title` による補足 (`評価: ${rating}/5`)
- `tabular-nums`・`uppercase` など視認性の細工

**やっていない** こと (学習の発展として自覚する):

- テーブルの `<th>` と `scope` の結び付け不足、ボタンの `aria-label`
  (「削除」が何の削除かが行単位で読み上げられない)
- 貸出入力の Escape は `onKeyDown` 手実装 (`aria-keyshortcuts` の通知なし)
- エラー表示が色だけでなく文字でも伝わるように `role="alert"` を付ける等

「デモの簡潔さ」と「配慮の網羅」のトレードオフを意識できることが
この素材を使う利点です。演習で改善してもらいます。

## 6. コンポーネント分割の判断基準 (まとめ直し)

このファイルから抽出できる基準:

1. **再利用率** — `StatusBadge` は表の各行 (15+) で使うから分離
2. **状態の有無** — `AddBookForm` は自身の form 状態を持つから分離し、
   本体とは `onCreated` コールバック **1 本** でつなぐ
3. **知識の局所化** — 「★ の見せ方」「status の色」を知るのは
   それぞれのコンポーネントだけ。`BookManager` は知らない
4. **逆に分けない** — 本体の `refresh` 系は 1 か所に置いた方が読める
   (第 12 回)。分けすぎは害

「**同じ props → 同じ見た目** の表示関数を切り、状態は最小の上位に集める」。
これがこの 417 行ファイルが破綻せずに済んでいる理由です。

## 7. ハンズオン

1. **`styles` の網羅を体感する**: `backend/src/books.ts` の `BOOK_STATUSES` に
   `"紛失"` を一時追加 → `npm run typecheck` で `StatusBadge` の
   `styles` がエラーになることを確認 (エラー箇所が UI 側に出るのが味噌) → 戻す
2. **色を変える**: `貸出中` の amber を rose 系に変えて保存 → ホットリロードで
   即座に変わることを確認 → 戻す
3. **`Stars` を絵文字に**: `"★"` を `"★★"` のような別文字に変えて
   `repeat` の動作を確認 → 戻す

## 8. 演習

1. **`CategoryBadge` を作れ**: カテゴリを `StatusBadge` 風のラベルで表示する
   コンポーネントを追加せよ (色はカテゴリ数ぶん定義する方法を考える — 
   `BOOK_CATEGORIES` は 6 個。`Record<string, string>` で足りるか?)
2. **削除ボタンに `aria-label`** を付与せよ (`aria-label={`「${book.title}」を削除`}``)
3. **`inputClass` を広げる**: 第 08 回演習の `publishedYearMin` を UI に足す場合、
   どこにどのクラスで追加するか設計せよ (実装は任意)
4. **思考問題**: `AddBookForm` を「カテゴリごとに別フォーム」に分割すると
   どんな不利益があるか? (状態の重複・UI の一貫性の観点で)

## 9. まとめ

- `Record<ユニオン, ...>` で全ケース網羅を型に強制させる
- Tailwind = クラスの並びで UI を宣言。繰り返しは定数 (`inputClass`) に
- 一覧は「通信中 / 0 件 / データ」の 3 状態を必ず区別する
- 分割判断は「再利用率・状態の有無・知識の局所化」で行う

## 10. 次回予告

最終回の第 15 回はこれまでを統合して「本番」を見すえます。
OpenNext による Cloudflare デプロイ、D1 による永続化 (store.ts の置き換え)、
認証・テスト・型共有などの発展課題を整理します。
