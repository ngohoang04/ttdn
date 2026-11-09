'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AlertCircle, ArrowLeft, CheckCircle2, ExternalLink, FileText, RefreshCw, ShieldCheck } from 'lucide-react'
import { useWorkspace } from '@/app/components/WorkspaceShell'
import { useTaskFile } from '@/app/components/useTaskFile'
import { formatTaskDeadline } from '@/app/components/taskDeadline'

type Field = { key: string; label: string }
type Task = {
    id: number; title: string; status: string; priority: string; file_url: string
    assignee_id: number | null; submitted_at: string | null; extracted_data: unknown; deadline: string | null
    assignee: { id: number; full_name: string } | null
    batch: { batch_code: string; name: string; schema_config: unknown } | null
}
type Loaded = Task & { fields: Field[]; values: Record<string, unknown> }
type Action = 'approve' | 'return'

function parse(value: unknown): unknown {
    if (typeof value !== 'string') return value
    try { return JSON.parse(value) as unknown } catch { throw new Error('Dữ liệu công việc không hợp lệ. Vui lòng liên hệ quản trị viên.') }
}

function normalize(task: Task): Loaded {
    const schema = parse(task.batch?.schema_config)
    const data = parse(task.extracted_data)
    if (!Array.isArray(schema) || !schema.every(field => field && typeof field === 'object' && typeof field.key === 'string' && typeof field.label === 'string') || !data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Dữ liệu công việc không hợp lệ. Vui lòng liên hệ quản trị viên.')
    }
    return { ...task, fields: schema as Field[], values: data as Record<string, unknown> }
}

function documentUrl(raw: string): { href: string; kind: 'image' | 'pdf' | 'other' } | null {
    try {
        const url = new URL(raw, window.location.origin)
        if (!['http:', 'https:'].includes(url.protocol)) return null
        const path = url.pathname.toLowerCase()
        return { href: url.href, kind: /\.(png|jpe?g|gif|webp|bmp)$/.test(path) ? 'image' : path.endsWith('.pdf') ? 'pdf' : 'other' }
    } catch { return null }
}

export default function ReviewPage() {
    const { id } = useParams<{ id: string }>()
    const { user, token, logout } = useWorkspace()
    const [task, setTask] = useState<Loaded | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [retry, setRetry] = useState(0)
    const [reason, setReason] = useState('')
    const [showReason, setShowReason] = useState(false)
    const [action, setAction] = useState<Action | null>(null)
    const [actionError, setActionError] = useState('')
    const [busy, setBusy] = useState(false)
    const [outcome, setOutcome] = useState<Action | null>(null)
    const [imageError, setImageError] = useState(false)
    const busyRef = useRef(false)
    const dialogRef = useRef<HTMLDialogElement>(null)
    const storedFile = useTaskFile(task?.id ?? null, task?.file_url ?? null, token, logout)
    const permitted = user.role === 'ADMIN' || user.role === 'QA'

    useEffect(() => {
        if (!permitted) return
        const controller = new AbortController()
        async function load() {
            setLoading(true); setError(''); setTask(null); setImageError(false)
            if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
                setError('Mã công việc không hợp lệ.'); setLoading(false); return
            }
            try {
                const response = await fetch(`/api/tasks/${id}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
                if (response.status === 401) { logout(); return }
                if (response.status === 403 || response.status === 404) throw new Error('Không tìm thấy công việc hoặc bạn không có quyền xem.')
                if (!response.ok) throw new Error('Không thể tải công việc. Vui lòng thử lại.')
                const data: Task = await response.json()
                if (!controller.signal.aborted) {
                    if (data.status === 'SUBMITTED') setTask(normalize(data))
                    else setTask({ ...data, fields: [], values: {} })
                }
            } catch (cause) {
                if (!controller.signal.aborted) setError(cause instanceof Error && cause.message !== 'Failed to fetch' ? cause.message : 'Không thể kết nối đến máy chủ. Hãy kiểm tra backend.')
            } finally { if (!controller.signal.aborted) setLoading(false) }
        }
        load()
        return () => controller.abort()
    }, [id, token, logout, permitted, retry])

    function openConfirm(next: Action) {
        if (next === 'return' && !reason.trim()) { setActionError('Vui lòng nhập lý do trả lại.'); return }
        setActionError(''); setAction(next); dialogRef.current?.showModal()
    }
    async function submitReview() {
        if (busyRef.current || !task || task.status !== 'SUBMITTED' || !action || !permitted || task.assignee_id === user.id) return
        busyRef.current = true; setBusy(true); setActionError('')
        try {
            const response = await fetch(`/api/tasks/${task.id}/review`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(action === 'approve' ? { is_approved: true } : { is_approved: false, reject_reason: reason.trim() }),
            })
            if (response.status === 401) { logout(); return }
            if (!response.ok) {
                const data: { message?: string | string[] } = await response.json().catch(() => ({}))
                const message = Array.isArray(data.message) ? data.message.join('; ') : data.message
                dialogRef.current?.close()
                setActionError(response.status >= 500 ? 'Không thể xác nhận kết quả. Vui lòng tải lại công việc trước khi thử lại.' : message || 'Không thể duyệt công việc. Vui lòng tải lại.')
                return
            }
            dialogRef.current?.close(); setOutcome(action)
        } catch {
            dialogRef.current?.close()
            setActionError('Không thể xác nhận kết quả. Vui lòng tải lại công việc trước khi thử lại.')
        } finally { busyRef.current = false; setBusy(false) }
    }

    const back = <Link href="/tasks" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-900"><ArrowLeft className="size-4" />Quay lại danh sách công việc</Link>
    if (!permitted) return <main className="p-8"><p role="alert" className="text-red-700">Bạn không có quyền duyệt công việc.</p>{back}</main>
    if (outcome) return <main className="mx-auto max-w-4xl px-5 py-10">{back}<div role="status" className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-800"><CheckCircle2 className="mb-3 size-8" /><h1 className="page-title">{outcome === 'approve' ? 'Đã duyệt công việc' : 'Đã trả lại công việc'}</h1><p className="mt-2 text-sm">{outcome === 'approve' ? 'Kết quả đã được đánh dấu đạt.' : 'Cộng tác viên có thể xem lý do và chỉnh sửa bài.'}</p></div></main>
    const selfReview = task?.assignee_id === user.id
    const document = task?.file_url.startsWith('stored:')
        ? storedFile.href ? { href: storedFile.href, kind: task.file_url.endsWith('.pdf') ? 'pdf' as const : 'image' as const } : null
        : task ? documentUrl(task.file_url) : null
    const date = task?.submitted_at ? new Date(task.submitted_at) : null

    return <main className="mx-auto max-w-[1500px] px-5 py-8 sm:px-8 lg:py-10">
        {back}<h1 className="mt-5 page-title">Duyệt công việc</h1><p className="mt-2 text-sm text-slate-500">Đối chiếu tài liệu gốc với kết quả nhập liệu của cộng tác viên.</p>
        {loading ? <p role="status" className="py-16 text-center text-slate-500">Đang tải công việc...</p> : error ? <div role="alert" className="mt-6 rounded-2xl bg-white p-6 text-red-700"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="mt-3 font-semibold underline">Thử lại</button></div> : task?.status !== 'SUBMITTED' ? <div role="status" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6"><h2 className="font-bold">Công việc không còn chờ duyệt</h2><p className="mt-2 text-sm text-slate-500">Công việc có thể đã được xử lý hoặc chuyển trạng thái.</p></div> : <>
            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center gap-3"><FileText className="size-5 text-blue-700" /><h2 className="text-lg font-bold">{task.title}</h2><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">Chờ duyệt</span></div><div className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><p><span className="block text-xs text-slate-400">Công việc</span>#{task.id}</p><p><span className="block text-xs text-slate-400">Lô tài liệu</span>{task.batch?.batch_code} — {task.batch?.name}</p><p><span className="block text-xs text-slate-400">Cộng tác viên</span>{task.assignee?.full_name || 'Không có thông tin'}</p><p><span className="block text-xs text-slate-400">Ưu tiên</span>{({ NORMAL: 'Bình thường', HIGH: 'Cao', URGENT: 'Khẩn cấp' } as Record<string, string>)[task.priority] || task.priority}</p><p><span className="block text-xs text-slate-400">Hạn hoàn thành</span>{formatTaskDeadline(task.deadline)}</p><p><span className="block text-xs text-slate-400">Thời gian nộp</span>{date && !Number.isNaN(date.getTime()) ? date.toLocaleString('vi-VN') : '—'}</p></div></section>
            {selfReview && <div role="alert" className="mt-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><ShieldCheck className="size-5 shrink-0" /><p>Bạn không thể tự duyệt công việc này. Hãy nhờ QA hoặc Admin khác duyệt.</p></div>}
            <div className="mt-5 grid items-start gap-5 xl:grid-cols-2">
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5"><h2 className="font-bold">Tài liệu gốc</h2>{document && <a href={document.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700">Mở trong tab mới <ExternalLink className="size-4" /></a>}</div><div className="min-h-72 bg-slate-100 p-4">{document?.kind === 'pdf' ? <iframe src={document.href} title="Tài liệu gốc" sandbox="" referrerPolicy="no-referrer" className="h-[600px] w-full rounded-lg bg-white" /> : document?.kind === 'image' && !imageError ? <div className="flex justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={document.href} alt="Tài liệu gốc" onError={() => setImageError(true)} referrerPolicy="no-referrer" className="max-h-[700px] max-w-full object-contain" /></div> : <p className="p-6 text-center text-sm text-slate-500">Không thể xem trước tài liệu. {storedFile.loading ? 'Đang tải file tài liệu...' : storedFile.error || (document ? 'Hãy mở tài liệu trong tab mới.' : 'Đường dẫn tài liệu không hợp lệ.')}</p>}</div></section>
                <div className="space-y-5"><section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><h2 className="font-bold">Thông tin đã nhập</h2><p className="mt-1 text-xs text-slate-500">Dữ liệu chỉ đọc · {task.fields.length} trường</p></div><dl className="grid sm:grid-cols-2">{task.fields.map(field => <div key={field.key} className="border-b border-slate-100 p-5"><dt className="text-xs font-semibold text-slate-400">{field.label}</dt><dd className="mt-2 whitespace-pre-wrap break-words text-sm font-semibold text-slate-800">{task.values[field.key] === null || task.values[field.key] === undefined || task.values[field.key] === '' ? '—' : String(task.values[field.key])}</dd></div>)}</dl></section>
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">Đánh giá công việc</h2><p className="mt-1 text-xs text-slate-500">Hãy đối chiếu kỹ trước khi đưa ra quyết định.</p>{showReason && !selfReview && <label className="mt-5 block text-sm font-semibold text-slate-700">Lý do trả lại <span className="text-red-600">*</span><textarea value={reason} onChange={event => { setReason(event.target.value); setActionError('') }} maxLength={5000} rows={4} className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" placeholder="Mô tả thông tin cần chỉnh sửa..." /></label>}{actionError && <div role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700"><p className="flex items-start gap-2"><AlertCircle className="size-4 shrink-0" />{actionError}</p><button type="button" onClick={() => { setActionError(''); setRetry(value => value + 1) }} className="mt-2 font-semibold underline">Tải lại công việc</button></div>}<div className="mt-5 grid gap-3 sm:grid-cols-2"><button type="button" disabled={selfReview || !!actionError} onClick={() => openConfirm('approve')} className="rounded-xl bg-[#0b4ea2] px-4 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">Duyệt đạt</button><button type="button" disabled={selfReview || (!!actionError && actionError !== 'Vui lòng nhập lý do trả lại.')} onClick={() => showReason ? openConfirm('return') : setShowReason(true)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 px-4 py-3 text-sm font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-50"><RefreshCw className="size-4" />{showReason ? 'Xác nhận trả lại' : 'Trả lại để chỉnh sửa'}</button></div></section></div>
            </div>
        </>}
        <dialog ref={dialogRef} aria-labelledby="confirm-review-title" onCancel={event => { if (busyRef.current) event.preventDefault() }} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-6 shadow-2xl backdrop:bg-slate-950/40"><h2 id="confirm-review-title" className="text-xl font-bold">{action === 'approve' ? 'Xác nhận duyệt công việc?' : 'Xác nhận trả lại công việc?'}</h2><p className="mt-3 text-sm text-slate-600">{action === 'approve' ? 'Kết quả nhập liệu sẽ được đánh dấu đạt.' : 'Công việc sẽ được trả lại để cộng tác viên chỉnh sửa.'}</p>{action === 'return' && <p className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><strong>Lý do:</strong> {reason.trim()}</p>}<div className="mt-6 flex justify-end gap-3"><button type="button" disabled={busy} onClick={() => dialogRef.current?.close()} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">Hủy</button><button type="button" disabled={busy} onClick={submitReview} className="rounded-xl bg-[#0b4ea2] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Đang xử lý...' : 'Xác nhận'}</button></div></dialog>
    </main>
}
