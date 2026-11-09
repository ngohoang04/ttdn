'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, CalendarDays, Download, FileText } from 'lucide-react'
import { useWorkspace } from '@/app/components/WorkspaceShell'
import { formatTaskDeadline } from '@/app/components/taskDeadline'

type SchemaField = {
    key: string
    label: string
    type: 'text' | 'number' | 'date' | 'textarea'
    required: boolean
}
type Task = {
    id: number
    title: string
    assignee_id: number | null
    assignee?: { id: number; full_name: string } | null
    status: string
    priority: string
    deadline: string | null
}
type Collaborator = { id: number; full_name: string }
type QaMember = { id: number; full_name: string; role: string; status: string }
type BatchDetail = {
    id: number
    qa_id: number | null
    qa: { id: number; full_name: string } | null
    batch_code: string
    name: string
    description: string | null
    created_at: string
    unit_price: number | string | null
    schema_config: SchemaField[]
    tasks: Task[]
}

const typeLabels: Record<SchemaField['type'], string> = {
    text: 'Văn bản ngắn',
    number: 'Số',
    date: 'Ngày',
    textarea: 'Văn bản dài',
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
    NORMAL: 'Bình thường',
    HIGH: 'Cao',
    URGENT: 'Khẩn cấp',
}
const infoLabel = 'text-xs font-semibold uppercase tracking-wide text-slate-400'
const infoValue = 'mt-1 text-sm text-slate-800'

export default function BatchDetailPage() {
    const { id } = useParams<{ id: string }>()
    const { user, token, logout } = useWorkspace()
    const [batch, setBatch] = useState<BatchDetail | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState('')
    const [retry, setRetry] = useState(0)
    const [actionError, setActionError] = useState('')
    const [actionMessage, setActionMessage] = useState('')
    const [busyTaskId, setBusyTaskId] = useState<number | null>(null)
    const [editingTaskId, setEditingTaskId] = useState<number | null>(null)
    const [selectedAssigneeId, setSelectedAssigneeId] = useState('')
    const [collaborators, setCollaborators] = useState<Collaborator[] | null>(null)
    const [collaboratorsLoading, setCollaboratorsLoading] = useState(false)
    const [collaboratorsError, setCollaboratorsError] = useState('')
    const [exporting, setExporting] = useState(false)
    const [transferOpen, setTransferOpen] = useState(false)
    const [qaMembers, setQaMembers] = useState<QaMember[] | null>(null)
    const [selectedQaId, setSelectedQaId] = useState('')
    const [transferBusy, setTransferBusy] = useState(false)
    const [transferError, setTransferError] = useState('')
    const [transferMessage, setTransferMessage] = useState('')
    const actionBusy = useRef(false)

    useEffect(() => {
        const controller = new AbortController()
        async function loadBatch() {
            setIsLoading(true)
            setError('')
            setBatch(null)
            if (!/^[1-9]\d*$/.test(id)) {
                setError('Mã lô không hợp lệ.')
                setIsLoading(false)
                return
            }
            try {
                const response = await fetch(`/api/batches/${id}`, {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: controller.signal,
                })
                if (response.status === 401) {
                    logout()
                    return
                }
                if (response.status === 403 || response.status === 404) {
                    setError('Không tìm thấy lô tài liệu hoặc bạn không có quyền xem.')
                    return
                }
                if (!response.ok) throw new Error('Không thể tải chi tiết lô')
                const data: BatchDetail = await response.json()
                let schema: unknown = data.schema_config
                if (typeof schema === 'string') {
                    try {
                        schema = JSON.parse(schema) as unknown
                    } catch {
                        throw new Error('Cấu hình trường của lô không hợp lệ. Hãy kiểm tra dữ liệu lô.')
                    }
                }
                if (!Array.isArray(schema) || !schema.every(field =>
                    field !== null && typeof field === 'object' &&
                    typeof field.key === 'string' && typeof field.label === 'string' &&
                    typeof field.type === 'string' && typeof field.required === 'boolean'
                )) {
                    throw new Error('Cấu hình trường của lô không hợp lệ. Hãy kiểm tra dữ liệu lô.')
                }
                if (!controller.signal.aborted) setBatch({ ...data, schema_config: schema as SchemaField[] })
            } catch (cause) {
                if (!controller.signal.aborted) setError(cause instanceof Error && cause.message.startsWith('Cấu hình trường')
                    ? cause.message
                    : 'Không thể tải chi tiết lô. Hãy kiểm tra backend và thử lại.')
            } finally {
                if (!controller.signal.aborted) setIsLoading(false)
            }
        }
        loadBatch()
        return () => controller.abort()
    }, [id, token, logout, retry])

    async function openTransfer() {
        if (user.role !== 'ADMIN' || transferBusy) return
        if (transferOpen) { setTransferOpen(false); return }
        setTransferOpen(true)
        setSelectedQaId('')
        setTransferError('')
        if (qaMembers !== null) return
        try {
            const response = await fetch('/api/auth/users', { headers: { Authorization: `Bearer ${token}` } })
            if (response.status === 401) { logout(); return }
            if (!response.ok) throw new Error('Không thể tải danh sách QA.')
            const members: unknown = await response.json()
            if (!Array.isArray(members)) throw new Error('Danh sách QA không hợp lệ.')
            setQaMembers((members as QaMember[]).filter(member => member.role === 'QA' && member.status === 'ACTIVE'))
        } catch {
            setTransferError('Không thể tải danh sách QA. Hãy đóng và thử lại.')
        }
    }

    async function handleTransferQa() {
        const qaId = Number(selectedQaId)
        if (!batch || user.role !== 'ADMIN' || transferBusy || !Number.isSafeInteger(qaId) || qaId <= 0 || qaId === batch.qa_id) return
        setTransferBusy(true)
        setTransferError('')
        setTransferMessage('')
        try {
            const response = await fetch(`/api/batches/${batch.id}/transfer-qa`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ qa_id: qaId }),
            })
            if (response.status === 401) { logout(); return }
            if (!response.ok) {
                const data: { message?: string | string[] } = await response.json().catch(() => ({}))
                setTransferError(Array.isArray(data.message) ? data.message.join('; ') : data.message || 'Không thể bàn giao lô.')
                return
            }
            const data: { qa: { id: number; full_name: string }; transferred_tasks: number } = await response.json()
            setBatch(current => current ? { ...current, qa_id: data.qa.id, qa: data.qa } : current)
            setTransferMessage(`Đã bàn giao lô và ${data.transferred_tasks} công việc cho ${data.qa.full_name}.`)
            setTransferOpen(false)
        } catch {
            setTransferError('Không thể xác nhận kết quả. Hãy tải lại trang để kiểm tra trước khi thử lại.')
        } finally {
            setTransferBusy(false)
        }
    }

    async function loadCollaborators() {
        setCollaboratorsError('')
        setCollaboratorsLoading(true)
        try {
            const response = await fetch('/api/auth/collaborators', { headers: { Authorization: `Bearer ${token}` } })
            if (response.status === 401) { logout(); return }
            if (!response.ok) throw new Error('Không thể tải danh sách CTV đang hoạt động.')
            setCollaborators(await response.json() as Collaborator[])
        } catch {
            setCollaboratorsError('Không thể tải danh sách CTV đang hoạt động. Hãy thử lại.')
        } finally {
            setCollaboratorsLoading(false)
        }
    }

    function beginReassign(task: Task) {
        if (actionBusy.current || (user.role !== 'ADMIN' && user.role !== 'QA') || task.status !== 'ASSIGNED') return
        if (editingTaskId === task.id) { setEditingTaskId(null); return }
        setEditingTaskId(task.id)
        setSelectedAssigneeId('')
        if (collaborators === null && !collaboratorsLoading) void loadCollaborators()
    }

    async function handleReassign(task: Task) {
        const assigneeId = Number(selectedAssigneeId)
        if (actionBusy.current || !Number.isSafeInteger(assigneeId) || assigneeId <= 0 || assigneeId === task.assignee_id) return
        actionBusy.current = true
        setBusyTaskId(task.id)
        setActionError('')
        setActionMessage('')
        try {
            const response = await fetch(`/api/tasks/${task.id}/reassign`, {
                method: 'PUT',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ assignee_id: assigneeId }),
            })
            if (response.status === 401) { logout(); return }
            if (!response.ok) {
                const data: { message?: string | string[] } = await response.json().catch(() => ({}))
                setActionError(Array.isArray(data.message) ? data.message.join('; ') : data.message || 'Không thể đổi CTV.')
                if (response.status === 400 || response.status === 403 || response.status === 404) setRetry(value => value + 1)
                return
            }
            const data: { assignee: Collaborator } = await response.json()
            setBatch(current => current ? { ...current, tasks: current.tasks.map(item => item.id === task.id ? { ...item, assignee_id: data.assignee.id, assignee: data.assignee } : item) } : current)
            setActionMessage(`Đã chuyển “${task.title}” cho ${data.assignee.full_name}.`)
            setEditingTaskId(null)
        } catch {
            setActionError('Không thể xác nhận kết quả. Danh sách sẽ được tải lại để kiểm tra.')
            setRetry(value => value + 1)
        } finally {
            actionBusy.current = false
            setBusyTaskId(null)
        }
    }

    async function handleUnassign(task: Task) {
        if (actionBusy.current || (user.role !== 'ADMIN' && user.role !== 'QA') || task.status !== 'ASSIGNED') return
        if (!window.confirm(`Hủy phân công "${task.title}" cho ${task.assignee?.full_name || `CTV #${task.assignee_id}`}? Công việc sẽ trở lại chờ phân công.`)) return
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
            setBatch(current => current ? { ...current, tasks: current.tasks.map(item => item.id === task.id ? { ...item, status: 'PENDING', assignee_id: null, assignee: null } : item) } : current)
            setActionMessage(`Đã hủy phân công công việc #${task.id}. Bạn có thể giao lại.`)
        } catch {
            setActionError('Không thể xác nhận kết quả. Danh sách sẽ được tải lại để kiểm tra.')
            setRetry(value => value + 1)
        } finally {
            actionBusy.current = false
            setBusyTaskId(null)
        }
    }

    async function handleExport() {
        if (!batch || (user.role !== 'ADMIN' && user.role !== 'QA') || exporting) return
        setActionError('')
        setActionMessage('')
        setExporting(true)
        try {
            const response = await fetch(`/api/batches/${batch.id}/export`, {
                headers: { Authorization: `Bearer ${token}` },
            })
            if (response.status === 401) { logout(); return }
            if (!response.ok) {
                const data: { message?: string | string[] } = await response.json().catch(() => ({}))
                setActionError(Array.isArray(data.message) ? data.message.join('; ') : data.message || 'Không thể xuất dữ liệu đã duyệt.')
                return
            }
            const url = URL.createObjectURL(await response.blob())
            const link = document.createElement('a')
            link.href = url
            link.download = `docuflow-${batch.batch_code.replace(/[^a-zA-Z0-9_-]/g, '_')}-approved.csv`
            document.body.appendChild(link)
            link.click()
            link.remove()
            window.setTimeout(() => URL.revokeObjectURL(url), 1000)
            setActionMessage('Đã tải dữ liệu các công việc được duyệt trong lô.')
        } catch {
            setActionError('Không thể tải file CSV. Vui lòng thử lại.')
        } finally {
            setExporting(false)
        }
    }

    const back = (
        <Link href="/batches" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-900">
            <ArrowLeft className="size-4" aria-hidden="true" /> Quay lại danh sách lô
        </Link>
    )

    if (isLoading) return <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">{back}<p role="status" className="mt-8 text-sm text-slate-600">Đang tải chi tiết lô...</p></main>
    if (error || !batch) return (
        <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
            {back}
            <div role="alert" className="mt-8 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
                <p>{error || 'Không thể tải chi tiết lô.'}</p>
                <button type="button" onClick={() => setRetry(value => value + 1)} className="mt-3 font-semibold underline">Thử lại</button>
            </div>
        </main>
    )

    return (
        <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
            {back}
            <div className="mt-6 flex flex-col justify-between gap-5 border-b border-slate-200 pb-7 sm:flex-row sm:items-end">
                <div>
                    <span className="rounded-md bg-blue-50 px-2.5 py-1 font-mono text-xs font-bold text-blue-700">{batch.batch_code}</span>
                    <h1 className="mt-3 page-title">{batch.name}</h1>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{batch.description || 'Không có mô tả'}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-sm text-slate-500"><CalendarDays className="size-4" aria-hidden="true" />Tạo ngày {new Date(batch.created_at).toLocaleDateString('vi-VN')}</div>
            </div>

            <div className="mt-8 grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-5"><div><h2 className="text-lg font-bold text-slate-900">Thông tin lô</h2><p className="mt-1 text-sm text-slate-500">Thông tin nhận diện của lô tài liệu.</p></div>{user.role === 'ADMIN' && <button type="button" onClick={openTransfer} className="text-sm font-semibold text-blue-700 hover:underline">{batch.qa_id ? 'Bàn giao QA' : 'Giao cho QA'}</button>}</div>
                    <dl className="mt-6 flex flex-col gap-5">
                        <div><dt className={infoLabel}>Mã lô</dt><dd className={infoValue}>{batch.batch_code}</dd></div>
                        <div><dt className={infoLabel}>Tên lô</dt><dd className={infoValue}>{batch.name}</dd></div>
                        <div><dt className={infoLabel}>Mô tả</dt><dd className={infoValue}>{batch.description || 'Không có mô tả'}</dd></div>
                        <div><dt className={infoLabel}>Đơn giá</dt><dd className={infoValue}>{batch.unit_price === null ? 'Chưa có' : Number(batch.unit_price).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}</dd></div>
                        <div><dt className={infoLabel}>QA quản lý</dt><dd className={infoValue}>{batch.qa?.full_name || 'Admin quản lý'}</dd></div>
                    </dl>
                    {transferMessage && <p role="status" className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{transferMessage}</p>}
                    {transferOpen && <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/40 p-4 text-sm">
                        <label htmlFor="transfer-qa" className="block font-semibold text-slate-700">QA nhận lô và toàn bộ công việc trong lô</label>
                        <select id="transfer-qa" value={selectedQaId} onChange={event => setSelectedQaId(event.target.value)} disabled={transferBusy} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800">
                            <option value="">Chọn QA đang hoạt động</option>
                            {qaMembers?.filter(member => member.id !== batch.qa_id).map(member => <option key={member.id} value={member.id}>{member.full_name}</option>)}
                        </select>
                        {qaMembers !== null && !qaMembers.some(member => member.id !== batch.qa_id) && <p className="mt-2 text-slate-600">Chưa có QA khác đang hoạt động.</p>}
                        {transferError && <p role="alert" className="mt-2 text-red-700">{transferError}</p>}
                        <div className="mt-3 flex gap-3"><button type="button" disabled={!selectedQaId || transferBusy} onClick={handleTransferQa} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50">{transferBusy ? 'Đang bàn giao...' : 'Xác nhận bàn giao'}</button><button type="button" disabled={transferBusy} onClick={() => setTransferOpen(false)} className="font-semibold text-slate-600 hover:underline">Hủy</button></div>
                    </div>}
                </section>
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                    <div className="border-b border-slate-100 pb-5"><h2 className="text-lg font-bold text-slate-900">Các trường nhập liệu</h2><p className="mt-1 text-sm text-slate-500">Thông tin cộng tác viên cần nhập khi xử lý.</p></div>
                    {!batch.schema_config?.length ? <p className="mt-5 text-sm text-slate-500">Chưa có trường nhập liệu.</p> : (
                        <div className="mt-5 overflow-x-auto">
                            <table className="w-full min-w-[560px] text-left text-sm">
                                <thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400"><th className="pb-3">Tên hiển thị</th><th className="pb-3">Mã trường</th><th className="pb-3">Kiểu dữ liệu</th><th className="pb-3">Yêu cầu</th></tr></thead>
                                <tbody>{batch.schema_config.map(field => <tr key={field.key} className="border-b border-slate-50 last:border-0"><td className="py-4 font-semibold text-slate-800">{field.label}</td><td className="py-4 font-mono text-xs text-slate-500">{field.key}</td><td className="py-4 text-slate-600">{typeLabels[field.type] || field.type}</td><td className="py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${field.required ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{field.required ? 'Bắt buộc' : 'Không bắt buộc'}</span></td></tr>)}</tbody>
                            </table>
                        </div>
                    )}
                </section>
            </div>

            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
                    <div><h2 className="text-lg font-bold text-slate-900">Công việc trong lô</h2><p className="mt-1 text-sm text-slate-500">Danh sách công việc bạn có quyền xem.</p></div>
                    {(user.role === 'ADMIN' || user.role === 'QA') && (
                        <div className="flex flex-wrap gap-2">
                            <button type="button" disabled={exporting} onClick={handleExport} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"><Download className="size-4" />{exporting ? 'Đang xuất...' : 'Xuất CSV đã duyệt'}</button>
                            <Link href={`/batches/${batch.id}/tasks/assign`} className="inline-flex items-center justify-center rounded-xl border border-blue-200 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50">Phân công</Link>
                            <Link href={`/batches/${batch.id}/tasks/new`} className="inline-flex items-center justify-center rounded-xl bg-[#0b4ea2] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800">Thêm công việc</Link>
                        </div>
                    )}
                </div>
                {actionError && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}
                {actionMessage && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{actionMessage}</p>}
                {!batch.tasks?.length ? (
                    <div className="py-12 text-center text-sm text-slate-500"><FileText className="mx-auto mb-3 size-8 text-slate-300" aria-hidden="true" />Chưa có công việc nào trong lô.</div>
                ) : (
                    <div className="mt-5 grid gap-3">
                        {batch.tasks.map(task => (
                            <article key={task.id} className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4 text-sm md:grid-cols-4 md:items-center">
                                <p className="font-semibold text-slate-800">{task.title}</p>
                                <p className="text-slate-600">{task.assignee_id === null ? 'Chưa phân công' : `Người thực hiện: ${task.assignee?.full_name || `CTV #${task.assignee_id}`}`}</p>
                                <div className="text-slate-600">
                                    <p>Trạng thái: {statusLabels[task.status] || task.status}</p>
                                    {(user.role === 'ADMIN' || user.role === 'QA') && task.status === 'ASSIGNED' && task.assignee_id !== null && (
                                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                                            <button type="button" disabled={busyTaskId !== null} onClick={() => beginReassign(task)} className="font-semibold text-blue-700 hover:underline disabled:cursor-wait disabled:opacity-50">Đổi CTV</button>
                                            <button type="button" disabled={busyTaskId !== null} onClick={() => handleUnassign(task)} className="font-semibold text-amber-700 hover:underline disabled:cursor-wait disabled:opacity-50">{busyTaskId === task.id ? 'Đang thu hồi...' : 'Hủy phân công'}</button>
                                        </div>
                                    )}
                                </div>
                                <div className="text-slate-600"><p>Ưu tiên: {priorityLabels[task.priority] || task.priority}</p><p className="mt-1">Hạn hoàn thành: {formatTaskDeadline(task.deadline)}</p></div>
                                {editingTaskId === task.id && (
                                    <div className="rounded-xl border border-blue-100 bg-white p-3 md:col-span-4">
                                        <label htmlFor={`assignee-${task.id}`} className="block text-sm font-semibold text-slate-700">Chuyển công việc cho CTV</label>
                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                            <select id={`assignee-${task.id}`} value={selectedAssigneeId} onChange={event => setSelectedAssigneeId(event.target.value)} disabled={collaboratorsLoading || busyTaskId !== null} className="min-w-52 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">
                                                <option value="">Chọn CTV đang hoạt động</option>
                                                {collaborators?.filter(person => person.id !== task.assignee_id).map(person => <option key={person.id} value={person.id}>{person.full_name}</option>)}
                                            </select>
                                            <button type="button" disabled={!selectedAssigneeId || busyTaskId !== null} onClick={() => handleReassign(task)} className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{busyTaskId === task.id ? 'Đang lưu...' : 'Xác nhận đổi'}</button>
                                            <button type="button" disabled={busyTaskId !== null} onClick={() => setEditingTaskId(null)} className="px-2 py-2 font-semibold text-slate-600 hover:underline">Hủy</button>
                                        </div>
                                        {collaboratorsLoading && <p role="status" className="mt-2 text-slate-500">Đang tải danh sách CTV...</p>}
                                        {collaboratorsError && <p role="alert" className="mt-2 text-red-700">{collaboratorsError} <button type="button" onClick={() => void loadCollaborators()} className="font-semibold underline">Thử lại</button></p>}
                                        {collaborators !== null && !collaborators.some(person => person.id !== task.assignee_id) && <p className="mt-2 text-slate-500">Chưa có CTV khác đang hoạt động.</p>}
                                    </div>
                                )}
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </main>
    )
}
