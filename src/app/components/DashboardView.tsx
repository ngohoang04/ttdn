'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BriefcaseBusiness, ClipboardCheck, FileArchive, FileCheck2, FileClock, FileText, FileWarning, Users } from 'lucide-react'
import { useWorkspace, type Role } from './WorkspaceShell'

type Task = { id: number; title: string; status: string; batch: { batch_code: string } | null }
type Data = { counts: Record<string, number>; batch_count: number; collaborator_count: number; recent: Task[] }
type Stat = { label: string; value: number; icon: typeof FileArchive; tone: string; href: string }

const roleLabels: Record<Role, string> = { ADMIN: 'Quản trị viên', QA: 'Kiểm duyệt viên', COLLABORATOR: 'Cộng tác viên' }
const statusLabels: Record<string, string> = { PENDING: 'Chờ phân công', ASSIGNED: 'Đang thực hiện', SUBMITTED: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Cần sửa', ERROR_REPORTED: 'Đã báo lỗi' }
const statusColors: Record<string, string> = { ASSIGNED: 'bg-blue-50 text-blue-700', SUBMITTED: 'bg-amber-50 text-amber-700', APPROVED: 'bg-emerald-50 text-emerald-700', REJECTED: 'bg-rose-50 text-rose-700' }

function statsFor(role: Role, data: Data): Stat[] {
    const count = (status: string) => data.counts[status] ?? 0
    if (role === 'ADMIN') return [
        { label: 'Lô tài liệu', value: data.batch_count, icon: FileArchive, tone: 'bg-blue-50 text-blue-700', href: '/batches' },
        { label: 'Công việc đang thực hiện', value: count('ASSIGNED'), icon: BriefcaseBusiness, tone: 'bg-violet-50 text-violet-700', href: '/tasks?status=ASSIGNED' },
        { label: 'Bài chờ duyệt', value: count('SUBMITTED'), icon: ClipboardCheck, tone: 'bg-amber-50 text-amber-700', href: '/tasks?status=SUBMITTED' },
        { label: 'Cộng tác viên', value: data.collaborator_count, icon: Users, tone: 'bg-emerald-50 text-emerald-700', href: '/users' },
    ]
    if (role === 'QA') return [
        { label: 'Lô tài liệu của tôi', value: data.batch_count, icon: FileArchive, tone: 'bg-blue-50 text-blue-700', href: '/batches' },
        { label: 'Bài chờ duyệt', value: count('SUBMITTED'), icon: ClipboardCheck, tone: 'bg-amber-50 text-amber-700', href: '/tasks?status=SUBMITTED' },
        { label: 'Đã duyệt', value: count('APPROVED'), icon: FileCheck2, tone: 'bg-emerald-50 text-emerald-700', href: '/tasks?status=APPROVED' },
        { label: 'Đã trả lại', value: count('REJECTED'), icon: FileClock, tone: 'bg-rose-50 text-rose-700', href: '/tasks?status=REJECTED' },
    ]
    return [
        { label: 'Việc được giao', value: count('ASSIGNED'), icon: BriefcaseBusiness, tone: 'bg-blue-50 text-blue-700', href: '/tasks?status=ASSIGNED' },
        { label: 'Đã nộp', value: count('SUBMITTED'), icon: FileCheck2, tone: 'bg-emerald-50 text-emerald-700', href: '/tasks?status=SUBMITTED' },
        { label: 'Cần sửa', value: count('REJECTED'), icon: FileClock, tone: 'bg-rose-50 text-rose-700', href: '/tasks?status=REJECTED' },
        { label: 'File đã báo lỗi', value: count('ERROR_REPORTED'), icon: FileWarning, tone: 'bg-red-50 text-red-700', href: '/tasks?status=ERROR_REPORTED' },
    ]
}

export default function DashboardView() {
    const { user, token, logout } = useWorkspace()
    const [data, setData] = useState<Data | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [retry, setRetry] = useState(0)

    useEffect(() => {
        const controller = new AbortController()
        async function load() {
            setLoading(true); setError('')
            try {
                const response = await fetch('/api/tasks/dashboard', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
                if (response.status === 401) { logout(); return }
                if (!response.ok) throw new Error('Không thể tải số liệu tổng quan. Vui lòng thử lại.')
                const result: Data = await response.json()
                if (!result || !result.counts || !Array.isArray(result.recent) || typeof result.batch_count !== 'number' || typeof result.collaborator_count !== 'number') throw new Error('Dữ liệu tổng quan không hợp lệ.')
                if (!controller.signal.aborted) setData(result)
            } catch (cause) {
                if (!controller.signal.aborted) setError(cause instanceof Error && cause.message !== 'Failed to fetch' ? cause.message : 'Không thể kết nối đến máy chủ. Hãy kiểm tra backend.')
            } finally { if (!controller.signal.aborted) setLoading(false) }
        }
        load()
        return () => controller.abort()
    }, [token, logout, retry])

    const stats = data ? statsFor(user.role, data) : []
    const recent = data?.recent ?? []

    return <main className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 sm:py-9 lg:px-10">
        <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><h1 className="page-title">Xin chào, {user.full_name}</h1><p className="mt-2 text-sm text-slate-500">{user.role === 'ADMIN' ? 'Theo dõi hoạt động của không gian Docuflow.' : user.role === 'QA' ? 'Theo dõi bài chờ kiểm tra và kết quả duyệt.' : 'Xem nhanh công việc được giao và bài cần hoàn thiện.'}</p></div><div className="flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"><span className="text-xs font-medium text-slate-500">Vai trò:</span><span className="rounded-lg bg-[#0b4ea2] px-3 py-2 text-xs font-semibold text-white">{roleLabels[user.role]}</span></div></div>
        {loading ? <p role="status" className="rounded-2xl bg-white px-6 py-12 text-center text-sm text-slate-500">Đang tải số liệu tổng quan...</p> : error ? <div role="alert" className="rounded-2xl border border-red-200 bg-white p-6 text-sm text-red-700"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="mt-3 font-semibold underline">Thử lại</button></div> : <>
            <div className={`grid gap-4 ${stats.length === 4 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3'}`}>{stats.map(stat => { const Icon = stat.icon; return <Link href={stat.href} key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md"><div className="flex items-start justify-between"><div><p className="text-sm text-slate-500">{stat.label}</p><p className="mt-4 text-3xl font-semibold text-slate-900">{stat.value}</p></div><div className={`flex size-10 items-center justify-center rounded-xl ${stat.tone}`}><Icon className="size-5" /></div></div><p className="mt-4 text-xs text-blue-700">Xem danh sách →</p></Link> })}</div>
            <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 sm:px-6"><div><h2 className="font-semibold text-slate-900">Công việc gần đây</h2><p className="mt-1 text-xs text-slate-500">{user.role === 'QA' ? 'Công việc do bạn tạo và giao' : 'Cập nhật mới nhất'}</p></div><Link href="/tasks" className="text-xs font-semibold text-[#0b4ea2] hover:underline">Xem tất cả</Link></div>{recent.length === 0 ? <div className="flex min-h-[200px] flex-col items-center justify-center px-6 text-center"><FileText className="size-10 text-slate-300" /><p className="mt-3 text-sm font-medium text-slate-700">Chưa có công việc nào</p></div> : <ul className="divide-y divide-slate-100">{recent.map(task => <li key={task.id}><Link href={user.role === 'COLLABORATOR' ? `/tasks/${task.id}` : task.status === 'SUBMITTED' ? `/tasks/${task.id}/review` : `/tasks?status=${task.status}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50 sm:px-6"><div><p className="text-sm font-semibold text-slate-800">{task.title}</p><p className="mt-1 text-xs text-slate-500">#{task.id}{task.batch?.batch_code ? ` · ${task.batch.batch_code}` : ''}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusColors[task.status] || 'bg-slate-100 text-slate-600'}`}>{statusLabels[task.status] || task.status}</span></Link></li>)}</ul>}</section>
            <p className="mt-4 text-xs text-slate-500">Số liệu phản ánh trạng thái hiện tại. Tải lại trang để cập nhật.</p>
        </>}
    </main>
}
