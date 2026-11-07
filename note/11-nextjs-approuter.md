# 第 11 回 Next.js App Router の基礎

- **ゴール**: App Router のファイル規約とサーバー/クライアントの境界を理解する
- **対象ファイル**: `frontend/src/app/layout.tsx`、`frontend/src/app/page.tsx`、`frontend/src/components/BookManager.tsx` (1 行目)、`frontend/next.config.ts`
- **AI 時代の位置づけ**: サーバー/クライアント境界を仕様として読み、不要なクライアント化を防ぐ

## 1. App Router の考え方 — ファイルが URL になる

`frontend/src/app/` 以下のディレクトリ・ファイル名がそのままルート (URL) に
対応する方式です (Pages Router の「ファイル = ページ」と違い、
**ディレクトリ = 区画** を基調にレイアウトやデータ取得を重ねられます)。

```
src/app/
├── layout.tsx    全ページ共通の <html> 骨格
├── page.tsx      "/" に対応するページ
└── globals.css   Tailwind の取り込みなど (layout から import)
```

`page.tsx` があるとそのパスがルートとして有効になります。
たとえば `/books` を足したければ `src/app/books/page.tsx` を置くだけです。

## 2. `layout.tsx` — 全体の骨格

```tsx
// frontend/src/app/layout.tsx (要旨)
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "書籍管理システム",
  description: "Next.js (App Router) + Hono on Cloudflare Workers による学習用デモ",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <head><link rel="icon" href="/favicon.svg" type="image/svg+xml" /></head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
```

読み取るべき点:

- **`<html>` と `<body>` を書く** — このコンポーネントは「ページの外側」まで
  担当する (ページ毎に HTML 骨格を書かせないための規約)
- `export const metadata` — `<title>` / description などヘッド情報を
  **オブジェクトとして宣言** する App Router 流の書き方
- `next/font/google` — フォントをビルド時に最適化 (CSS 変数 `--font-geist-sans`
  として露出し、Tailwind の `font-sans` 統合に使う)
- **`RootLayout` は再描画されにくい** — ページ遷移してもレイアウトは保たれ、
  その中の `children` だけ差し替わる。だから共通ヘッダー/フッターはここに置く

## 3. `page.tsx` — 最小のページ

```tsx
// frontend/src/app/page.tsx
import BookManager from "@/components/BookManager";

export default function Home() {
  return <BookManager />;
}
```

たった 5 行ですが、見るべき点があります。

- **`@/` はパスエイリアス** (`tsconfig.json` の `paths` 定義)。
  `../../components/BookManager` のような相対地獄を避ける定番構成
- `page.tsx` には **いきなり `"use client"` がない** — つまりこのファイルは
  デフォルトの「サーバーコンポーネント」。本体の `"use client"` は
  `BookManager.tsx` 側にある (次節)
- `Home` は Server Component → クライアントへは **表示に必要な最小の形で**
  送られる (第 12 回で詳しく)

## 4. `"use client"` — サーバーとクライアントの境界

```tsx
// frontend/src/components/BookManager.tsx:1
"use client"
```

この 1 行ディレクティブの意味:

- このファイル (とそこから import されるもの) は **ブラウザで動くコンポーネント**
  として扱われる
- `useState` / `useEffect` / `onChange` などの「インタラクション API」は
  **この境界の内側でしか使えない**
- 境界の外 (サーバーコンポーネント) は「JS をブラウザに送らず、
  出力結果 (HTML) だけを送れる」領域 — これが App Router の性能原理です

つまりこのアプリの構図は:

```
[Server]            [Client Browser]
layout.tsx  ─┐
page.tsx    ─┴─▶  <BookManager> (use client)  ← 状態も fetch もイベントも全部ここ
```

「**`"use client"` を書く場所 = インタラクションの必要な一番外側**」が原則です。
`page.tsx` に `"use client"` を書くと、ページ全体がクライアント化し、
サーバーコンポーネントの恩恵をそのページで失います。このプロジェクトが
「薄い page.tsx (サーバー) + 全部込みの BookManager (クライアント)」に
割り切っているのは、単一ページ・完全に動的なデモとしては妥当な選択です
(本来はもっと細かく分けて、静的な部分はサーバーに残します)。

### 4.1. `initOpenNextCloudflareForDev()` の役割

```ts
// frontend/next.config.ts (末尾)
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
```

開発中の `next dev` でも Cloudflare bindings (環境) にアクセスできるようにする
OpenNext の仕掛けです (設定の豆知識として第 03 回も参照)。

## 5. App Router で「データを取ってくる」3 つの型

このプロジェクトのやり方を位置づけるため、App Router の選択肢を整理します。

| 方式 | 実装場所 | 特徴 |
|------|----------|------|
| (a) Server Component + fetch | サーバーコンポーネント内 | SSR。`useState` 不要だが更新 (mutation) に弱い |
| (b) Route Handlers (`route.ts`) | app ディレクトリ内 | Next 自身が API を持つ形。今回はバックエンドが別 Worker なので不使用 |
| (c) **Client Component + fetch** (本プロジェクト) | `"use client"` 内 | 検索・登録・貸出など**操作のたびに再取得** が要る UI 向き |

「検索文字を打つたび/ボタンを押すたびに最新を取り直したい」本 UI では
(c) が最も自然です。これは「App Router だから全部サーバーで」ではなく
**画面の性質で選ぶ** という実務的な判断例として重要です。

## 6. 開発とビルド

```bash
npm run dev:frontend   # next dev (開発サーバ, :3000)
npm -w frontend run build   # 本番ビルド (第 15 回では OpenNext 経由で Workers 化)
```

`next dev` はファイル保存でホットリロードし、エラーをオーバーレイ表示します。
**この講義では「バックエンド起動 → フロント起動」の順を推奨** —
フロント起動時に即 API を叩くためです (叩けなければエラー表示になるだけで
致命傷ではありませんが)。

## 7. ハンズオン

```bash
npm run dev:frontend
```

1. `http://localhost:3000` を開き、DevTools の Elements で `<html lang="ja">` と
   `<title>` を確認する (layout.tsx の産物)
2. `layout.tsx` の `title` を「書籍管理システム (演習)」に変えて保存 →
   タブの表示が変わることを確認 (戻す)
3. **`"use client"` を一時的に外す実験**: `BookManager.tsx` の 1 行目を
   コメントアウトして保存 → `useState` 等が使えないことによる
   **型エラー/実行エラー** を観察する (クライアント API の使用が境界で
   検出される体感) → 戻す

## 8. AI ドリル — 予測・レビュー・改修

### 8.1 予測 — 実行前に当てる

1. `page.tsx` に `"use client"` を追加した場合、どのコンポーネントまでブラウザ側へ
   広がるか、現在の `BookManager.tsx` の境界から予測する
2. `BookManager.tsx` の `"use client"` を外した場合、`useState`・`useEffect`・イベント
   ハンドラのどれが境界違反になるかを予測してから保存する

### 8.2 レビュー — AI の出力を審査する

AI が「最初から全部 Client Component にすれば簡単」と提案した。次の変更について、
境界の広がり、ブラウザへ送る JavaScript、Server Component の利点の観点からレビューする。

```tsx
// frontend/src/app/page.tsx
"use client"

import BookManager from "@/components/BookManager"

export default function Home() {
  return <BookManager />
}
```

### 8.3 改修 — AI の失敗を直す

AI に `/about` ページと共通ナビを追加させる。`/about` は `"use client"` なしで
完成させ、ページ間で維持したい UI を `layout.tsx` に置く。実際に移動して、不要な
再マウントや Server Component のクライアント化が起きていないか確認する。

## 9. まとめ

- `app/` のディレクトリ構造が URL。`layout.tsx` = 骨格、`page.tsx` = ページ
- `"use client"` がサーバー/クライアントの境界。インタラクションは境界の内側
- このアプリは「薄いサーバー page + クライアント BookManager」に割り切り
- データ取得方式は画面の性質で選ぶ (本 UI は操作駆動 → クライアント fetch)

## 10. 次回予告

第 12 回は `BookManager.tsx` の本体を読み、`useState` / `useEffect` /
`useCallback` / `useMemo` の実践的使用法と、デバウンス・`Promise.all` による
データ取得フローを学びます。
