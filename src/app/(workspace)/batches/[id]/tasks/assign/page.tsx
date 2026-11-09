'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Check, Search, UserRound } from 'lucide-react'
import { useWorkspace } from '@/app/components/WorkspaceShell'
import { formatTaskDeadline } from '@/app/components/taskDeadline'

type Task = { id: number; title: string; priority: string; status: string; deadline: string | null }
type Batch = { id: number; batch_code: string; name: string; tasks: Task[] }
type Collaborator = { id: number; full_name: string; email: string; role: string; status: string }
const priorityLabels: Record<string, string> = { NORMAL: 'Bình thường', HIGH: 'Cao', URGENT: 'Khẩn cấp' }

export default function AssignTasksPage() {
    const { id } = useParams<{ id: string }>()
    const { user, token, logout } = useWorkspace()
    const [batch, setBatch] = useState<Batch | null>(null)
    const [collaborators, setCollaborators] = useState<Collaborator[]>([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [refresh, setRefresh] = useState(0)
    const [query, setQuery] = useState('')
    const [selectedJobs, setSelectedJobs] = useState<number[]>([])
    const [selectedCollaborator, setSelectedCollaborator] = useState<number | null>(null)
    const [error, setError] = useState('')
    const [result, setResult] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const isSubmitting = useRef(false)

    useEffect(() => {
        if (user.role !== 'ADMIN' && user.role !== 'QA') return
        const controller = new AbortController()
        async function loadData() {
            setLoading(true)
            setLoadError('')
            if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
                setLoadError('Mã lô không hợp lệ.')
                setLoading(false)
                return
            }
            try {
                const headers = { Authorization: `Bearer ${token}` }
                const [batchResponse, userResponse] = await Promise.all([
                    fetch(`/api/batches/${id}`, { headers, signal: controller.signal }),
                    fetch('/api/auth/collaborators', { headers, signal: controller.signal }),
                ])
                if (batchResponse.status === 401 || userResponse.status === 401) { logout(); return }
                if (batchResponse.status === 403 || batchResponse.status === 404) {
                    throw new Error('Không tìm thấy lô tài liệu hoặc bạn không có quyền xem.')
                }
                if (!batchResponse.ok || !userResponse.ok) throw new Error('Không thể tải dữ liệu phân công. Hãy thử lại.')
                const batchData: Batch = await batchResponse.json()
                const userData: Collaborator[] = await userResponse.json()
                if (!Array.isArray(batchData.tasks) || !Array.isArray(userData)) throw new Error('Dữ liệu phân công không hợp lệ.')
                if (!controller.signal.aborted) {
                    const available = batchData.tasks.filter(task => task.status === 'PENDING')
                    const active = userData.filter(person => person.role === 'COLLABORATOR' && person.status === 'ACTIVE')
                    setBatch(batchData)
                    setCollaborators(active)
                    setSelectedJobs(current => current.filter(jobId => available.some(task => task.id === jobId)))
                    setSelectedCollaborator(current => active.some(person => person.id === current) ? current : null)
                }
            } catch (cause) {
                if (!controller.signal.aborted) setLoadError(cause instanceof Error && cause.message !== 'Failed to fetch' ? cause.message : 'Không thể kết nối đến máy chủ. Hãy kiểm tra backend.')
            } finally {
                if (!controller.signal.aborted) setLoading(false)
            }
        }
        loadData()
        return () => controller.abort()
    }, [id, user.role, token, logout, refresh])

    const pendingJobs = useMemo(() => batch?.tasks.filter(task => task.status === 'PENDING') ?? [], [batch])
    const visibleJobs = useMemo(() => {
        const normalized = query.trim().toLowerCase()
        return pendingJobs.filter(task => task.title.toLowerCase().includes(normalized))
    }, [pendingJobs, query])
    const allVisibleSelected = visibleJobs.length > 0 && visibleJobs.every(task => selectedJobs.includes(task.id))
    const selectedPerson = collaborators.find(person => person.id === selectedCollaborator)

    function toggleJob(taskId: number) {
        setSelectedJobs(current => current.includes(taskId) ? current.filter(item => item !== taskId) : [...current, taskId])
        setError('')
        setResult('')
    }

    function toggleAllVisible() {
        setSelectedJobs(current => allVisibleSelected
            ? current.filter(item => !visibleJobs.some(task => task.id === item))
            : [...new Set([...current, ...visibleJobs.map(task => task.id)])])
        setError('')
        setResult('')
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (isSubmitting.current || loading || loadError || (user.role !== 'ADMIN' && user.role !== 'QA') || !selectedJobs.length || !selectedPerson) return
        const requestedCount = selectedJobs.length
        setError('')
        setResult('')
        isSubmitting.current = true
        setSubmitting(true)
        try {
            const response = await fetch('/api/tasks/assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ task_ids: selectedJobs, assignee_id: selectedPerson.id }),
            })
            if (response.status === 401) { logout(); return }
            if (!response.ok) {
                const data: { message?: string | string[] } = await response.json().catch(() => ({}))
                const message = Array.isArray(data.message) ? data.message.join('; ') : data.message
                setError(message || 'Không thể phân công công việc. Vui lòng thử lại.')
                if (response.status === 400) setRefresh(value => value + 1)
                return
            }
            const data: { assigned_count?: number } = await response.json()
            if (typeof data.assigned_count !== 'number') {
                setError('Máy chủ đã xử lý yêu cầu nhưng không trả số lượng phân công. Danh sách sẽ được tải lại.')
            } else {
                const remaining = Math.max(0, requestedCount - data.assigned_count)
                setResult(`Đã phân công ${data.assigned_count} trên ${requestedCount} công việc cho ${selectedPerson.full_name}.` + (remaining ? ` ${remaining} công việc không được phân công; hãy kiểm tra lại trạng thái.` : ''))
            }
            setSelectedJobs([])
            setRefresh(value => value + 1)
        } catch {
            setError('Không thể xác nhận kết quả phân công. Vui lòng tải lại danh sách và kiểm tra trước khi thử lại.')
            setRefresh(value => value + 1)
        } finally {
            isSubmitting.current = false
            setSubmitting(false)
        }
    }

    const back = <Link href={`/batches/${id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-900"><ArrowLeft className="size-4" aria-hidden="true" />Quay lại chi tiết lô</Link>

    if (user.role !== 'ADMIN' && user.role !== 'QA') return <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">{back}<p role="alert" className="mt-6 text-red-600">Bạn không có quyền phân công công việc.</p></main>

    return (
        <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
            {back}
            <div className="mt-6 border-b border-slate-200 pb-7">
                {batch && <div className="flex flex-wrap items-center gap-3"><span className="rounded-md bg-blue-50 px-2.5 py-1 font-mono text-xs font-bold text-blue-700">{batch.batch_code}</span><span className="text-sm text-slate-500">{batch.name}</span></div>}
                <h1 className="mt-4 page-title">Phân công công việc</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Chọn công việc đang chờ phân công và một cộng tác viên để tiếp tục xử lý.</p>
            </div>

            {result && <p role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{result}</p>}
            {error && <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
            {loading && <p role="status" className="mt-6 text-sm text-slate-600">Đang tải dữ liệu phân công...</p>}
            {loadError && <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><p>{loadError}</p><button type="button" onClick={() => setRefresh(value => value + 1)} className="mt-2 font-semibold underline">Thử lại</button></div>}

            {batch && !loadError && (
                <form onSubmit={handleSubmit} className="mt-8">
                    <fieldset disabled={submitting || loading} className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
                        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                            <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
                                <div><h2 className="text-lg font-bold text-slate-900">Công việc đang chờ</h2><p className="mt-1 text-sm text-slate-500">Chỉ hiển thị công việc đang chờ phân công.</p></div>
                                <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">{selectedJobs.length} đã chọn</span>
                            </div>
                            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                                <label className="relative flex-1"><span className="sr-only">Tìm theo tên công việc</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm theo tên công việc..." className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label>
                                <button type="button" onClick={toggleAllVisible} disabled={!visibleJobs.length} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{allVisibleSelected ? 'Bỏ chọn tất cả đang hiển thị' : 'Chọn tất cả đang hiển thị'}</button>
                            </div>
                            <div className="mt-5 flex flex-col gap-3">
                                {visibleJobs.map(task => (
                                    <label key={task.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${selectedJobs.includes(task.id) ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200 hover:border-blue-200'}`}>
                                        <input type="checkbox" checked={selectedJobs.includes(task.id)} onChange={() => toggleJob(task.id)} className="mt-0.5 size-4 accent-blue-700" />
                                        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-800">{task.title}</span><span className="mt-1 block text-xs text-slate-500">Công việc #{task.id} · Hạn hoàn thành: {formatTaskDeadline(task.deadline)}</span></span>
                                        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{priorityLabels[task.priority] || task.priority}</span>
                                    </label>
                                ))}
                                {!visibleJobs.length && <div className="rounded-xl border border-dashed border-slate-200 px-5 py-12 text-center"><p className="text-sm font-semibold text-slate-700">{pendingJobs.length ? 'Không tìm thấy công việc' : 'Không có công việc đang chờ phân công'}</p>{pendingJobs.length > 0 && <p className="mt-1 text-xs text-slate-500">Thử thay đổi từ khóa tìm kiếm.</p>}</div>}
                            </div>
                        </section>

                        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                            <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><UserRound className="size-5" /></span><div><h2 className="font-bold text-slate-900">Chọn cộng tác viên</h2><p className="mt-1 text-xs text-slate-500">Nhận tất cả công việc đã chọn</p></div></div>
                            <div className="mt-5 flex flex-col gap-3">
                                {collaborators.map(person => (
                                    <label key={person.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${selectedCollaborator === person.id ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200 hover:border-blue-200'}`}>
                                        <input type="radio" name="collaborator" checked={selectedCollaborator === person.id} onChange={() => { setSelectedCollaborator(person.id); setError(''); setResult('') }} className="size-4 accent-blue-700" />
                                        <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{person.full_name}</span><span className="block truncate text-xs text-slate-500">{person.email}</span></span>
                                    </label>
                                ))}
                                {!collaborators.length && <p className="text-sm text-slate-500">Chưa có cộng tác viên đang hoạt động.</p>}
                            </div>
                            <div className="mt-6 border-t border-slate-100 pt-5"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tóm tắt</p><p className="mt-2 text-sm text-slate-600">{selectedJobs.length ? <><strong className="text-slate-900">{selectedJobs.length} công việc</strong> sẽ được giao cho <strong className="text-slate-900">{selectedPerson?.full_name || 'người chưa được chọn'}</strong>.</> : 'Chọn công việc và cộng tác viên để xem tóm tắt.'}</p></div>
                        </aside>

                        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end lg:col-span-2">
                            <Link href={`/batches/${batch.id}`} className="inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100">Hủy</Link>
                            <button type="submit" disabled={submitting || loading || !selectedJobs.length || !selectedPerson} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0b4ea2] px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"><Check className="size-4" />{submitting ? 'Đang phân công...' : 'Phân công'}</button>
                        </div>
                    </fieldset>
                </form>
            )}
        </main>
    )
}
