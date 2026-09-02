import { Hono } from "hono"
import { cors } from "hono/cors"

import * as store from "./store"

const app = new Hono<{ Bindings: CloudflareBindings }>()

// フロントエンド (localhost:3000) からのアクセスを許可するため CORS を有効化
app.use("/api/*", cors())

app.get("/", (c) => {
  return c.json({
    name: "書籍管理システム API",
    endpoints: {
      "GET /api/books": "一覧 (クエリ: q, category, status, sort)",
      "GET /api/books/:id": "詳細",
      "POST /api/books": "登録",
      "PATCH /api/books/:id": "部分更新 (貸出・返却など)",
      "DELETE /api/books/:id": "削除",
      "GET /api/stats": "統計情報",
      "POST /api/reset": "シードデータに戻す (デモ用)",
    },
  })
})

// ---------- 一覧: 検索・フィルタ・ソート ----------
app.get("/api/books", (c) => {
  const books = store.listBooks({
    q: c.req.query("q"),
    category: c.req.query("category"),
    status: c.req.query("status"),
    sort: c.req.query("sort"),
  })
  return c.json({ total: books.length, items: books })
})

// ---------- 詳細 ----------
app.get("/api/books/:id", (c) => {
  const book = store.getBook(c.req.param("id"))
  if (!book) return c.json({ errors: ["指定された ID の書籍が見つかりません"] }, 404)
  return c.json({ item: book })
})

// ---------- 登録 ----------
app.post("/api/books", async (c) => {
  const body = await c.req.json().catch(() => null)
  const result = store.createBook(body)
  if (!result.ok) return c.json({ errors: result.errors }, 400)
  return c.json({ item: result.book }, 201)
})

// ---------- 部分更新 (貸出・返却・編集) ----------
app.patch("/api/books/:id", async (c) => {
  const body = await c.req.json().catch(() => null)
  const result = store.updateBook(c.req.param("id"), body)
  if (!result.ok) return c.json({ errors: result.errors }, result.notFound ? 404 : 400)
  return c.json({ item: result.book })
})

// ---------- 削除 ----------
app.delete("/api/books/:id", (c) => {
  const deleted = store.deleteBook(c.req.param("id"))
  if (!deleted) return c.json({ errors: ["指定された ID の書籍が見つかりません"] }, 404)
  return c.json({ deleted: true })
})

// ---------- 統計 ----------
app.get("/api/stats", (c) => {
  return c.json(store.getStats())
})

// ---------- デモデータのリセット ----------
app.post("/api/reset", (c) => {
  store.resetToSeed()
  return c.json({ reset: true })
})

// ---------- エラーハンドリング ----------
app.onError((err, c) => {
  console.error(JSON.stringify({ level: "error", message: String(err) }))
  return c.json({ errors: ["サーバー内部エラーが発生しました"] }, 500)
})

app.notFound((c) => {
  return c.json({ errors: ["エンドポイントが見つかりません"] }, 404)
})

export default app
