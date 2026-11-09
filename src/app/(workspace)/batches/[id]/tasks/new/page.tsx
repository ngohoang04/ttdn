'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { useWorkspace } from '@/app/components/WorkspaceShell'

type Priority = 'NORMAL' | 'HIGH' | 'URGENT'
type Job = { id: number; title: string; file_url: string; file: File | null; priority: Priority; deadline: string }
type BatchSummary = { id: number; batch_code: string; name: string }
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100'
const labelClass = 'mb-2 block text-sm font-semibold text-slate-700'

export default function CreateTasksPage() {
    const { id } = useParams<{ id: string }>()
    const { user, token, logout } = useWorkspace()
    const router = useRouter()
    const [batch, setBatch] = useState<BatchSummary | null>(null)
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [retry, setRetry] = useState(0)
    const [jobs, setJobs] = useState<Job[]>([{ id: 1, title: '', file_url: '', file: null, priority: 'NORMAL', deadline: '' }])
    const [error, setError] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const nextId = useRef(2)
    const isSubmitting = useRef(false)

    useEffect(() => {
        if (user.role !== 'ADMIN' && user.role !== 'QA') return
        const controller = new AbortController()
        async function loadBatch() {
            setLoading(true)
            setLoadError('')
            setBatch(null)
            if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
                setLoadError('Mã lô không hợp lệ.')
                setLoading(false)
                return
            }
            try {
                const response = await fetch(`/api/batches/${id}`, {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: controller.signal,
                })
                if (response.status === 401) { logout(); return }
                if (response.status === 403 || response.status === 404) {
                    setLoadError('Không tìm thấy lô tài liệu hoặc bạn không có quyền xem.')
                    return
                }
                if (!response.ok) throw new Error('Không thể tải lô tài liệu')
                const data: BatchSummary = await response.json()
                if (!controller.signal.aborted) setBatch(data)
            } catch {
                if (!controller.signal.aborted) setLoadError('Không thể tải thông tin lô. Hãy kiểm tra backend.')
            } finally {
                if (!controller.signal.aborted) setLoading(false)
            }
        }
        loadBatch()
        return () => controller.abort()
    }, [id, user.role, token, logout, retry])

    function updateJob(jobId: number, changes: Partial<Omit<Job, 'id'>>) {
        setJobs(current => current.map(job => job.id === jobId ? { ...job, ...changes } : job))
    }

    function addJob() {
        const jobId = nextId.current++
        setJobs(current => [...current, { id: jobId, title: '', file_url: '', file: null, priority: 'NORMAL', deadline: '' }])
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (isSubmitting.current || !batch || (user.role !== 'ADMIN' && user.role !== 'QA')) return
        setError('')
        if (jobs.some(job => !job.title.trim() || (!job.file && !job.file_url.trim()))) {
            setError('Mỗi công việc cần tên và một file hoặc đường dẫn tài liệu.')
            return
        }
        if (jobs.some(job => job.file && (job.file.size < 1 || job.file.size > 10 * 1024 * 1024 || !['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(job.file.type)))) {
            setError('Chỉ chọn PDF, PNG, JPG hoặc WebP có dung lượng tối đa 10 MB.')
            return
        }
        isSubmitting.current = true
        setSubmitting(true)
        const stagedRefs: string[] = []
        let createRequestStarted = false
        let confirmedFailure = false
        try {
            const items = []
            for (const job of jobs) {
                let fileUrl = job.file_url.trim()
                if (job.file) {
                    const form = new FormData()
                    form.append('batch_id', String(batch.id))
                    form.append('file', job.file)
                    const uploaded = await fetch('/api/tasks/files', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
                    if (uploaded.status === 401) { confirmedFailure = true; logout(); return }
                    if (!uploaded.ok) {
                        confirmedFailure = true
                        const data: { message?: string | string[] } = await uploaded.json().catch(() => ({}))
                        throw new Error(Array.isArray(data.message) ? data.message.join('; ') : data.message || `Không thể tải file ${job.file.name}.`)
                    }
                    const data: { file_url: string } = await uploaded.json()
                    if (!data.file_url?.startsWith('stored:')) throw new Error('Máy chủ không trả về mã file hợp lệ.')
                    fileUrl = data.file_url
                    stagedRefs.push(fileUrl)
                }
                items.push({ title: job.title.trim(), file_url: fileUrl, priority: job.priority, ...(job.deadline ? { deadline: job.deadline } : {}) })
            }
            createRequestStarted = true
            const response = await fetch('/api/tasks/batch-items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ batch_id: batch.id, items }),
            })
            if (response.status === 401) { confirmedFailure = true; logout(); return }
            if (!response.ok) {
                confirmedFailure = true
                const data: { message?: string | string[] } = await response.json().catch(() => ({}))
                setError((Array.isArray(data.message) ? data.message.join('; ') : data.message) || 'Không thể tạo công việc. Vui lòng thử lại.')
                return
            }
            router.replace(`/batches/${batch.id}`)
        } catch (cause) {
            if (!createRequestStarted) confirmedFailure = true
            setError(cause instanceof Error && cause.message !== 'Failed to fetch' ? cause.message : 'Không thể kết nối đến máy chủ. Hãy kiểm tra backend và thử lại.')
        } finally {
            if (confirmedFailure && stagedRefs.length) {
                const cleanup = await Promise.allSettled(stagedRefs.map(ref => fetch('/api/tasks/files/staged', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ file_url: ref }),
                })))
                if (cleanup.some(result => result.status === 'rejected' || !result.value.ok)) {
                    setError(current => `${current} Một số file tạm chưa dọn được; quản trị viên có thể chạy lệnh dọn file cũ.`)
                }
            }
            isSubmitting.current = false
            setSubmitting(false)
        }
    }

    const back = <Link href={`/batches/${id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-900"><ArrowLeft className="size-4" aria-hidden="true" />Quay lại chi tiết lô</Link>

    if (user.role !== 'ADMIN' && user.role !== 'QA') return (
        <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
            {back}
            <p role="alert" className="mt-6 text-red-600">Bạn không có quyền tạo công việc.</p>
        </main>
    )
    if (loading) return <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">{back}<p role="status" className="mt-6 text-sm text-slate-600">Đang tải thông tin lô...</p></main>
    if (loadError || !batch) return (
        <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8">
            {back}
            <div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
                <p>{loadError || 'Không thể tải thông tin lô.'}</p>
                <button type="button" onClick={() => setRetry(value => value + 1)} className="mt-3 font-semibold underline">Thử lại</button>
            </div>
        </main>
    )

    return (
        <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
            {back}
            <div className="mt-6 border-b border-slate-200 pb-7">
                <div className="flex flex-wrap items-center gap-3"><span className="rounded-md bg-blue-50 px-2.5 py-1 font-mono text-xs font-bold text-blue-700">{batch.batch_code}</span><span className="text-sm text-slate-500">{batch.name}</span></div>
                <h1 className="mt-4 page-title">Thêm công việc vào lô</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Mỗi công việc tương ứng với một tài liệu cần xử lý trong lô này.</p>
            </div>

            <form onSubmit={handleSubmit} className="mt-8">
                <fieldset disabled={submitting}>
                    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center">
                            <div><h2 className="text-lg font-bold text-slate-900">Danh sách công việc</h2><p className="mt-1 text-sm text-slate-500">Nhập thông tin tài liệu cần xử lý.</p></div>
                            <button type="button" onClick={addJob} className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50"><Plus className="size-4" />Thêm công việc</button>
                        </div>
                        <div className="mt-6 flex flex-col gap-5">
                            {jobs.map((job, index) => (
                                <article key={job.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
                                    <div className="mb-5 flex items-center justify-between">
                                        <div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-lg bg-blue-100 text-sm font-bold text-blue-700">{index + 1}</span><h3 className="text-sm font-bold text-slate-800">Công việc {index + 1}</h3></div>
                                        <button type="button" onClick={() => setJobs(current => current.filter(item => item.id !== job.id))} disabled={jobs.length === 1} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40" aria-label={`Xóa công việc ${index + 1}`}><Trash2 className="size-4" />Xóa</button>
                                    </div>
                                    <div className="grid gap-5 md:grid-cols-2">
                                        <div><label htmlFor={`job-title-${job.id}`} className={labelClass}>Tên công việc <span className="font-normal text-slate-400">(bắt buộc)</span></label><input id={`job-title-${job.id}`} required maxLength={255} className={inputClass} value={job.title} onChange={event => updateJob(job.id, { title: event.target.value })} placeholder="Ví dụ: Nhập dữ liệu hồ sơ 001" /></div>
                                        <div><label htmlFor={`job-priority-${job.id}`} className={labelClass}>Mức độ ưu tiên</label><select id={`job-priority-${job.id}`} value={job.priority} onChange={event => updateJob(job.id, { priority: event.target.value as Priority })} className={inputClass}><option value="NORMAL">Bình thường</option><option value="HIGH">Cao</option><option value="URGENT">Khẩn cấp</option></select></div>
                                        <div><label htmlFor={`job-deadline-${job.id}`} className={labelClass}>Hạn hoàn thành</label><input id={`job-deadline-${job.id}`} type="date" className={inputClass} value={job.deadline} onChange={event => updateJob(job.id, { deadline: event.target.value })} /><p className="mt-1 text-xs text-slate-500">Để trống nếu chưa có hạn hoàn thành.</p></div>
                                        <div className="md:col-span-2"><label htmlFor={`job-file-${job.id}`} className={labelClass}>File tài liệu</label><input id={`job-file-${job.id}`} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp" onChange={event => updateJob(job.id, { file: event.target.files?.[0] || null })} className={inputClass} /><p className="mt-1 text-xs text-slate-500">PDF, PNG, JPG hoặc WebP · tối đa 10 MB.</p></div>
                                        <div className="md:col-span-2"><label htmlFor={`job-url-${job.id}`} className={labelClass}>Hoặc đường dẫn tài liệu</label><input id={`job-url-${job.id}`} type="url" maxLength={500} disabled={!!job.file} className={inputClass} value={job.file_url} onChange={event => updateJob(job.id, { file_url: event.target.value })} placeholder="https://example.com/tai-lieu-001.pdf" /><p className="mt-1 text-xs text-slate-500">Chọn file hoặc nhập đường dẫn đến tài liệu đã có sẵn.</p></div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>
                </fieldset>
                {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <Link href={`/batches/${batch.id}`} className="inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100">Hủy</Link>
                    <button type="submit" disabled={submitting} className="rounded-xl bg-[#0b4ea2] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? 'Đang tạo...' : 'Tạo công việc'}</button>
                </div>
            </form>
        </main>
    )
}
