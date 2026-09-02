"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import {
  ApiError,
  api,
  BOOK_CATEGORIES,
  BOOK_STATUSES,
  type Book,
  type BookStatus,
  type Stats,
} from "@/lib/api"

// ---------- 小さな表示用コンポーネント ----------

function StatusBadge({ status }: { status: BookStatus }) {
  const styles: Record<BookStatus, string> = {
    在庫あり: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
    貸出中: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    予約中: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  }
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[status]}`}>{status}</span>
}

function Stars({ rating }: { rating: number }) {
  if (rating === 0) return <span className="text-xs opacity-50">未評価</span>
  return (
    <span className="text-amber-500" title={`評価: ${rating}/5`}>
      {"★".repeat(rating)}
      <span className="opacity-30">{"★".repeat(5 - rating)}</span>
    </span>
  )
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-black/10 bg-white/70 p-4 dark:border-white/15 dark:bg-white/5">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs opacity-60">{label}</div>
    </div>
  )
}

const inputClass =
  "rounded-lg border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-white/20 dark:bg-white/10 dark:[color-scheme:dark]"
const buttonClass =
  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40"

// ---------- 新規登録フォーム ----------

interface FormState {
  title: string
  author: string
  publisher: string
  isbn: string
  category: string
  publishedYear: string
  rating: string
}

const emptyForm: FormState = {
  title: "",
  author: "",
  publisher: "",
  isbn: "",
  category: "技術書",
  publishedYear: "",
  rating: "0",
}

function AddBookForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState<FormState>(emptyForm)
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors([])
    setSubmitting(true)
    try {
      await api.create({
        title: form.title,
        author: form.author,
        publisher: form.publisher,
        isbn: form.isbn,
        category: form.category,
        publishedYear: Number(form.publishedYear),
        rating: Number(form.rating),
      })
      setForm(emptyForm)
      onCreated()
    } catch (err) {
      setErrors(err instanceof ApiError ? err.errors : ["登録に失敗しました"])
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <label className="col-span-2 grid gap-1 text-xs opacity-70">
        書名 (必須)
        <input className={`${inputClass} col-span-full`} value={form.title} onChange={set("title")} placeholder="例: リファクタリング" />
      </label>
      <label className="grid gap-1 text-xs opacity-70">
        著者 (必須)
        <input className={inputClass} value={form.author} onChange={set("author")} placeholder="例: Martin Fowler" />
      </label>
      <label className="grid gap-1 text-xs opacity-70">
        出版社 (必須)
        <input className={inputClass} value={form.publisher} onChange={set("publisher")} placeholder="例: オーム社" />
      </label>
      <label className="grid gap-1 text-xs opacity-70">
        ISBN (必須)
        <input className={inputClass} value={form.isbn} onChange={set("isbn")} placeholder="例: 978-4274222867" />
      </label>
      <label className="grid gap-1 text-xs opacity-70">
        カテゴリ
        <select className={inputClass} value={form.category} onChange={set("category")}>
          {BOOK_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs opacity-70">
        出版年 (必須)
        <input className={inputClass} inputMode="numeric" value={form.publishedYear} onChange={set("publishedYear")} placeholder="例: 2014" />
      </label>
      <label className="grid gap-1 text-xs opacity-70">
        評価 (0〜5)
        <select className={inputClass} value={form.rating} onChange={set("rating")}>
          {[0, 1, 2, 3, 4, 5].map((r) => (
            <option key={r} value={r}>{r === 0 ? "未評価" : `★ ${r}`}</option>
          ))}
        </select>
      </label>
      <div className="flex items-end">
        <button
          type="submit"
          disabled={submitting}
          className={`${buttonClass} w-full bg-blue-600 text-white hover:bg-blue-700`}
        >
          {submitting ? "登録中…" : "登録する"}
        </button>
      </div>
      {errors.length > 0 && (
        <ul className="col-span-full grid gap-1 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {errors.map((e) => (
            <li key={e}>・{e}</li>
          ))}
        </ul>
      )}
    </form>
  )
}

// ---------- メイン ----------

export default function BookManager() {
  const [books, setBooks] = useState<Book[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 検索・フィルタ・ソートの条件 (変更すると一覧を再取得)
  const [q, setQ] = useState("")
  const [category, setCategory] = useState("")
  const [status, setStatus] = useState("")
  const [sort, setSort] = useState("-registeredAt")

  // 貸出処理中の書籍 ID (その行に借用者名の入力欄を表示)
  const [lendingId, setLendingId] = useState<string | null>(null)
  const [borrowerName, setBorrowerName] = useState("")

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

  useEffect(() => {
    // 検索文字列の入力ごとに API が飛びすぎないよう 300ms のデバウンス
    const timer = setTimeout(refresh, 300)
    return () => clearTimeout(timer)
  }, [refresh])

  // --- 操作ハンドラ (それぞれ対応する API を呼ぶ) ---

  const handleLend = async (id: string) => {
    const name = borrowerName.trim()
    if (!name) {
      setError("借用者名を入力してください")
      return
    }
    try {
      await api.update(id, { status: "貸出中", borrower: name })
      setLendingId(null)
      setBorrowerName("")
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.errors.join(" / ") : "貸出処理に失敗しました")
    }
  }

  const handleReturn = async (id: string) => {
    try {
      await api.update(id, { status: "在庫あり" })
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.errors.join(" / ") : "返却処理に失敗しました")
    }
  }

  const handleDelete = async (book: Book) => {
    if (!window.confirm(`「${book.title}」を削除しますか?`)) return
    try {
      await api.remove(book.id)
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.errors.join(" / ") : "削除に失敗しました")
    }
  }

  const handleReset = async () => {
    if (!window.confirm("デモデータ (シード 15 冊) に戻しますか?")) return
    try {
      await api.reset()
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.errors.join(" / ") : "リセットに失敗しました")
    }
  }

  const summary = useMemo(() => {
    if (!stats) return null
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="総蔵書数" value={stats.total} />
        <StatCard label="在庫あり" value={stats.byStatus["在庫あり"]} />
        <StatCard label="貸出中" value={stats.byStatus["貸出中"]} />
        <StatCard label="予約中" value={stats.byStatus["予約中"]} />
      </div>
    )
  }, [stats])

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6 sm:p-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">書籍管理システム</h1>
          <p className="mt-1 text-sm opacity-60">
            Next.js (App Router) + Hono on Cloudflare Workers — モノレポ連携デモ
          </p>
        </div>
        <button onClick={handleReset} className={`${buttonClass} border border-black/15 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10`}>
          デモデータに戻す
        </button>
      </header>

      {summary}

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
          <button onClick={() => setError(null)} className="ml-3 underline">閉じる</button>
        </div>
      )}

      <section className="rounded-2xl border border-black/10 bg-white/60 p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
        <h2 className="mb-3 font-semibold">新規登録</h2>
        <AddBookForm onCreated={refresh} />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${inputClass} min-w-52 flex-1`}
            placeholder="書名 / 著者 / 出版社 / ISBN で検索"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">すべてのカテゴリ</option>
            {BOOK_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">すべてのステータス</option>
            {BOOK_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select className={inputClass} value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="-registeredAt">登録日 (新しい順)</option>
            <option value="registeredAt">登録日 (古い順)</option>
            <option value="title">書名</option>
            <option value="author">著者</option>
            <option value="-publishedYear">出版年 (新しい順)</option>
            <option value="publishedYear">出版年 (古い順)</option>
            <option value="-rating">評価 (高い順)</option>
            <option value="rating">評価 (低い順)</option>
          </select>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="border-b border-black/10 bg-black/[.03] text-left text-xs uppercase tracking-wide opacity-60 dark:border-white/10 dark:bg-white/5">
              <tr>
                <th className="p-3">書籍</th>
                <th className="p-3">カテゴリ</th>
                <th className="p-3">出版年</th>
                <th className="p-3">評価</th>
                <th className="p-3">ステータス</th>
                <th className="p-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="p-6 text-center opacity-60">読み込み中…</td></tr>
              )}
              {!loading && books.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center opacity-60">該当する書籍がありません</td></tr>
              )}
              {!loading &&
                books.map((book) => (
                  <tr key={book.id} className="border-b border-black/5 last:border-0 hover:bg-black/[.02] dark:border-white/5 dark:hover:bg-white/5">
                    <td className="p-3">
                      <div className="font-semibold">{book.title}</div>
                      <div className="text-xs opacity-60">{book.author}・{book.publisher}</div>
                    </td>
                    <td className="p-3">{book.category}</td>
                    <td className="p-3 tabular-nums">{book.publishedYear}</td>
                    <td className="p-3"><Stars rating={book.rating} /></td>
                    <td className="p-3">
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={book.status} />
                        {book.borrower && (
                          <span className="text-xs opacity-60">借用者: {book.borrower}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {lendingId === book.id ? (
                          <>
                            <input
                              className={`${inputClass} w-28`}
                              placeholder="借用者名"
                              autoFocus
                              value={borrowerName}
                              onChange={(e) => setBorrowerName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void handleLend(book.id)
                                if (e.key === "Escape") setLendingId(null)
                              }}
                            />
                            <button onClick={() => void handleLend(book.id)} className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`}>OK</button>
                            <button onClick={() => setLendingId(null)} className={`${buttonClass} border border-black/15 dark:border-white/20`}>取消</button>
                          </>
                        ) : (
                          <>
                            {book.status === "在庫あり" && (
                              <button
                                onClick={() => { setLendingId(book.id); setBorrowerName("") }}
                                className={`${buttonClass} bg-amber-500 text-white hover:bg-amber-600`}
                              >
                                貸出
                              </button>
                            )}
                            {book.status === "貸出中" && (
                              <button onClick={() => void handleReturn(book.id)} className={`${buttonClass} bg-emerald-600 text-white hover:bg-emerald-700`}>
                                返却
                              </button>
                            )}
                            {book.status === "予約中" && (
                              <button onClick={() => void handleReturn(book.id)} className={`${buttonClass} bg-sky-600 text-white hover:bg-sky-700`}>
                                予約取消
                              </button>
                            )}
                            <button
                              onClick={() => void handleDelete(book)}
                              className={`${buttonClass} border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950`}
                            >
                              削除
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs opacity-50">
          {loading ? "" : `${books.length} 件 / 全${stats?.total ?? "—"}冊`} ・ API: {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787"}
        </p>
      </section>
    </div>
  )
}
