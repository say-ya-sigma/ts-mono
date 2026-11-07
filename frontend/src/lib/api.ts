import type { Book, BookInput, BookStatus } from "book-types"
export  { BOOK_CATEGORIES, BOOK_STATUSES } from "book-types"
export { Book, BookStatus }

export interface ListParams {
  q?: string
  category?: string
  status?: string
  sort?: string
}

export interface Stats {
  total: number
  byStatus: Record<BookStatus, number>
  byCategory: { category: string; count: number }[]
  averageRating: number
  publishedYearRange: { oldest: number | null; newest: number | null }
}

export class ApiError extends Error {
  errors: string[]

  constructor(errors: string[]) {
    super(errors.join(" / "))
    this.name = "ApiError"
    this.errors = errors
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787"

function extractErrors(data: unknown): string[] | null {
  if (typeof data === "object" && data !== null && "errors" in data) {
    const errors = (data as { errors: unknown }).errors
    if (Array.isArray(errors) && errors.every((e) => typeof e === "string")) {
      return errors
    }
  }
  return null
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  })
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const errors =
      extractErrors(data) ?? [`リクエストに失敗しました (HTTP ${res.status})`]
    throw new ApiError(errors)
  }
  return data as T
}

function withQuery(params: ListParams): string {
  const q = new URLSearchParams()
  if (params.q) q.set("q", params.q)
  if (params.category) q.set("category", params.category)
  if (params.status) q.set("status", params.status)
  if (params.sort) q.set("sort", params.sort)
  const s = q.toString()
  return s ? `?${s}` : ""
}

export const api = {
  list: (params: ListParams = {}) =>
    request<{ total: number; items: Book[] }>(`/api/books${withQuery(params)}`),

  stats: () => request<Stats>("/api/stats"),

  create: (input: BookInput) =>
    request<{ item: Book }>("/api/books", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  update: (id: string, patch: Partial<BookInput>) =>
    request<{ item: Book }>(`/api/books/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),

  remove: (id: string) =>
    request<{ deleted: boolean }>(`/api/books/${id}`, { method: "DELETE" }),

  reset: () => request<{ reset: boolean }>("/api/reset", { method: "POST" }),
}
