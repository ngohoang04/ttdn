'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ClipboardCheck, FileCheck2, FileClock, FileWarning, ListChecks, Upload } from 'lucide-react'
import { useWorkspace } from '@/app/components/WorkspaceShell'
import { useTaskFile } from '@/app/components/useTaskFile'
import { formatTaskDeadline } from '@/app/components/taskDeadline'

type BatchRow = { id: number; batch_code: string; name: string; approved: number; rejected: number; pending: number; file_errors: number }
type ReportedFile = {
    id: number; title: string; issue_note: string | null; file_url: string; updated_at: string; deadline: string | null
    batch: { id: number; batch_code: string; name: string } | null
    assignee: { id: number; full_name: string; role: string; status: string } | null
}
type Collaborator = { id: number; full_name: string }
type RecentReview = {
    id: number; decision: 'APPROVED' | 'REJECTED'; created_at: string
    reviewer: { full_name: string } | null
    task: { id: number; title: string; batch: { batch_code: string } | null } | null
}
type Report = {
    total: number; approved: number; rejected: number; pending: number; file_errors: number
    by_batch: BatchRow[]; reported_files: ReportedFile[]; recent_reviews: RecentReview[]
}

function FileErrorCard({ item, busy, collaborators, collaboratorsError, onResolve }: {
    item: ReportedFile
    busy: boolean
    collaborators: Collaborator[]
    collaboratorsError: string
    onResolve: (item: ReportedFile, replacement?: File, assigneeId?: number) => Promise<void>
}) {
    const { token, logout } = useWorkspace()
    const [replacement, setReplacement] = useState<File | null>(null)
    const [selectedAssigneeId, setSelectedAssigneeId] = useState('')
    const [preview, setPreview] = useState(false)
    const file = useTaskFile(preview && item.file_url.startsWith('stored:') ? item.id : null, item.file_url, token, logout)
    const externalUrl = /^https?:\/\//i.test(item.file_url) ? item.file_url : null
    const currentAssigneeActive = item.assignee?.role === 'COLLABORATOR' && item.assignee.status === 'ACTIVE'
    const canResolve = currentAssigneeActive || !!selectedAssigneeId
    const chosenAssigneeId = selectedAssigneeId ? Number(selectedAssigneeId) : undefined

    return <article className="rounded-xl border border-red-100 bg-red-50/50 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h3 className="font-semibold text-slate-900">{item.title}</h3><p className="mt-1 text-xs text-slate-500">{item.batch?.batch_code || 'Không có lô'} · CTV: {item.assignee?.full_name || '—'}</p></div>
            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">File được báo lỗi</span>
        </div>
        <p className="mt-4 whitespace-pre-wrap rounded-lg bg-white p-3 text-sm leading-6 text-red-900"><strong>Mô tả:</strong> {item.issue_note || 'CTV chưa ghi mô tả.'}</p>
        <p className="mt-3 text-xs text-slate-500">Báo lúc {new Date(item.updated_at).toLocaleString('vi-VN')} · Hạn hoàn thành: {formatTaskDeadline(item.deadline)}</p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
            {item.file_url.startsWith('stored:') && <button type="button" onClick={() => setPreview(value => !value)} className="font-semibold text-blue-700 hover:underline">{preview ? 'Ẩn file gốc' : 'Xem file gốc'}</button>}
            {externalUrl && <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-700 hover:underline">Mở file gốc</a>}
            {item.batch && <Link href={`/batches/${item.batch.id}`} className="font-semibold text-blue-700 hover:underline">Xem lô tài liệu</Link>}
        </div>
        {preview && item.file_url.startsWith('stored:') && <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {file.loading ? <p className="p-5 text-sm text-slate-500">Đang tải file...</p>
                : file.error ? <p role="alert" className="p-5 text-sm text-red-700">{file.error}</p>
                    : file.href ? item.file_url.endsWith('.pdf') ? <iframe src={file.href} title={`Tài liệu gốc ${item.title}`} sandbox="" className="h-[480px] w-full" />
                        : <div className="flex justify-center p-4">
                            {/* eslint-disable-next-line @next/next/no-img-element -- ảnh tài liệu riêng tư lấy qua API */}
                            <img src={file.href} alt={`Tài liệu gốc ${item.title}`} className="max-h-[480px] max-w-full object-contain" />
                        </div> : null}
        </div>}
        <div className="mt-5 border-t border-red-100 pt-4">
            <p className="text-sm text-slate-600">Nếu báo lỗi nhầm, mở lại để CTV tiếp tục. Nếu file hỏng, chọn file thay thế trước khi giao lại.</p>
            <label className="mt-3 block text-sm font-semibold text-slate-700">CTV nhận việc sau khi xử lý
                <select value={selectedAssigneeId} onChange={event => setSelectedAssigneeId(event.target.value)} disabled={busy} className="mt-2 block w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800">
                    <option value="">{currentAssigneeActive ? `Giữ ${item.assignee?.full_name}` : 'Chọn CTV đang hoạt động'}</option>
                    {collaborators.filter(person => person.id !== item.assignee?.id).map(person => <option key={person.id} value={person.id}>{person.full_name}</option>)}
                </select>
            </label>
            {!currentAssigneeActive && <p className="mt-2 text-sm text-amber-800">CTV trước không còn hoạt động; cần chọn người khác.</p>}
            {collaboratorsError && <p role="alert" className="mt-2 text-sm text-red-700">{collaboratorsError}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" disabled={busy || !canResolve} onClick={() => onResolve(item, undefined, chosenAssigneeId)} className="rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50">Cho CTV tiếp tục</button>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"><Upload className="size-4" /><span>{replacement?.name || 'Chọn file thay thế'}</span><input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" onChange={event => setReplacement(event.target.files?.[0] || null)} className="sr-only" /></label>
                <button type="button" disabled={busy || !replacement || !canResolve} onClick={() => { if (replacement) onResolve(item, replacement, chosenAssigneeId) }} className="rounded-lg bg-[#0b4ea2] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">Thay file và giao lại</button>
            </div>
        </div>
    </article>
}

export default function ReviewReportPage() {
    const { user, token, logout } = useWorkspace()
    const permitted = user.role === 'ADMIN' || user.role === 'QA'
    const [report, setReport] = useState<Report | null>(null)
    const [collaborators, setCollaborators] = useState<Collaborator[]>([])
    const [collaboratorsError, setCollaboratorsError] = useState('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [actionError, setActionError] = useState('')
    const [actionMessage, setActionMessage] = useState('')
    const [busyTaskId, setBusyTaskId] = useState<number | null>(null)
    const actionBusy = useRef(false)
    const [retry, setRetry] = useState(0)

    useEffect(() => {
        if (!permitted) return
        const controller = new AbortController()
        async function load() {
            setLoading(true)
            setError('')
            try {
                const headers = { Authorization: `Bearer ${token}` }
                const [response, collaboratorResponse] = await Promise.all([
                    fetch('/api/tasks/reviews/report', { headers, signal: controller.signal }),
                    fetch('/api/auth/collaborators', { headers, signal: controller.signal }),
                ])
                if (response.status === 401 || collaboratorResponse.status === 401) { logout(); return }
                if (!response.ok) throw new Error('Không thể tải báo cáo duyệt.')
                const data: Report = await response.json()
                if (![data.total, data.approved, data.rejected, data.pending, data.file_errors].every(value => Number.isInteger(value) && value >= 0)
                    || !Array.isArray(data.by_batch) || !Array.isArray(data.reported_files) || !Array.isArray(data.recent_reviews)) throw new Error('Dữ liệu báo cáo không hợp lệ.')
                if (!controller.signal.aborted) {
                    setReport(data)
                    if (collaboratorResponse.ok) {
                        const people: unknown = await collaboratorResponse.json()
                        if (Array.isArray(people)) {
                            setCollaborators(people as Collaborator[])
                            setCollaboratorsError('')
                        } else setCollaboratorsError('Danh sách CTV không hợp lệ. Hãy tải lại trang.')
                    } else setCollaboratorsError('Không thể tải CTV đang hoạt động. Hãy tải lại trang để đổi người thực hiện.')
                }
            } catch (cause) {
                if (!controller.signal.aborted) setError(cause instanceof Error && cause.message !== 'Failed to fetch' ? cause.message : 'Không thể kết nối backend.')
            } finally { if (!controller.signal.aborted) setLoading(false) }
        }
        load()
        return () => controller.abort()
    }, [token, logout, permitted, retry])

    async function handleResolve(item: ReportedFile, replacement?: File, assigneeId?: number) {
        if (actionBusy.current || !permitted) return
        actionBusy.current = true
        setBusyTaskId(item.id)
        setActionError('')
        setActionMessage('')
        try {
            let fileUrl: string | undefined
            if (replacement) {
                if (!item.batch) throw new Error('Không tìm thấy lô của công việc.')
                const form = new FormData()
                form.set('batch_id', String(item.batch.id))
                form.set('file', replacement)
                const upload = await fetch('/api/tasks/files', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
                if (upload.status === 401) { logout(); return }
                const result: { file_url?: string; message?: string | string[] } = await upload.json().catch(() => ({}))
                if (!upload.ok) throw new Error(Array.isArray(result.message) ? result.message.join('; ') : result.message || 'Không thể tải file thay thế.')
                if (!result.file_url?.startsWith('stored:')) throw new Error('Máy chủ không trả về mã file hợp lệ.')
                fileUrl = result.file_url
            }
            const response = await fetch(`/api/tasks/${item.id}/resolve-file-error`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ ...(fileUrl ? { file_url: fileUrl } : {}), ...(assigneeId ? { assignee_id: assigneeId } : {}) }),
            })
            if (response.status === 401) { logout(); return }
            const result: { message?: string | string[] } = await response.json().catch(() => ({}))
            if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join('; ') : result.message || 'Không thể xử lý báo lỗi.')
            setActionMessage(typeof result.message === 'string' ? result.message : 'Đã xử lý báo lỗi file.')
            setRetry(value => value + 1)
        } catch (cause) {
            setActionError(cause instanceof Error ? cause.message : 'Không thể xử lý báo lỗi file.')
        } finally {
            actionBusy.current = false
            setBusyTaskId(null)
        }
    }

    if (!permitted) return <main className="p-8 text-red-700">Bạn không có quyền xem báo cáo duyệt.</main>

    const cards = report ? [
        { label: 'Lượt duyệt', value: report.total, icon: ListChecks, tone: 'bg-blue-50 text-blue-700' },
        { label: 'Duyệt đạt', value: report.approved, icon: FileCheck2, tone: 'bg-emerald-50 text-emerald-700' },
        { label: 'Trả lại', value: report.rejected, icon: FileClock, tone: 'bg-amber-50 text-amber-700' },
        { label: 'Chờ duyệt', value: report.pending, icon: ClipboardCheck, tone: 'bg-violet-50 text-violet-700' },
        { label: 'File báo lỗi', value: report.file_errors, icon: FileWarning, tone: 'bg-red-50 text-red-700' },
    ] : []

    return <main className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 sm:py-10">
        <h1 className="page-title">Báo cáo duyệt</h1>
        <p className="mt-2 text-sm text-slate-500">{user.role === 'ADMIN' ? 'Kết quả kiểm duyệt theo lô và các file cần xử lý trong hệ thống.' : 'Kết quả kiểm duyệt và file lỗi thuộc công việc do bạn quản lý.'}</p>
        {loading ? <p role="status" className="mt-6 rounded-2xl bg-white p-12 text-center text-sm text-slate-500">Đang tải báo cáo...</p>
            : error ? <div role="alert" className="mt-6 rounded-2xl bg-white p-8 text-sm text-red-700"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="mt-3 font-semibold underline">Thử lại</button></div>
                : report && <>
                    <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{cards.map(card => { const Icon = card.icon; return <article key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-2"><div><p className="text-xs text-slate-500">{card.label}</p><p className="mt-3 text-2xl font-bold text-slate-900">{card.value}</p></div><span className={`rounded-xl p-2 ${card.tone}`}><Icon className="size-5" /></span></div></article> })}</div>
                    {actionError && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{actionError}</p>}
                    {actionMessage && <p role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{actionMessage}</p>}
                    <section id="file-loi" className="mt-7 scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                        <div className="flex items-center gap-3"><span className="rounded-xl bg-red-50 p-2.5 text-red-700"><AlertTriangle className="size-5" /></span><div><h2 className="text-lg font-bold text-slate-900">File CTV báo lỗi</h2><p className="text-sm text-slate-500">Kiểm tra sự cố, thay file nếu cần rồi giao lại công việc.</p></div></div>
                        {report.reported_files.length ? <div className="mt-5 grid gap-4">{report.reported_files.map(item => <FileErrorCard key={item.id} item={item} busy={busyTaskId !== null} collaborators={collaborators} collaboratorsError={collaboratorsError} onResolve={handleResolve} />)}</div>
                            : <p className="mt-5 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">Hiện không có file nào đang chờ xử lý.</p>}
                    </section>
                    <section className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-100 p-5 sm:px-6"><h2 className="text-lg font-bold text-slate-900">Kết quả theo lô tài liệu</h2><p className="mt-1 text-sm text-slate-500">Lượt duyệt là số lần QA xử lý; một công việc có thể được trả lại rồi duyệt tiếp.</p></div>
                        {!report.by_batch.length ? <p className="p-6 text-sm text-slate-500">Chưa có lô tài liệu nào.</p>
                            : <div className="overflow-x-auto"><table className="w-full min-w-[740px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-6 py-4">Lô tài liệu</th><th className="px-4 py-4">Duyệt đạt</th><th className="px-4 py-4">Trả lại</th><th className="px-4 py-4">Chờ duyệt</th><th className="px-4 py-4">File lỗi</th></tr></thead><tbody className="divide-y divide-slate-100">{report.by_batch.map(batch => <tr key={batch.id}><td className="px-6 py-4"><Link href={`/batches/${batch.id}`} className="font-semibold text-blue-700 hover:underline">{batch.batch_code}</Link><p className="mt-1 text-xs text-slate-500">{batch.name}</p></td><td className="px-4 py-4">{batch.approved}</td><td className="px-4 py-4">{batch.rejected}</td><td className="px-4 py-4">{batch.pending}</td><td className="px-4 py-4">{batch.file_errors}</td></tr>)}</tbody></table></div>}
                    </section>
                    <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                        <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">Lượt duyệt gần đây</h2><p className="mt-1 text-sm text-slate-500">Các quyết định mới nhất trong phạm vi bạn quản lý.</p></div><Link href="/reviews/history" className="text-sm font-semibold text-blue-700 hover:underline">Xem lịch sử →</Link></div>
                        {!report.recent_reviews.length ? <p className="mt-5 text-sm text-slate-500">Chưa có lượt duyệt nào.</p>
                            : <ul className="mt-5 divide-y divide-slate-100">{report.recent_reviews.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><p className="font-semibold text-slate-900">{item.task?.title || 'Công việc không còn tồn tại'}</p><p className="mt-1 text-xs text-slate-500">{item.task?.batch?.batch_code || 'Không có lô'} · {item.reviewer?.full_name || '—'} · {new Date(item.created_at).toLocaleString('vi-VN')}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.decision === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{item.decision === 'APPROVED' ? 'Duyệt đạt' : 'Trả lại'}</span></li>)}</ul>}
                    </section>
                </>}
    </main>
}
