'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { FileCheck2, Search } from 'lucide-react'
import { useWorkspace } from '@/app/components/WorkspaceShell'
import ReviewSubmission from '@/app/components/ReviewSubmission'

type Review = {
    id: number; task_id: number; decision: 'APPROVED' | 'REJECTED'; reason: string | null; created_at: string
    submitted_data: Record<string, unknown> | string | null; submitted_at: string | null
    reviewer: { id: number; full_name: string } | null
    task: { id: number; title: string; assignee: { full_name: string } | null; batch: { batch_code: string; name: string; schema_config: { key: string; label: string }[] } | null } | null
}

function ReviewHistoryContent() {
    const { user, token, logout } = useWorkspace()
    const searchParams = useSearchParams()
    const requestedTaskId = searchParams.get('task_id')
    const taskId = requestedTaskId && /^[1-9]\d*$/.test(requestedTaskId) && Number.isSafeInteger(Number(requestedTaskId)) ? requestedTaskId : null
    const permitted = user.role === 'ADMIN' || user.role === 'QA'
    const [reviews, setReviews] = useState<Review[]>([])
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const [totalPages, setTotalPages] = useState(0)
    const [pageSize, setPageSize] = useState(20)
    const [query, setQuery] = useState('')
    const [search, setSearch] = useState('')
    const [decision, setDecision] = useState('ALL')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [retry, setRetry] = useState(0)

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setPage(1)
            setSearch(query.trim())
        }, 300)
        return () => window.clearTimeout(timer)
    }, [query])

    useEffect(() => {
        if (!permitted) return
        const controller = new AbortController()
        async function load() {
            setLoading(true)
            setError('')
            try {
                const params = new URLSearchParams({ page: String(page), decision })
                if (search) params.set('q', search)
                if (taskId) params.set('task_id', taskId)
                const response = await fetch(`/api/tasks/reviews/history?${params}`, {
                    headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
                })
                if (response.status === 401) { logout(); return }
                if (!response.ok) throw new Error('Không thể tải lịch sử duyệt.')
                const data: unknown = await response.json()
                if (!data || typeof data !== 'object' || !('items' in data) || !Array.isArray(data.items)
                    || !('total' in data) || typeof data.total !== 'number'
                    || !('pageSize' in data) || typeof data.pageSize !== 'number'
                    || !('totalPages' in data) || typeof data.totalPages !== 'number') {
                    throw new Error('Dữ liệu lịch sử không hợp lệ.')
                }
                if (!controller.signal.aborted) {
                    setReviews(data.items as Review[])
                    setTotal(data.total)
                    setTotalPages(data.totalPages)
                    setPageSize(data.pageSize)
                    if (data.totalPages && page > data.totalPages) setPage(data.totalPages)
                }
            } catch (cause) {
                if (!controller.signal.aborted) setError(cause instanceof Error && cause.message !== 'Failed to fetch' ? cause.message : 'Không thể kết nối backend.')
            } finally {
                if (!controller.signal.aborted) setLoading(false)
            }
        }
        load()
        return () => controller.abort()
    }, [token, logout, permitted, page, search, decision, taskId, retry])

    if (!permitted) return <main className="p-8 text-red-700">Bạn không có quyền xem lịch sử duyệt.</main>

    return <main className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 sm:py-10">
        <h1 className="page-title">Lịch sử duyệt</h1>
        <p className="mt-2 text-sm text-slate-500">{user.role === 'ADMIN' ? 'Toàn bộ các lần duyệt và trả bài trong hệ thống.' : 'Các lần duyệt và trả bài của công việc do bạn giao.'}</p>
        {taskId && <p className="mt-4 text-sm text-slate-600">Đang xem công việc #{taskId} · <Link href="/reviews/history" className="font-semibold text-blue-700 hover:underline">Xem toàn bộ lịch sử</Link></p>}
        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row">
            <label className="relative flex-1">
                <span className="sr-only">Tìm lịch sử</span>
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm công việc, lô hoặc nhân sự..." className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-3 text-sm outline-none focus:border-blue-500" />
            </label>
            <label className="sr-only" htmlFor="decision">Lọc kết quả</label>
            <select id="decision" value={decision} onChange={event => { setPage(1); setDecision(event.target.value) }} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
                <option value="ALL">Tất cả kết quả</option>
                <option value="APPROVED">Duyệt đạt</option>
                <option value="REJECTED">Trả lại</option>
            </select>
        </div>
        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {loading ? <p role="status" className="p-12 text-center text-sm text-slate-500">Đang tải lịch sử...</p>
                : error ? <div role="alert" className="p-8 text-center text-sm text-red-700"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="mt-3 font-semibold underline">Thử lại</button></div>
                    : reviews.length === 0 ? <div className="flex min-h-48 flex-col items-center justify-center p-8 text-center"><FileCheck2 className="size-9 text-slate-300" /><p className="mt-3 text-sm text-slate-600">{search || decision !== 'ALL' ? 'Không tìm thấy kết quả phù hợp.' : 'Chưa có lượt duyệt nào được ghi nhận.'}</p></div>
                        : <ul className="divide-y divide-slate-100">{reviews.map(item => <li key={item.id} className="p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{item.task?.title || `Công việc #${item.task_id}`}</p><p className="mt-1 text-xs text-slate-500">{item.task?.batch?.batch_code || 'Không có lô'} · {item.task?.batch?.name || '—'}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.decision === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{item.decision === 'APPROVED' ? 'Duyệt đạt' : 'Trả lại'}</span></div><div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-3"><p>CTV: {item.task?.assignee?.full_name || '—'}</p><p>Người duyệt: {item.reviewer?.full_name || '—'}</p><p>{new Date(item.created_at).toLocaleString('vi-VN')}</p></div>{item.reason && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Lý do: {item.reason}</p>}<ReviewSubmission data={item.submitted_data} submittedAt={item.submitted_at} schema={item.task?.batch?.schema_config} /><Link href="/tasks" className="mt-3 inline-block text-sm font-semibold text-blue-700 hover:underline">Xem danh sách công việc →</Link></li>)}</ul>}
        </section>
        {!loading && !error && total > 0 && <nav aria-label="Phân trang lịch sử duyệt" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
            <p>Hiển thị {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} trong {total} lượt duyệt</p>
            <div className="flex items-center gap-3">
                <button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-50">Trang trước</button>
                <span>Trang {page}/{totalPages}</span>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage(value => value + 1)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-50">Trang sau</button>
            </div>
        </nav>}
        <p className="mt-4 text-xs text-slate-500">Lịch sử bắt đầu được ghi từ khi chức năng này được bật; các lượt duyệt cũ không thể khôi phục đầy đủ.</p>
    </main>
}

export default function ReviewHistoryPage() {
    return <Suspense fallback={<main className="p-8 text-sm text-slate-500">Đang tải lịch sử duyệt...</main>}><ReviewHistoryContent /></Suspense>
}
