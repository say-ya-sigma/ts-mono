# backend — 書籍管理 API (Hono on Cloudflare Workers)

```txt
npm install
npm run dev
```

起動すると http://localhost:8787 で書籍管理 API が動きます。
API 仕様・学習課題は ルートの ../README.md を参照してください。

```txt
npm run deploy
```

[For generating/synchronizing types based on your Worker configuration run](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

Pass the `CloudflareBindings` as generics when instantiating `Hono`:

```ts
// src/index.ts
const app = new Hono<{ Bindings: CloudflareBindings }>()
```
