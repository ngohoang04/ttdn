'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowRight, ChartNoAxesCombined, FileText, Search } from 'lucide-react'
import { useWorkspace } from '@/app/components/WorkspaceShell'
import { formatTaskDeadline, isTaskOverdue } from '@/app/components/taskDeadline'

type Task = {
    id: number
    title: string
    status: string
    priority: string
    deadline: string | null
    batch: { id: number; batch_code: string; name: string } | null
    assignee: { id: number; full_name: string; email: string } | null
}
const statusLabels: Record<string, string> = {
    PENDING: 'Chờ phân công',
    ASSIGNED: 'Đã phân công',
    SUBMITTED: 'Chờ duyệt',
    APPROVED: 'Đã duyệt',
    REJECTED: 'Cần sửa',
    ERROR_REPORTED: 'Đã báo lỗi',
}
const priorityLabels: Record<string, string> = {
    NORMAL: 'Bình thường', HIGH: 'Cao', URGENT: 'Khẩn cấp',
}
const statusStyles: Record<string, string> = {
    PENDING: 'bg-slate-100 text-slate-600',
    ASSIGNED: 'bg-blue-50 text-blue-700',
    SUBMITTED: 'bg-amber-50 text-amber-700',
    APPROVED: 'bg-emerald-50 text-emerald-700',
    REJECTED: 'bg-orange-50 text-orange-700',
    ERROR_REPORTED: 'bg-red-50 text-red-700',
}
const selectClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 sm:w-auto'

function StatusBadge({ status }: { status: string }) {
    return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[status] || 'bg-slate-100 text-slate-600'}`}>{statusLabels[status] || status}</span>
}

function TaskAction({ task, onUnassign, busyTaskId }: { task: Task; onUnassign: (task: Task) => void; busyTaskId: number | null }) {
    const { user } = useWorkspace()
    if (user.role !== 'COLLABORATOR') {
        if (task.status === 'SUBMITTED') return <Link href={`/tasks/${task.id}/review`} className="inline-flex h-9 items-center rounded-lg bg-[#0b4ea2] px-3.5 text-xs font-semibold text-white hover:bg-blue-800">Xem và duyệt</Link>
        if (task.status === 'ERROR_REPORTED') return <Link href="/reviews/report#file-loi" className="inline-flex h-9 items-center rounded-lg border border-red-200 px-3.5 text-xs font-semibold text-red-700 hover:bg-red-50">Xử lý file lỗi</Link>
        if (task.status === 'APPROVED' || task.status === 'REJECTED') return <Link href={`/reviews/history?task_id=${task.id}`} className="inline-flex h-9 items-center rounded-lg border border-blue-200 px-3.5 text-xs font-semibold text-blue-700 hover:bg-blue-50">Xem bài đã nộp</Link>
        if (task.status === 'ASSIGNED' && task.assignee) return <button type="button" disabled={busyTaskId !== null} onClick={() => onUnassign(task)} className="inline-flex h-9 items-center rounded-lg border border-amber-300 px-3.5 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:cursor-wait disabled:opacity-50">{busyTaskId === task.id ? 'Đang thu hồi...' : 'Hủy phân công'}</button>
        return <span className="text-xs text-slate-400">—</span>
    }
    if (task.status === 'ERROR_REPORTED') return <Link href={`/tasks/${task.id}`} className="text-xs font-semibold text-red-700 hover:underline">Xem báo lỗi</Link>
    if (task.status !== 'ASSIGNED' && task.status !== 'REJECTED') return <span className="text-xs text-slate-400">Chỉ xem trạng thái</span>
    return <div className="flex flex-wrap justify-end gap-2">
        <Link href={`/tasks/${task.id}`} className="inline-flex h-9 items-center rounded-lg bg-[#0b4ea2] px-3.5 text-xs font-semibold text-white hover:bg-blue-800">{task.status === 'REJECTED' ? 'Tiếp tục sửa' : 'Bắt đầu'}</Link>
        <Link href={`/tasks/${task.id}#bao-loi-file`} className="inline-flex h-9 items-center rounded-lg border border-red-200 px-3.5 text-xs font-semibold text-red-700 hover:bg-red-50">Báo lỗi file</Link>
    </div>
}

function TasksContent() {
    const { user, token, logout } = useWorkspace()
    const searchParams = useSearchParams()
    const [tasks, setTasks] = useState<Task[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [retry, setRetry] = useState(0)
    const [actionError, setActionError] = useState('')
    const [actionMessage, setActionMessage] = useState('')
    const [busyTaskId, setBusyTaskId] = useState<number | null>(null)
    const actionBusy = useRef(false)
    const [query, setQuery] = useState('')
    const [statusOverride, setStatusOverride] = useState<string | null>(null)
    const requestedStatus = searchParams.get('status')
    const status = statusOverride ?? (requestedStatus && Object.hasOwn(statusLabels, requestedStatus) ? requestedStatus : 'ALL')
    const [priority, setPriority] = useState('ALL')
    const [batchId, setBatchId] = useState('ALL')
    const [deadlineFilter, setDeadlineFilter] = useState('ALL')
    const isCollaborator = user.role === 'COLLABORATOR'

    useEffect(() => {
        const controller = new AbortController()
        async function loadTasks() {
            setLoading(true)
            setError('')
            try {
                const response = await fetch('/api/tasks', {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: controller.signal,
                })
                if (response.status === 401) { logout(); return }
                if (response.status === 403) throw new Error('Bạn không có quyền xem công việc.')
                if (!response.ok) throw new Error('Không thể tải danh sách công việc. Vui lòng thử lại.')
                const data: unknown = await response.json()
                if (!Array.isArray(data)) throw new Error('Dữ liệu công việc không hợp lệ.')
                if (!controller.signal.aborted) setTasks(data as Task[])
            } catch (cause) {
                if (!controller.signal.aborted) setError(cause instanceof Error && cause.message !== 'Failed to fetch' ? cause.message : 'Không thể kết nối đến máy chủ. Hãy kiểm tra backend.')
            } finally {
                if (!controller.signal.aborted) setLoading(false)
            }
        }
        loadTasks()
        return () => controller.abort()
    }, [token, logout, retry])

    const batches = useMemo(() => {
        const found = new Map<number, { id: number; batch_code: string; name: string }>()
        tasks.forEach(task => { if (task.batch) found.set(task.batch.id, task.batch) })
        return [...found.values()]
    }, [tasks])
    const filteredTasks = useMemo(() => {
        const normalized = query.trim().toLowerCase()
        return tasks.filter(task => {
            const search = `${task.title} ${task.batch?.batch_code ?? ''} ${task.batch?.name ?? ''}`.toLowerCase()
            return search.includes(normalized) &&
                (status === 'ALL' || task.status === status) &&
                (priority === 'ALL' || task.priority === priority) &&
                (deadlineFilter === 'ALL' || isTaskOverdue(task.deadline, task.status)) &&
                (batchId === 'ALL' || String(task.batch?.id) === batchId)
        })
    }, [tasks, query, status, priority, deadlineFilter, batchId])

    async function handleUnassign(task: Task) {
        if (actionBusy.current || user.role === 'COLLABORATOR' || task.status !== 'ASSIGNED') return
        if (!window.confirm(`Hủy phân công "${task.title}" cho ${task.assignee?.full_name || 'CTV'}? Công việc sẽ trở lại chờ phân công.`)) return
        actionBusy.current = true
        setBusyTaskId(task.id)
        setActionError('')
        setActionMessage('')
        try {
            const response = await fetch(`/api/tasks/${task.id}/unassign`, {
                method: 'PUT', headers: { Authorization: `Bearer ${token}` },
            })
            if (response.status === 401) { logout(); return }
            if (!response.ok) {
                const data: { message?: string | string[] } = await response.json().catch(() => ({}))
                setActionError(Array.isArray(data.message) ? data.message.join('; ') : data.message || 'Không thể hủy phân công.')
                setRetry(value => value + 1)
                return
            }
            setTasks(current => current.map(item => item.id === task.id ? { ...item, status: 'PENDING', assignee: null } : item))
            setActionMessage(`Đã hủy phân công công việc #${task.id}. Bạn có thể giao lại trong lô tài liệu.`)
        } catch {
            setActionError('Không thể xác nhận kết quả. Danh sách sẽ được tải lại để kiểm tra.')
            setRetry(value => value + 1)
        } finally {
            actionBusy.current = false
            setBusyTaskId(null)
        }
    }

    return (
        <main className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:py-10">
            <div className="mb-8">
                <h1 className="page-title">{isCollaborator ? 'Công việc của tôi' : 'Công việc'}</h1>
                <p className="mt-2 text-sm text-slate-500">{isCollaborator ? 'Theo dõi các công việc được giao và bài cần sửa.' : 'Theo dõi công việc theo lô, trạng thái và mức ưu tiên.'}</p>
            </div>

            {!isCollaborator && <Link href="/reviews/report" className="group mb-6 flex items-center gap-4 rounded-2xl border border-blue-200 bg-white p-5 shadow-sm transition hover:border-blue-400 hover:shadow-md sm:p-6">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#0b4ea2]"><ChartNoAxesCombined className="size-5" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1"><span className="block font-semibold text-slate-900">Báo cáo duyệt</span><span className="mt-1 block text-sm text-slate-500">Xem lượt duyệt, bài trả lại và bài đang chờ xử lý.</span></span>
                <ArrowRight className="size-5 shrink-0 text-[#0b4ea2] transition group-hover:translate-x-1" aria-hidden="true" />
            </Link>}

            <section aria-label="Tìm kiếm và lọc công việc" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <label className="relative flex-1"><span className="sr-only">Tìm theo tên công việc hoặc mã lô</span><Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm theo tên công việc hoặc mã lô..." className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" /></label>
                    <label><span className="sr-only">Lọc theo trạng thái</span><select value={status} onChange={event => setStatusOverride(event.target.value)} className={selectClass}><option value="ALL">Tất cả trạng thái</option>{Object.entries(statusLabels).filter(([key]) => !isCollaborator || key !== 'PENDING').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                    <label><span className="sr-only">Lọc theo mức ưu tiên</span><select value={priority} onChange={event => setPriority(event.target.value)} className={selectClass}><option value="ALL">Tất cả ưu tiên</option>{Object.entries(priorityLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                    <label><span className="sr-only">Lọc theo hạn hoàn thành</span><select value={deadlineFilter} onChange={event => setDeadlineFilter(event.target.value)} className={selectClass}><option value="ALL">Tất cả hạn</option><option value="OVERDUE">Quá hạn</option></select></label>
                    {!isCollaborator && <label><span className="sr-only">Lọc theo lô tài liệu</span><select value={batchId} onChange={event => setBatchId(event.target.value)} className={selectClass}><option value="ALL">Tất cả lô</option>{batches.map(batch => <option key={batch.id} value={batch.id}>{batch.batch_code} - {batch.name}</option>)}</select></label>}
                </div>
            </section>

            <section aria-label="Danh sách công việc" className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {actionError && <p role="alert" className="border-b border-red-100 bg-red-50 px-6 py-3 text-sm text-red-700">{actionError}</p>}
                {actionMessage && <p role="status" className="border-b border-emerald-100 bg-emerald-50 px-6 py-3 text-sm text-emerald-700">{actionMessage}</p>}
                {loading ? <p role="status" className="px-6 py-16 text-center text-sm text-slate-500">Đang tải công việc...</p> : error ? (
                    <div role="alert" className="px-6 py-16 text-center text-sm text-red-700"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="mt-3 font-semibold underline">Thử lại</button></div>
                ) : filteredTasks.length === 0 ? (
                    <div className="flex min-h-[220px] flex-col items-center justify-center px-6 text-center"><FileText className="mb-3 size-8 text-slate-300" aria-hidden="true" /><h2 className="font-semibold text-slate-800">{tasks.length === 0 ? 'Chưa có công việc nào' : 'Không tìm thấy kết quả'}</h2><p className="mt-1 text-sm text-slate-500">{tasks.length === 0 ? (isCollaborator ? 'Bạn chưa có công việc được giao.' : 'Chưa có công việc trong hệ thống.') : 'Thử thay đổi từ khóa hoặc bộ lọc.'}</p></div>
                ) : (
                    <>
                        <div className="hidden overflow-x-auto md:block">
                            <table className="w-full min-w-[900px] text-left">
                                <thead className="border-b border-slate-100 bg-slate-50"><tr className="text-xs font-bold uppercase tracking-wide text-slate-500"><th className="px-6 py-4">Công việc</th><th className="px-4 py-4">Lô tài liệu</th>{!isCollaborator && <th className="px-4 py-4">Người được giao</th>}<th className="px-4 py-4">Ưu tiên</th><th className="px-4 py-4">Hạn hoàn thành</th><th className="px-4 py-4">Trạng thái</th><th className="px-6 py-4 text-right">Thao tác</th></tr></thead>
                                <tbody className="divide-y divide-slate-100">{filteredTasks.map(task => (
                                    <tr key={task.id} className="hover:bg-slate-50/70">
                                        <td className="px-6 py-5"><p className="font-semibold text-slate-800">{task.title}</p><p className="mt-1 text-xs text-slate-500">Công việc #{task.id}</p></td>
                                        <td className="px-4 py-5"><p className="font-mono text-xs font-semibold text-slate-600">{task.batch?.batch_code || '—'}</p><p className="mt-1 text-xs text-slate-500">{task.batch?.name || 'Không có thông tin lô'}</p></td>
                                        {!isCollaborator && <td className="px-4 py-5 text-sm text-slate-600">{task.assignee?.full_name || 'Chưa phân công'}</td>}
                                        <td className="px-4 py-5 text-sm text-slate-600">{priorityLabels[task.priority] || task.priority}</td>
                                        <td className="px-4 py-5 text-sm text-slate-600">{formatTaskDeadline(task.deadline)}{isTaskOverdue(task.deadline, task.status) && <span className="mt-1 block w-fit rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">Quá hạn</span>}</td>
                                        <td className="px-4 py-5"><StatusBadge status={task.status} /></td>
                                        <td className="px-6 py-5 text-right"><TaskAction task={task} onUnassign={handleUnassign} busyTaskId={busyTaskId} /></td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                        <div className="divide-y divide-slate-100 md:hidden">{filteredTasks.map(task => (
                            <article key={task.id} className="p-5">
                                <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-800">{task.title}</p><p className="mt-1 text-xs text-slate-500">Công việc #{task.id}</p></div><StatusBadge status={task.status} /></div>
                                <p className="mt-3 text-xs text-slate-500">Lô: {task.batch ? `${task.batch.batch_code} — ${task.batch.name}` : 'Không có thông tin'}</p>
                                <p className="mt-2 text-xs text-slate-500">Hạn hoàn thành: {formatTaskDeadline(task.deadline)}{isTaskOverdue(task.deadline, task.status) && <span className="ml-2 font-semibold text-red-700">Quá hạn</span>}</p>
                                {!isCollaborator && <p className="mt-2 text-xs text-slate-500">Người được giao: {task.assignee?.full_name || 'Chưa phân công'}</p>}
                                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4"><span className="text-xs font-semibold text-slate-600">Ưu tiên: {priorityLabels[task.priority] || task.priority}</span><TaskAction task={task} onUnassign={handleUnassign} busyTaskId={busyTaskId} /></div>
                            </article>
                        ))}</div>
                    </>
                )}
            </section>
            {!loading && !error && <p className="mt-4 text-xs text-slate-500">Hiển thị {filteredTasks.length} công việc</p>}
        </main>
    )
}

export default function TasksPage() {
    return <Suspense fallback={<main className="p-8 text-sm text-slate-500">Đang tải công việc...</main>}><TasksContent /></Suspense>
}
