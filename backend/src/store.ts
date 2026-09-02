// インメモリストア + バリデーション + 検索・フィルタ・ソート・統計のロジック層
// ※ デモ用のためメモリ上に保持(再起動でリセット)。本番では D1 / Durable Objects を使う。

import {
  BOOK_STATUSES,
  SEED_BOOKS,
  type Book,
  type BookInput,
  type BookStatus,
} from "./books"

const books = new Map<string, Book>()
for (const book of SEED_BOOKS) books.set(book.id, book)

// ---------- バリデーション ----------

const ISBN_RE = /^(?:\d{9}[\dXx]|\d{13})$/

export type ValidationResult =
  | { ok: true; value: BookInput }
  | { ok: false; errors: string[] }

function asString(v: unknown): v is string {
  return typeof v === "string"
}

// 必須文字列の検証: エラーを errors に追記し、無効なときは "" を返す
function requireText(value: unknown, name: string, errors: string[], maxLength?: number): string {
  if (!asString(value) || value.trim() === "") {
    errors.push(`${name} は必須です`)
    return ""
  }
  const trimmed = value.trim()
  if (maxLength !== undefined && trimmed.length > maxLength) {
    errors.push(`${name} は ${maxLength} 文字以内にしてください`)
  }
  return trimmed
}

function validateBookInput(body: unknown): ValidationResult {
  const errors: string[] = []
  if (typeof body !== "object" || body === null) {
    return { ok: false, errors: ["リクエストボディは JSON オブジェクトにしてください"] }
  }
  const b = body as Record<string, unknown>

  const title = requireText(b.title, "title", errors, 200)
  const author = requireText(b.author, "author", errors)
  const publisher = requireText(b.publisher, "publisher", errors)
  const category = requireText(b.category, "category", errors, 20)

  const rawIsbn = asString(b.isbn) ? b.isbn.replace(/-/g, "") : ""
  if (!ISBN_RE.test(rawIsbn)) {
    errors.push("isbn は ISBN-10 / ISBN-13 形式にしてください (例: 978-4001001094)")
  }

  let publishedYear = 0
  if (typeof b.publishedYear === "number" && Number.isInteger(b.publishedYear)) {
    publishedYear = b.publishedYear
  } else {
    errors.push("publishedYear は 1000〜2100 の整数にしてください")
  }
  if (publishedYear !== 0 && (publishedYear < 1000 || publishedYear > 2100)) {
    errors.push("publishedYear は 1000〜2100 の整数にしてください")
    publishedYear = 0
  }

  let rating = 0
  if (b.rating !== undefined) {
    if (typeof b.rating === "number" && Number.isInteger(b.rating) && b.rating >= 0 && b.rating <= 5) {
      rating = b.rating
    } else {
      errors.push("rating は 0〜5 の整数にしてください (0=未評価)")
    }
  }

  let status: BookStatus | undefined
  if (b.status !== undefined) {
    if (asString(b.status) && (BOOK_STATUSES as string[]).includes(b.status)) {
      status = b.status as BookStatus
    } else {
      errors.push(`status は ${BOOK_STATUSES.join(" / ")} のいずれかにしてください`)
    }
  }

  let borrower: string | null | undefined
  if (b.borrower !== undefined && b.borrower !== null) {
    if (asString(b.borrower) && b.borrower.trim() !== "") {
      borrower = b.borrower.trim()
    } else {
      errors.push("borrower は借用者名の文字列、または null にしてください")
    }
  } else if (b.borrower === null) {
    borrower = null
  }
  if ((status === "貸出中" || status === "予約中") && !borrower) {
    errors.push(`status が ${status} の場合は borrower (借用者名) が必須です`)
  }

  if (errors.length > 0) return { ok: false, errors }

  const value: BookInput = {
    title,
    author,
    publisher,
    isbn: rawIsbn,
    category,
    publishedYear,
    rating,
    ...(status !== undefined ? { status } : {}),
    ...(borrower !== undefined ? { borrower } : {}),
  }
  return { ok: true, value }
}

// ---------- クエリ (検索・フィルタ・ソート) ----------

export interface ListParams {
  q?: string
  category?: string
  status?: string
  sort?: string
}

export function listBooks({ q, category, status, sort = "-registeredAt" }: ListParams): Book[] {
  let result = [...books.values()]

  if (q) {
    const needle = q.toLowerCase()
    result = result.filter((b) =>
      [b.title, b.author, b.publisher, b.isbn].some((f) => f.toLowerCase().includes(needle))
    )
  }
  if (category) result = result.filter((b) => b.category === category)
  if (status) {
    result = result.filter((b) => b.status === status)
  }

  const desc = sort.startsWith("-")
  const field = desc ? sort.slice(1) : sort
  const comparators: Record<string, (a: Book, b: Book) => number> = {
    title: (a, b) => a.title.localeCompare(b.title, "ja"),
    author: (a, b) => a.author.localeCompare(b.author, "ja"),
    publishedYear: (a, b) => a.publishedYear - b.publishedYear,
    rating: (a, b) => a.rating - b.rating,
    registeredAt: (a, b) => a.registeredAt.localeCompare(b.registeredAt),
  }
  const comparator = comparators[field] ?? comparators.registeredAt
  result.sort((a, b) => (desc ? -comparator(a, b) : comparator(a, b)))
  return result
}

// ---------- CRUD ----------

export function getBook(id: string): Book | undefined {
  return books.get(id)
}

export function createBook(body: unknown): { ok: true; book: Book } | { ok: false; errors: string[] } {
  const validated = validateBookInput(body)
  if (!validated.ok) return validated

  const input = validated.value
  const now = new Date().toISOString()
  const book: Book = {
    id: crypto.randomUUID(),
    title: input.title,
    author: input.author,
    publisher: input.publisher,
    isbn: input.isbn,
    category: input.category,
    publishedYear: input.publishedYear,
    rating: input.rating,
    status: input.status ?? "在庫あり",
    borrower: input.borrower ?? null,
    registeredAt: now,
    updatedAt: now,
  }
  books.set(book.id, book)
  return { ok: true, book }
}

export function updateBook(id: string, body: unknown): { ok: true; book: Book } | { ok: false; errors: string[]; notFound?: boolean } {
  const current = books.get(id)
  if (!current) return { ok: false, errors: ["指定された ID の書籍が見つかりません"], notFound: true }
  if (typeof body !== "object" || body === null) {
    return { ok: false, errors: ["リクエストボディは JSON オブジェクトにしてください"] }
  }

  const validated = validateBookInput({ ...current, ...body })
  if (!validated.ok) return validated

  const input = validated.value
  const updated: Book = {
    ...current,
    ...input,
    // 返却 (在庫あり) になったら借用者をクリア
    borrower: input.status === "在庫あり" ? null : (input.borrower ?? current.borrower),
    updatedAt: new Date().toISOString(),
  }
  books.set(id, updated)
  return { ok: true, book: updated }
}

export function deleteBook(id: string): boolean {
  return books.delete(id)
}

// ---------- 統計 ----------

export interface Stats {
  total: number
  byStatus: Record<BookStatus, number>
  byCategory: { category: string; count: number }[]
  averageRating: number
  publishedYearRange: { oldest: number | null; newest: number | null }
}

export function getStats(): Stats {
  const all = [...books.values()]
  const byStatus = { "在庫あり": 0, "貸出中": 0, "予約中": 0 } as Record<BookStatus, number>
  const categoryCount = new Map<string, number>()
  let ratingSum = 0
  let oldest: number | null = null
  let newest: number | null = null

  for (const b of all) {
    byStatus[b.status] += 1
    categoryCount.set(b.category, (categoryCount.get(b.category) ?? 0) + 1)
    ratingSum += b.rating
    oldest = oldest === null ? b.publishedYear : Math.min(oldest, b.publishedYear)
    newest = newest === null ? b.publishedYear : Math.max(newest, b.publishedYear)
  }

  const rated = all.filter((b) => b.rating > 0)
  return {
    total: all.length,
    byStatus,
    byCategory: [...categoryCount.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
    averageRating: rated.length > 0 ? Math.round((ratingSum / all.length) * 10) / 10 : 0,
    publishedYearRange: { oldest, newest },
  }
}

export function resetToSeed(): void {
  books.clear()
  for (const book of SEED_BOOKS) {
    books.set(book.id, { ...book })
  }
}
