# 付録 A1 — Book 型の共通パッケージ `book-types` の作成

- **ゴール**: 第 03 回で「するとしたらこう」と話した型の共有パッケージを実際に作り、共通化作業 (差し替え) がすぐ始まる状態にする
- **対象ファイル**: `packages/book-types/*`、ルート `package.json`、`frontend/package.json`、`backend/package.json`、`frontend/next.config.ts`
- **位置づけ**: 第 03 回 5 節「型はどこに置くべきか?」の発展。第 02 回 `backend/src/books.ts` と第 13 回 `frontend/src/lib/api.ts` の二重定義を解消する土台

## 1. 経緯

第 02 回〜第 13 回で、`Book` 関連の型は 2 か所にほぼ同じ形で複製されています。

| 場所 | 定義 |
|------|------|
| `backend/src/books.ts` | `BookStatus` / `BOOK_STATUSES` / `BOOK_CATEGORIES` / `BookCategory` / `Book` / `BookInput` |
| `frontend/src/lib/api.ts` | `BookStatus` / `BOOK_STATUSES` / `Book` / `BookInput` |

モノレポ (第 03 回) なので「1 つのパッケージに置いて双方から import する」が可能です。
今回はその**土台まで**を整えました。既存コードを共有型に差し替える共通化作業自体は別の
編集で行います。

> 第 03 回のディスカッションでは仮に `packages/shared/` と書きましたが、今回は
> `book-types` という名前にしました。「Book の契約型」という目的がパッケージ名から
> 直接読めるためです。

## 2. 新規ファイル — `packages/book-types`

```
packages/book-types/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts    ← エントリポイント
    └── book.ts     ← 実体 (backend/src/books.ts と同じ定義)
```

### 2.1. `package.json` — ビルドしない (ソース直接参照)

```json
{
  "name": "book-types",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

大事なのは `"exports": { ".": "./src/index.ts" }` の部分。一般に公開するパッケージなら
ビルド済みの `.js` を指しますが、このリポジトリでは:

- frontend / backend どちらも tsconfig が `moduleResolution: "Bundler"`
- 呼び出し側は必ずバンドルされる (Next.js / wrangler・esbuild)

という理由で、**エントリポイントを `.ts` に直に向けられます**。ビルドステップと
ビルド設定が不要になり、「共通パッケージを直したのに再ビルドを忘れて、実行中の型と
差し替え後の型が食い違う」事故が原理的に起こりません。その代わり npm には公開できない
(`src` を配る前提) ので `private: true` です。

### 2.2. `tsconfig.json` — typecheck 専用

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "lib": ["ESNext"],
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

このパッケージは自分では JS を出力しません (`noEmit`)。ソースのトランスパイルは
すべて呼び出し側のバンドル時に処理されます。tsconfig は**型検査のためだけ**に存在します。
`isolatedModules` は「型 import と値 export を混同してもバンドラがエラーで拾う」ための保険です。

### 2.3. `src/book.ts` — 実体

`backend/src/books.ts` の型群と同一内容です (省略はしません — 実物はファイルを参照)。

```ts
export type BookStatus = "在庫あり" | "貸出中" | "予約中"

export const BOOK_STATUSES: BookStatus[] = ["在庫あり", "貸出中", "予約中"]

export const BOOK_CATEGORIES = [
  "文学",
  "技術書",
  "実用書",
  "ビジネス",
  "科学",
  "歴史",
] as const

export type BookCategory = (typeof BOOK_CATEGORIES)[number]

export interface Book {
  id: string
  title: string
  author: string
  publisher: string
  isbn: string
  category: BookCategory | (string & {})
  publishedYear: number
  status: BookStatus
  rating: number
  borrower: string | null
  registeredAt: string
  updatedAt: string
}

export type BookInput = Pick<
  Book,
  "title" | "author" | "publisher" | "isbn" | "category" | "publishedYear" | "rating"
> & { status?: BookStatus; borrower?: string | null }
```

### 2.4. `src/index.ts` — エントリ (ファサード)

```ts
export type { Book, BookCategory, BookInput, BookStatus } from "./book"
export { BOOK_CATEGORIES, BOOK_STATUSES } from "./book"
```

- 型は `export type`、定数は普通の `export` — isolatedModules 下ではこの区別が重要です
- 「公開面」を 1 ファイルで眺められる。差し替え時に定義の追加・削除を書き換えるのはこの 1 行だけ

frontend 側に現れないもの (`BOOK_CATEGORIES` 等) も含めて export していますが、
これは過剰ではありません。「API 契約」を 1 か所に置くには、契約の候補を漏らさず
書いておく必要があるためです。

## 3. 既存ファイルへ連携 — 4 か所の設定

### 3.1. ルート `package.json` — workspaces と typecheck に追加

```json
"workspaces": ["frontend", "backend", "packages/book-types"],
...
"typecheck": "npm -w frontend exec tsc -- --noEmit && npm -w backend exec tsc -- --noEmit && npm -w book-types exec tsc -- --noEmit"
```

- workspaces に第 3 のメンバーを追加した
- typecheck の `&&` 接続は第 03 回どおり。全ワークスペースを型検査に通す責任をここに置く

### 3.2. `frontend/package.json` / `backend/package.json` — dependencies 宣言

```json
"dependencies": {
  "book-types": "*",
  ...省略
}
```

- `package.json` に書かないと「この import 文が動く理由が説明できない」(第 03 回の幽霊依存)
- monorepo 内ローカル依存はバージョン指定に実質意味がないため `"*"` が簡潔です

### 3.3. `frontend/next.config.ts` — transpilePackages

```ts
const nextConfig: NextConfig = {
  transpilePackages: ["book-types"],
  ...
}
```

Next.js は node_modules 以下をそのままバンドルし、TS ソースを通常トランスパイルしません
(JS 前提の依存を想定しています)。そのままだと `src/index.ts` の import が通らないため、
transform 対象として明示します。第 03 回の `useTypeScriptCli` ワークアラウンドと同系の、
**「モノレポではツール想定外の使い方に設定が要る」** の好例です。

### 3.4. `npm install` — リンクの作成

```bash
npm install
ls -la node_modules/book-types   # -> ../packages/book-types
```

workspaces への追加と npm install を行うと、ルート `node_modules/` から
`packages/book-types/` へ symlink が張られます。backend / frontend の
`dependencies` にある `book-types` 宣言を経由して、このパッケージへの import 文が
解決できるようになります。

## 4. 検証

```bash
npm run typecheck
```

→ frontend / backend / book-types の全 3 ワークスペースで `--noEmit` を通すことを確認済み。
この状態では既存コードを一切消していないため、**追加のみの変更であることが検証できています**。

## 5. 残作業 — 共通化作業

パッケージの土台は整いました。あとは「2 つに複製された型群を import に差し替える」だけです:

```bash
# backend: backend/src/books.ts から型群の定義を消して import に置き換える
#   (seedBook / SEED_BOOKS 等のロジックはそのまま残す)
# frontend: frontend/src/lib/api.ts の型群を import に置き換える
npm run typecheck && npm run lint
```

並行して次の点も確認・棚卸ししてください:

| 差し替え対象 | 型群の差分 |
|---|---|
| `backend/src/books.ts` | 型定義が一致 → 丸ごと移せる |
| `frontend/src/lib/api.ts` | `BOOK_CATEGORIES` / `BookCategory` が無いため、共有側から extra として持ってくる形になる |

あわせて読むべきな点:

- `Book.category` の中身 (`BookCategory | (string & {})`) は「空文字列もありうる実装上の
  妥協」という意図を表現していますが、その **意図がコード上に注釈されていない** ことに
  注意しておいてください。`(string & {})` で何を殺しているのか、予測 → 検証の演習に最適です
- `frontend/src/lib/api.ts` に残っている `BOOK_STATUSES` は UI に export されているので、
  共有に寄せた後の UI 側 import 先を変える必要があったかを確認してください

## 6. まとめ

- `book-types` パッケージを新設した — `exports` で `.ts` を直接向ける理由は「バンドルを
  呼び出し側に押し付け、差異をなくす」こと。そのための `tsconfig` が `noEmit` である理由
- 連携は 4 つの箇所: ルート `workspaces`、frontend/backend の `dependencies`、
  `next.config.ts` の `transpilePackages`、`npm install` による symlink
- 検証として全 3 ワークスペースで `typecheck` を通した
- 残作業は「複製された 2 ファイルの型群を import に差し替える」のみで、すぐ着手可能

## 関連回

- 第 02 回: Book 型の実体 (移す定義と順番の参考)
- 第 03 回 5 節: 共有 vs 複製のトレードオフ (本付録は共有側の回答の実行)
- 第 13 回: 型付き API クライアント (差し替え先の frontend 側契約)
