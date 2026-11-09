'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, FileText, Flag, Send } from 'lucide-react'
import { useWorkspace } from '@/app/components/WorkspaceShell'
import { useTaskFile } from '@/app/components/useTaskFile'
import { formatTaskDeadline } from '@/app/components/taskDeadline'

type FieldType = 'text' | 'textarea' | 'number' | 'date'
type SchemaField = { key: string; label: string; type: FieldType; required: boolean }
type TaskDetail = {
    id: number
    title: string
    status: string
    priority: string
    deadline: string | null
    file_url: string
    reject_reason: string | null
    issue_note: string | null
    extracted_data: unknown
    batch: { batch_code: string; name: string; schema_config: unknown } | null
}
type LoadedTask = Omit<TaskDetail, 'batch'> & {
    batch: { batch_code: string; name: string; schema_config: SchemaField[] }
}
type Outcome = { taskId: number; kind: 'submitted'; nextTaskId: number | null } | { taskId: number; kind: 'reported' }

const statusLabels: Record<string, string> = {
    PENDING: 'Chờ phân công', ASSIGNED: 'Đã phân công', SUBMITTED: 'Chờ duyệt',
    APPROVED: 'Đã duyệt', REJECTED: 'Cần sửa', ERROR_REPORTED: 'Đã báo lỗi',
}
const priorityLabels: Record<string, string> = { NORMAL: 'Bình thường', HIGH: 'Cao', URGENT: 'Khẩn cấp' }
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100'

function parseJson(value: unknown): unknown {
    if (typeof value !== 'string') return value
    try { return JSON.parse(value) as unknown } catch { throw new Error('Dữ liệu công việc không hợp lệ. Vui lòng liên hệ quản trị viên.') }
}

function normalizeTask(data: TaskDetail): { task: LoadedTask; values: Record<string, string> } {
    if (!data.batch) throw new Error('Không tìm thấy cấu hình lô tài liệu.')
    const schema = parseJson(data.batch.schema_config)
    if (!Array.isArray(schema) || !schema.every(field =>
        field && typeof field === 'object' &&
        typeof field.key === 'string' && /^[a-zA-Z][a-zA-Z0-9_]*$/.test(field.key) &&
        typeof field.label === 'string' && typeof field.required === 'boolean' &&
        ['text', 'textarea', 'number', 'date'].includes(field.type)
    )) throw new Error('Cấu hình trường của lô không hợp lệ. Vui lòng liên hệ quản trị viên.')
    const fields = schema as SchemaField[]
    if (new Set(fields.map(field => field.key)).size !== fields.length) {
        throw new Error('Cấu hình trường của lô bị trùng mã. Vui lòng liên hệ quản trị viên.')
    }
    const previous = data.extracted_data === null || data.extracted_data === undefined ? {} : parseJson(data.extracted_data)
    if (!previous || typeof previous !== 'object' || Array.isArray(previous)) {
        throw new Error('Dữ liệu đã nhập không hợp lệ. Vui lòng liên hệ quản trị viên.')
    }
    const oldValues = previous as Record<string, unknown>
    const values = Object.fromEntries(fields.map(field => {
        const value = Object.prototype.hasOwnProperty.call(oldValues, field.key) ? oldValues[field.key] : null
        if (value !== null && value !== undefined && typeof value !== 'string' && typeof value !== 'number') {
            throw new Error('Dữ liệu đã nhập không hợp lệ. Vui lòng liên hệ quản trị viên.')
        }
        const text = value === null || value === undefined ? '' : String(value)
        if (field.type === 'number' && text.trim() && !Number.isFinite(Number(text))) {
            throw new Error('Dữ liệu số đã nhập không hợp lệ. Vui lòng liên hệ quản trị viên.')
        }
        if (field.type === 'date' && text.trim()) {
            const date = new Date(text)
            if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
                throw new Error('Dữ liệu ngày đã nhập không hợp lệ. Vui lòng liên hệ quản trị viên.')
            }
        }
        return [field.key, text]
    }))
    return { task: { ...data, batch: { ...data.batch, schema_config: fields } }, values }
}

function documentUrl(raw: string): { href: string; kind: 'image' | 'pdf' | 'other' } | null {
    try {
        const url = new URL(raw, window.location.origin)
        if (!['http:', 'https:'].includes(url.protocol)) return null
        const pathname = url.pathname.toLowerCase()
        const kind = /\.(png|jpe?g|gif|webp|bmp)$/.test(pathname) ? 'image' : pathname.endsWith('.pdf') ? 'pdf' : 'other'
        return { href: url.href, kind }
    } catch { return null }
}

export default function TaskWorkspacePage() {
    const { id } = useParams<{ id: string }>()
    const { user, token, logout } = useWorkspace()
    const [task, setTask] = useState<LoadedTask | null>(null)
    const [values, setValues] = useState<Record<string, string>>({})
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [retry, setRetry] = useState(0)
    const [outcome, setOutcome] = useState<Outcome | null>(null)
    const [formError, setFormError] = useState('')
    const [issueError, setIssueError] = useState('')
    const [issueNote, setIssueNote] = useState('')
    const [showIssue, setShowIssue] = useState(false)
    const [busy, setBusy] = useState<'submit' | 'issue' | null>(null)
    const [imageError, setImageError] = useState(false)
    const busyRef = useRef(false)
    const storedFile = useTaskFile(task?.id ?? null, task?.file_url ?? null, token, logout)

    useEffect(() => {
        if (user.role !== 'COLLABORATOR') return
        const controller = new AbortController()
        async function loadTask() {
            setLoading(true)
            setLoadError('')
            setTask(null)
            setValues({})
            setOutcome(null)
            setFormError('')
            setIssueError('')
            setIssueNote('')
            setShowIssue(window.location.hash === '#bao-loi-file')
            setImageError(false)
            if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
                setLoadError('Mã công việc không hợp lệ.')
                setLoading(false)
                return
            }
            try {
                const response = await fetch(`/api/tasks/${id}`, {
                    headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
                })
                if (response.status === 401) { logout(); return }
                if (response.status === 403 || response.status === 404) throw new Error('Không tìm thấy công việc hoặc bạn không có quyền xem.')
                if (!response.ok) throw new Error('Không thể tải công việc. Vui lòng thử lại.')
                const data: TaskDetail = await response.json()
                const normalized = normalizeTask(data)
                if (!controller.signal.aborted) {
                    setTask(normalized.task)
                    setValues(normalized.values)
                }
            } catch (cause) {
                if (!controller.signal.aborted) setLoadError(cause instanceof Error && cause.message !== 'Failed to fetch' ? cause.message : 'Không thể kết nối đến máy chủ. Hãy kiểm tra backend.')
            } finally {
                if (!controller.signal.aborted) setLoading(false)
            }
        }
        loadTask()
        return () => controller.abort()
    }, [id, user.role, token, logout, retry])

    const back = <Link href="/tasks" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-900"><ArrowLeft className="size-4" aria-hidden="true" />Quay lại công việc của tôi</Link>

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (busyRef.current || !task || task.id !== Number(id) || user.role !== 'COLLABORATOR' || !['ASSIGNED', 'REJECTED'].includes(task.status)) return
        setFormError('')
        const payload: Record<string, string | number | null> = {}
        for (const field of task.batch.schema_config) {
            const value = values[field.key] ?? ''
            if (!value.trim()) {
                if (field.required) { setFormError(`Vui lòng nhập ${field.label}.`); return }
                payload[field.key] = null
                continue
            }
            if (field.type === 'number') {
                const numberValue = Number(value)
                if (!Number.isFinite(numberValue)) { setFormError(`${field.label} phải là số hợp lệ.`); return }
                payload[field.key] = numberValue
            } else {
                payload[field.key] = value
            }
        }
        if (!Object.keys(payload).length) { setFormError('Lô chưa có trường nhập liệu. Vui lòng liên hệ quản trị viên.'); return }
        busyRef.current = true
        setBusy('submit')
        try {
            const response = await fetch(`/api/tasks/${task.id}/submit`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ extracted_data: payload }),
            })
            if (response.status === 401) { logout(); return }
            if (!response.ok) {
                const data: { message?: string | string[] } = await response.json().catch(() => ({}))
                const message = Array.isArray(data.message) ? data.message.join('; ') : data.message
                setFormError(response.status >= 500 ? 'Không thể xác nhận kết quả. Hãy quay lại danh sách và kiểm tra trạng thái trước khi thử lại.' : message || 'Không thể nộp kết quả.')
                return
            }
            const data: { next_task_id?: unknown } = await response.json().catch(() => ({}))
            const nextTaskId = typeof data.next_task_id === 'number' && Number.isSafeInteger(data.next_task_id) && data.next_task_id > 0 ? data.next_task_id : null
            setOutcome({ taskId: task.id, kind: 'submitted', nextTaskId })
        } catch {
            setFormError('Không thể xác nhận kết quả. Hãy quay lại danh sách và kiểm tra trạng thái trước khi thử lại.')
        } finally {
            busyRef.current = false
            setBusy(null)
        }
    }

    async function handleIssue(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (busyRef.current || !task || task.id !== Number(id) || user.role !== 'COLLABORATOR' || !['ASSIGNED', 'REJECTED'].includes(task.status)) return
        const note = issueNote.trim()
        if (!note) { setIssueError('Vui lòng mô tả sự cố của tài liệu.'); return }
        setIssueError('')
        busyRef.current = true
        setBusy('issue')
        try {
            const response = await fetch(`/api/tasks/${task.id}/report-error`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ issue_note: note }),
            })
            if (response.status === 401) { logout(); return }
            if (!response.ok) {
                const data: { message?: string | string[] } = await response.json().catch(() => ({}))
                const message = Array.isArray(data.message) ? data.message.join('; ') : data.message
                setIssueError(response.status >= 500 ? 'Không thể xác nhận kết quả. Hãy kiểm tra trạng thái trước khi thử lại.' : message || 'Không thể gửi báo lỗi.')
                return
            }
            setOutcome({ taskId: task.id, kind: 'reported' })
        } catch {
            setIssueError('Không thể xác nhận kết quả. Hãy quay lại danh sách và kiểm tra trạng thái trước khi thử lại.')
        } finally {
            busyRef.current = false
            setBusy(null)
        }
    }

    if (user.role !== 'COLLABORATOR') return <main className="mx-auto max-w-6xl px-5 py-8">{back}<p role="alert" className="mt-6 text-red-600">Workspace nhập liệu chỉ dành cho cộng tác viên.</p></main>
    if (loading || (task && task.id !== Number(id))) return <main className="mx-auto max-w-6xl px-5 py-8">{back}<p role="status" className="mt-6 text-slate-600">Đang tải công việc...</p></main>
    if (loadError || !task) return <main className="mx-auto max-w-6xl px-5 py-8">{back}<div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"><p>{loadError || 'Không thể tải công việc.'}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="mt-3 font-semibold underline">Thử lại</button></div></main>

    const canEdit = ['ASSIGNED', 'REJECTED'].includes(task.status)
    const document = task.file_url.startsWith('stored:')
        ? storedFile.href ? { href: storedFile.href, kind: task.file_url.endsWith('.pdf') ? 'pdf' as const : 'image' as const } : null
        : documentUrl(task.file_url)
    return (
        <main className="mx-auto max-w-[1600px] px-5 py-6 sm:px-8 lg:py-8">
            {back}
            <header className="mt-5 rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6 lg:flex lg:items-start lg:justify-between lg:gap-8">
                <div>
                    <div className="mb-2 flex flex-wrap gap-2"><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{statusLabels[task.status] || task.status}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Ưu tiên: {priorityLabels[task.priority] || task.priority}</span>{task.deadline && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">Hạn hoàn thành: {formatTaskDeadline(task.deadline)}</span>}</div>
                    <h1 className="page-title">{task.title}</h1>
                    <p className="mt-3 text-sm text-slate-500">Công việc #{task.id} · Lô <strong className="text-slate-700">{task.batch.batch_code}</strong></p>
                </div>
                <div className="mt-5 border-t border-slate-100 pt-4 lg:mt-0 lg:min-w-72 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tên lô tài liệu</p><p className="mt-1.5 text-sm font-semibold text-slate-800">{task.batch.name}</p></div>
            </header>

            {outcome?.taskId === task.id ? (
                <section role="status" className="mt-6 rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
                    <CheckCircle2 className="mx-auto size-12 text-emerald-600" aria-hidden="true" />
                    <h2 className="mt-4 text-xl font-bold text-slate-900">{outcome.kind === 'submitted' ? 'Đã nộp kết quả' : 'Đã gửi báo lỗi tài liệu'}</h2>
                    <p className="mt-2 text-sm text-slate-500">{outcome.kind === 'submitted' ? 'Kết quả đã được chuyển sang bước kiểm tra.' : 'QA và quản trị viên có thể xem báo cáo sự cố.'}</p>
                    <div className="mt-6 flex flex-wrap justify-center gap-3">
                        {outcome.kind === 'submitted' && outcome.nextTaskId && <Link href={`/tasks/${outcome.nextTaskId}`} className="rounded-xl bg-[#0b4ea2] px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Làm công việc tiếp theo</Link>}
                        <Link href="/tasks" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Quay lại danh sách</Link>
                    </div>
                </section>
            ) : (
                <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-start">
                    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold text-slate-900">Tài liệu gốc</h2><p className="mt-1 text-xs text-slate-500">Đối chiếu thông tin trước khi nộp.</p></div>{document && <a href={document.href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline">Mở trong tab mới<ExternalLink className="size-4" aria-hidden="true" /></a>}</div>
                        {document?.kind === 'image' && !imageError ? (
                            <div className="flex min-h-[400px] items-start justify-center bg-slate-100 p-4">
                                {/* eslint-disable-next-line @next/next/no-img-element -- tài liệu do người dùng cung cấp, không dùng trình tối ưu ảnh của Next */}
                                <img src={document.href} alt="Tài liệu gốc" referrerPolicy="no-referrer" onError={() => setImageError(true)} className="h-auto max-w-full shadow-sm" />
                            </div>
                        ) : document?.kind === 'pdf' ? (
                            <div className="bg-slate-100 p-3"><iframe src={document.href} title="Xem trước tài liệu PDF" sandbox="" referrerPolicy="no-referrer" className="h-[600px] w-full rounded-lg bg-white" /><p className="mt-3 text-xs text-slate-500">Nếu trình duyệt hoặc nguồn tài liệu không cho phép xem trước, hãy mở tài liệu trong tab mới.</p></div>
                        ) : (
                            <div className="flex min-h-[400px] flex-col items-center justify-center bg-slate-100 px-6 text-center"><FileText className="size-10 text-slate-400" aria-hidden="true" /><h3 className="mt-4 font-semibold text-slate-800">{storedFile.loading ? 'Đang tải file tài liệu...' : 'Không thể xem trước tài liệu'}</h3><p className="mt-2 max-w-sm text-sm text-slate-500">{storedFile.error || (document ? 'Định dạng hoặc đường dẫn này có thể không hỗ trợ xem trước. Hãy thử mở tài liệu trong tab mới.' : 'Đường dẫn tài liệu không hợp lệ hoặc không được hỗ trợ. Vui lòng báo quản trị viên.')}</p></div>
                        )}
                    </section>

                    <div className="space-y-5">
                        {task.status === 'REJECTED' && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><div className="flex gap-3"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden="true" /><div><h2 className="font-bold text-amber-950">Công việc cần chỉnh sửa</h2><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-amber-900">{task.reject_reason || 'QA yêu cầu kiểm tra và chỉnh sửa thông tin.'}</p><p className="mt-2 text-xs text-amber-800">Dữ liệu đã nộp trước đó được hiển thị trong form bên dưới nếu có.</p></div></div></section>}
                        {task.status === 'ERROR_REPORTED' && <section className="rounded-2xl border border-red-200 bg-red-50 p-5"><div className="flex gap-3"><Flag className="mt-0.5 size-5 shrink-0 text-red-700" aria-hidden="true" /><div><h2 className="font-bold text-red-950">Đã báo lỗi file tài liệu</h2><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-red-900">{task.issue_note || 'Bạn đã báo lỗi file gốc.'}</p><p className="mt-2 text-xs text-red-800">QA hoặc quản trị viên sẽ kiểm tra trước khi giao lại.</p></div></div></section>}
                        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                            <div className="border-b border-slate-100 px-5 py-4 sm:px-6"><h2 className="font-bold text-slate-900">Thông tin cần nhập</h2><p className="mt-1 text-sm text-slate-500">Các trường được cấu hình theo lô tài liệu.</p></div>
                            {!canEdit ? <p className="p-5 text-sm text-slate-600">Công việc hiện ở trạng thái {statusLabels[task.status] || task.status}; bạn chưa thể nộp hoặc báo lỗi từ trang này.</p> : (
                                <form onSubmit={handleSubmit}>
                                    <fieldset disabled={busy !== null} className="grid gap-x-4 gap-y-5 p-5 sm:grid-cols-2 sm:p-6">
                                        {task.batch.schema_config.map((field, index) => {
                                            const fieldId = `task-field-${index}`
                                            return <div key={field.key} className={field.type === 'textarea' ? 'sm:col-span-2' : ''}>
                                                <label htmlFor={fieldId} className="mb-2 block text-sm font-semibold text-slate-700">{field.label} {field.required ? <span className="text-red-600">*</span> : <span className="text-xs font-normal text-slate-500">(Không bắt buộc)</span>}</label>
                                                {field.type === 'textarea' ? <textarea id={fieldId} required={field.required} value={values[field.key] ?? ''} onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))} className={inputClass + ' min-h-28 resize-y'} /> : <input id={fieldId} type={field.type} step={field.type === 'number' ? 'any' : undefined} required={field.required} value={values[field.key] ?? ''} onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))} className={inputClass} />}
                                            </div>
                                        })}
                                        {task.batch.schema_config.length === 0 && <p className="text-sm text-amber-700 sm:col-span-2">Lô chưa có trường nhập liệu. Vui lòng liên hệ quản trị viên.</p>}
                                    </fieldset>
                                    <div className="border-t border-slate-100 bg-slate-50/80 px-5 py-5 sm:px-6">
                                        {formError && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">{formError}</p>}
                                        <button type="submit" disabled={busy !== null || !task.batch.schema_config.length} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0b4ea2] px-5 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"><Send className="size-4" />{busy === 'submit' ? 'Đang gửi kết quả...' : 'Nộp kết quả'}</button>
                                    </div>
                                </form>
                            )}
                        </section>
                        {canEdit && <section id="bao-loi-file" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                            <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-bold text-slate-900">Tài liệu có vấn đề?</h2><p className="mt-1 text-sm text-slate-500">Báo lỗi nếu tài liệu mờ, thiếu trang hoặc sai nội dung.</p></div><button type="button" disabled={busy !== null} aria-expanded={showIssue} onClick={() => { setShowIssue(current => !current); setIssueError('') }} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"><Flag className="size-4" />Báo lỗi tài liệu</button></div>
                            {showIssue && <form onSubmit={handleIssue} className="mt-5 border-t border-slate-100 pt-5"><label htmlFor="issue-note" className="mb-2 block text-sm font-semibold text-slate-700">Mô tả sự cố <span className="text-red-600">*</span></label><textarea id="issue-note" required value={issueNote} onChange={event => setIssueNote(event.target.value)} disabled={busy !== null} className={inputClass + ' min-h-28 resize-y'} placeholder="Ví dụ: Tài liệu thiếu trang 2..." />{issueError && <p role="alert" className="mt-2 text-sm text-red-600">{issueError}</p>}<div className="mt-4 flex flex-wrap justify-end gap-3"><button type="button" disabled={busy !== null} onClick={() => setShowIssue(false)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Hủy</button><button type="submit" disabled={busy !== null} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">{busy === 'issue' ? 'Đang gửi...' : 'Gửi báo lỗi'}</button></div></form>}
                        </section>}
                    </div>
                </div>
            )}
        </main>
    )
}
