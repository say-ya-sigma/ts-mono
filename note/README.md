# 講義ノート (ts-mono 書籍管理システム)

TypeScript モノレポ × Next.js × Hono / Cloudflare Workers による書籍管理システムを
題材にした全 15 回の講義ノートと卒業課題です。AI に実装を任せることも含めて、
出力を読み、検証し、責任を持って修正するところまでを学びます。

## 前提

- Node.js 22+ / npm 11+ (workspaces 対応)
- ターミナル 2 つ + ブラウザ + エディタ (VS Code 推奨)
- HTTP の基本 (リクエスト/レスポンス、JSON) を扱ったことがある
- AI の利用を推奨 (ただし出力の検証と判断理由を記録する)

## 3 部構成とロードマップ

| 部 | 回 | テーマ | 主に対象にするファイル |
|---|---:|--------|------------------------|
| I. 読む | 01 | ガイダンス: 全体像と開発環境 | `README.md` |
| I. 読む | 02 | TypeScript の型でデータモデルを表現する | `backend/src/books.ts` |
| I. 読む | 03 | npm workspaces とモノレポ構成 | `package.json` |
| I. 読む | 04 | Hono 入門: ルーティングとレスポンス | `backend/src/index.ts` |
| I. 読む | 05 | Cloudflare Workers と wrangler | `backend/wrangler.jsonc` |
| II. 設計判断 | 06 | REST API 設計: メソッドとステータスコード | `backend/src/index.ts` |
| II. 設計判断 | 07 | サーバー側バリデーションと型安全 | `backend/src/store.ts` |
| II. 設計判断 | 08 | 検索・フィルタ・ソートの実装 | `backend/src/store.ts` |
| II. 設計判断 | 09 | 統計エンドポイントとデータ集計 | `backend/src/store.ts` |
| II. 設計判断 | 10 | CORS とオリジン間通信 | `backend/src/index.ts` |
| III. 型で縛る | 11 | Next.js App Router の基礎 | `frontend/src/app/` |
| III. 型で縛る | 12 | React の状態管理とデータ取得 | `frontend/src/components/BookManager.tsx` |
| III. 型で縛る | 13 | 型付き API クライアント | `frontend/src/lib/api.ts` |
| III. 型で縛る | 14 | UI コンポーネント設計と Tailwind CSS | `frontend/src/components/BookManager.tsx` |
| III. 型で縛る | 15 | デプロイと次のステップ (D1 永続化) | `*/wrangler.jsonc` |
| 卒業課題 | — | AI 協働で本番化する | [`16-capstone.md`](16-capstone.md) |
| 付録 | A1 | Book 型の共通パッケージ `book-types` の作成 | `packages/book-types/` |

### 3 部の目的

- **I. 読む**: システムの地図を持ち、AI の変更がどの層に影響するかを追えるようにする
- **II. 設計判断**: HTTP・入力検証・検索・集計・CORS の「なぜ」を説明できるようにする
- **III. 型で縛る**: 型と境界を契約として使い、生成コードの逸脱を検出できるようにする

## 進め方

各回は「ゴール → 本編 → ハンズオン → AI ドリル → まとめ」で構成しています。
初回 (01) で環境を起動したら、以降は毎回の冒頭でバックエンドとフロントエンドを
立ち上げた状態で進めてください。

```bash
npm install
npm run dev:backend   # ターミナル 1 → http://localhost:8787
npm run dev:frontend  # ターミナル 2 → http://localhost:3000
```

データは 15 冊のシードデータ (`b01`〜`b15`) から始まり、再起動または
`POST /api/reset` で元に戻ります。実験で壊したらいつでもリセットできます。

## AI ドリルの進め方

各回の AI ドリルは、次の順で行います。AI の回答を得ること自体はゴールではありません。

1. **予測**: 実行前に、結果・型エラー・影響範囲を自分の言葉で書く
2. **レビュー**: AI のパッチにある仕様漏れ、境界条件、セキュリティ上の問題を指摘する
3. **改修**: 最小の変更を加え、`curl`・`npm run typecheck`・`npm run lint`・`npm run build`
   などで判断を検証する

提出や授業内の評価では、生成されたコードの量よりも、予測の根拠・レビューの発見・
改修後の検証結果を重視します。AI を使わずに解いても構いませんが、AI を使った場合は
プロンプトと採用しなかった提案も記録してください。

## 卒業課題

全 15 回の後は [`16-capstone.md`](16-capstone.md) に進みます。README の学習課題から
1 つを選び、AI に実装させ、レビューし、受理または差し戻しを判断します。提出物は
動くコードだけでなく、仕様・レビュー記録・検証結果を含むレビューレポートです。
