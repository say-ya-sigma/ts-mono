# 講義ノート (ts-mono 書籍管理システム)

TypeScript モノレポ × Next.js × Hono / Cloudflare Workers による書籍管理システムを
題材にした全 15 回の講義ノートです。実際に手を動かしながら進めます。

## 前提

- Node.js 20+ / npm 11+ (workspaces 対応)
- ターミナル 2 つ + ブラウザ + エディタ (VS Code 推奨)
- HTTP の基本 (リクエスト/レスポンス、JSON) を扱ったことがある

## ロードマップ

| 回 | テーマ | 主に対象にするファイル |
|---:|--------|------------------------|
| 01 | ガイダンス: 全体像と開発環境 | `README.md` |
| 02 | TypeScript の型でデータモデルを表現する | `backend/src/books.ts` |
| 03 | npm workspaces とモノレポ構成 | `package.json` |
| 04 | Hono 入門: ルーティングとレスポンス | `backend/src/index.ts` |
| 05 | Cloudflare Workers と wrangler | `backend/wrangler.jsonc` |
| 06 | REST API 設計: メソッドとステータスコード | `backend/src/index.ts` |
| 07 | サーバー側バリデーションと型安全 | `backend/src/store.ts` |
| 08 | 検索・フィルタ・ソートの実装 | `backend/src/store.ts` |
| 09 | 統計エンドポイントとデータ集計 | `backend/src/store.ts` |
| 10 | CORS とオリジン間通信 | `backend/src/index.ts` |
| 11 | Next.js App Router の基礎 | `frontend/src/app/` |
| 12 | React の状態管理とデータ取得 | `frontend/src/components/BookManager.tsx` |
| 13 | 型付き API クライアント | `frontend/src/lib/api.ts` |
| 14 | UI コンポーネント設計と Tailwind CSS | `frontend/src/components/BookManager.tsx` |
| 15 | デプロイと次のステップ (D1 永続化) | `*/wrangler.jsonc` |

## 進め方

各回は「ゴール → 本編 → ハンズオン → 演習 → まとめ」で構成しています。
初回 (01) で環境を起動したら、以降は毎回の冒頭でバックエンドとフロントエンドを
立ち上げた状態で進めてください。

```bash
npm install
npm run dev:backend   # ターミナル 1 → http://localhost:8787
npm run dev:frontend  # ターミナル 2 → http://localhost:3000
```

データは 15 冊のシードデータ (`b01`〜`b15`) から始まり、再起動または
`POST /api/reset` で元に戻ります。実験で壊したらいつでもリセットできます。
