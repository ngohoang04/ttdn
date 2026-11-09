'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Check, Search, UserPlus, Users, X } from 'lucide-react'
import { useWorkspace, type Role } from '@/app/components/WorkspaceShell'

type Status = 'ACTIVE' | 'INVITED' | 'BLOCKED'
type Member = { id: number; full_name: string; email: string; role: Role; status: Status; created_at: string }
const roleLabels: Record<Role, string> = { ADMIN: 'Admin', QA: 'QA', COLLABORATOR: 'Cộng tác viên' }
const statusLabels: Record<Status, string> = { ACTIVE: 'Đang hoạt động', INVITED: 'Chờ kích hoạt', BLOCKED: 'Đã khóa' }
const statusStyles: Record<Status, string> = { ACTIVE: 'bg-emerald-50 text-emerald-700', INVITED: 'bg-amber-50 text-amber-700', BLOCKED: 'bg-slate-100 text-slate-600' }
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100'

function StatusBadge({ status }: { status: Status }) {
    return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[status] || 'bg-slate-100 text-slate-600'}`}>{statusLabels[status] || status}</span>
}
function formatDate(date: string) {
    const parsed = new Date(date)
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('vi-VN')
}

function StatusAction({ member, onSelect }: { member: Member; onSelect: (member: Member) => void }) {
    if ((member.role !== 'COLLABORATOR' && member.role !== 'QA') || member.status === 'INVITED') {
        return <span className="text-sm text-slate-400">—</span>
    }
    if (member.status !== 'ACTIVE' && member.status !== 'BLOCKED') return null
    const label = member.status === 'ACTIVE' ? 'Khóa' : 'Mở khóa'
    return <button type="button" onClick={() => onSelect(member)} aria-label={`${label} tài khoản ${member.full_name}`} className="rounded-lg px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">{label}</button>
}

function RoleAction({ member, onSelect }: { member: Member; onSelect: (member: Member) => void }) {
    if (member.status !== 'ACTIVE' || (member.role !== 'COLLABORATOR' && member.role !== 'QA')) return null
    return <button type="button" onClick={() => onSelect(member)} aria-label={`Đổi vai trò của ${member.full_name}`} className="rounded-lg px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">Đổi vai trò</button>
}

export default function UsersPage() {
    const { user, token, logout } = useWorkspace()
    const [allMembers, setAllMembers] = useState<Member[]>([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState('')
    const [refresh, setRefresh] = useState(0)
    const [query, setQuery] = useState('')
    const [roleFilter, setRoleFilter] = useState('ALL')
    const [statusFilter, setStatusFilter] = useState('ALL')
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [inviteRole, setInviteRole] = useState<'COLLABORATOR' | 'QA'>('COLLABORATOR')
    const [inviteError, setInviteError] = useState('')
    const [result, setResult] = useState('')
    const [sending, setSending] = useState(false)
    const sendingRef = useRef(false)
    const dialogRef = useRef<HTMLDialogElement>(null)
    const statusDialogRef = useRef<HTMLDialogElement>(null)
    const statusBusyRef = useRef(false)
    const [statusTarget, setStatusTarget] = useState<Member | null>(null)
    const [statusBusy, setStatusBusy] = useState(false)
    const [statusError, setStatusError] = useState('')
    const roleDialogRef = useRef<HTMLDialogElement>(null)
    const roleBusyRef = useRef(false)
    const [roleTarget, setRoleTarget] = useState<Member | null>(null)
    const [roleBusy, setRoleBusy] = useState(false)
    const [roleError, setRoleError] = useState('')

    useEffect(() => {
        if (user.role !== 'ADMIN') return
        const controller = new AbortController()
        async function loadMembers() {
            setLoading(true)
            setLoadError('')
            try {
                const response = await fetch('/api/auth/users', {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: controller.signal,
                })
                if (response.status === 401) { logout(); return }
                if (response.status === 403) throw new Error('Bạn không có quyền xem danh sách nhân sự.')
                if (!response.ok) throw new Error('Không thể tải danh sách nhân sự.')
                const data: unknown = await response.json()
                if (!Array.isArray(data)) throw new Error('Dữ liệu nhân sự không hợp lệ.')
                if (!controller.signal.aborted) setAllMembers(data as Member[])
            } catch (cause) {
                if (!controller.signal.aborted) setLoadError(cause instanceof Error && cause.message !== 'Failed to fetch' ? cause.message : 'Không thể kết nối đến máy chủ. Hãy kiểm tra backend.')
            } finally {
                if (!controller.signal.aborted) setLoading(false)
            }
        }
        loadMembers()
        return () => controller.abort()
    }, [user.role, token, logout, refresh])

    const members = useMemo(() => {
        const normalized = query.trim().toLowerCase()
        return allMembers.filter(member =>
            (member.full_name + ' ' + member.email).toLowerCase().includes(normalized) &&
            (roleFilter === 'ALL' || member.role === roleFilter) &&
            (statusFilter === 'ALL' || member.status === statusFilter))
    }, [allMembers, query, roleFilter, statusFilter])

    function openStatus(member: Member) {
        setStatusTarget(member)
        setStatusError('')
        setResult('')
        statusDialogRef.current?.showModal()
    }

    async function submitStatus(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (statusBusyRef.current || !statusTarget || user.role !== 'ADMIN') return
        const nextStatus = statusTarget.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE'
        statusBusyRef.current = true
        setStatusBusy(true)
        setStatusError('')
        try {
            const response = await fetch(`/api/auth/users/${statusTarget.id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ status: nextStatus }),
            })
            if (response.status === 401) { logout(); return }
            if (!response.ok) {
                const data: { message?: string | string[] } = await response.json().catch(() => ({}))
                const message = Array.isArray(data.message) ? data.message.join('; ') : data.message
                setStatusError(response.status >= 500 ? 'Không thể xác nhận kết quả. Hãy tải lại danh sách trước khi thử lại.' : message || 'Không thể thay đổi trạng thái tài khoản.')
                setRefresh(value => value + 1)
                return
            }
            const changed: { id: number; status: 'ACTIVE' | 'BLOCKED' } = await response.json()
            setAllMembers(current => current.map(member => member.id === changed.id ? { ...member, status: changed.status } : member))
            statusDialogRef.current?.close()
            setResult(`Đã ${nextStatus === 'BLOCKED' ? 'khóa' : 'mở khóa'} tài khoản ${statusTarget.full_name}.`)
            setRefresh(value => value + 1)
        } catch {
            setStatusError('Không thể xác nhận kết quả. Hãy tải lại danh sách trước khi thử lại.')
            setRefresh(value => value + 1)
        } finally {
            statusBusyRef.current = false
            setStatusBusy(false)
        }
    }

    function openRole(member: Member) {
        setRoleTarget(member)
        setRoleError('')
        setResult('')
        roleDialogRef.current?.showModal()
    }

    async function submitRole(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (roleBusyRef.current || !roleTarget || user.role !== 'ADMIN') return
        const nextRole = roleTarget.role === 'COLLABORATOR' ? 'QA' : 'COLLABORATOR'
        roleBusyRef.current = true
        setRoleBusy(true)
        setRoleError('')
        try {
            const response = await fetch(`/api/auth/users/${roleTarget.id}/role`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ role: nextRole }),
            })
            if (response.status === 401) { logout(); return }
            if (!response.ok) {
                const data: { message?: string | string[] } = await response.json().catch(() => ({}))
                const message = Array.isArray(data.message) ? data.message.join('; ') : data.message
                setRoleError(response.status >= 500 ? 'Không thể xác nhận kết quả. Hãy tải lại danh sách trước khi thử lại.' : message || 'Không thể đổi vai trò tài khoản.')
                setRefresh(value => value + 1)
                return
            }
            const changed: { id: number; role: 'COLLABORATOR' | 'QA' } = await response.json()
            setAllMembers(current => current.map(member => member.id === changed.id ? { ...member, role: changed.role } : member))
            roleDialogRef.current?.close()
            setResult(`Đã đổi vai trò của ${roleTarget.full_name} thành ${roleLabels[changed.role]}. Người dùng cần đăng nhập lại.`)
            setRefresh(value => value + 1)
        } catch {
            setRoleError('Không thể xác nhận kết quả. Hãy tải lại danh sách trước khi thử lại.')
            setRefresh(value => value + 1)
        } finally {
            roleBusyRef.current = false
            setRoleBusy(false)
        }
    }

    function openInvite() {
        setInviteError('')
        setResult('')
        dialogRef.current?.showModal()
    }
    function closeInvite() {
        if (!sendingRef.current) dialogRef.current?.close()
    }
    async function submitInvite(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (sendingRef.current || user.role !== 'ADMIN') return
        const fullName = name.trim()
        const emailAddress = email.trim()
        if (!fullName || !emailAddress) {
            setInviteError('Vui lòng nhập đầy đủ họ tên và email.')
            return
        }
        setInviteError('')
        setResult('')
        sendingRef.current = true
        setSending(true)
        try {
            const response = await fetch('/api/auth/invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ full_name: fullName, email: emailAddress, role: inviteRole }),
            })
            if (response.status === 401) { logout(); return }
            if (!response.ok) {
                const data: { message?: string | string[] } = await response.json().catch(() => ({}))
                const message = Array.isArray(data.message) ? data.message.join('; ') : data.message
                setInviteError(response.status >= 500
                    ? 'Không thể xác nhận việc gửi lời mời. Tài khoản có thể đã được tạo; hãy kiểm tra danh sách trước khi thử lại.'
                    : message || 'Không thể xác nhận lời mời. Hãy kiểm tra danh sách trước khi thử lại.')
                setRefresh(value => value + 1)
                return
            }
            setName('')
            setEmail('')
            setInviteRole('COLLABORATOR')
            dialogRef.current?.close()
            setResult('Đã tạo lời mời. Người được mời cần dùng đường dẫn kích hoạt để đặt mật khẩu.')
            setRefresh(value => value + 1)
        } catch {
            setInviteError('Không thể xác nhận kết quả. Hãy kiểm tra danh sách nhân sự trước khi thử lại.')
            setRefresh(value => value + 1)
        } finally {
            sendingRef.current = false
            setSending(false)
        }
    }

    if (user.role !== 'ADMIN') return <main className="p-8"><p role="alert" className="text-red-600">Bạn không có quyền xem trang nhân sự.</p></main>

    return (
        <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div><h1 className="page-title">Nhân sự</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Xem tài khoản và mời thành viên tham gia hệ thống số hóa tài liệu.</p></div>
                <button type="button" onClick={openInvite} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0b4ea2] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-800"><UserPlus className="size-4" />Mời nhân sự</button>
            </div>

            {result && <p role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{result}</p>}
            <section aria-label="Tìm kiếm và lọc nhân sự" className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                    <label className="relative flex-1"><span className="sr-only">Tìm theo họ tên hoặc email</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm theo họ tên hoặc email..." className={inputClass + ' pl-10'} /></label>
                    <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-500">Vai trò<select value={roleFilter} onChange={event => setRoleFilter(event.target.value)} className={inputClass}><option value="ALL">Tất cả</option><option value="ADMIN">Admin</option><option value="QA">QA</option><option value="COLLABORATOR">Cộng tác viên</option></select></label>
                    <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-500">Trạng thái<select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className={inputClass}><option value="ALL">Tất cả</option><option value="ACTIVE">Đang hoạt động</option><option value="INVITED">Chờ kích hoạt</option><option value="BLOCKED">Đã khóa</option></select></label>
                </div>
            </section>

            <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-4 sm:px-6"><h2 className="font-bold text-slate-900">Danh sách nhân sự</h2>{!loading && !loadError && <p className="mt-1 text-xs text-slate-500">{members.length} tài khoản phù hợp</p>}</div>
                {loading ? <p role="status" className="px-6 py-12 text-center text-sm text-slate-500">Đang tải danh sách nhân sự...</p> : loadError ? (
                    <div role="alert" className="px-6 py-12 text-center text-sm text-red-600"><p>{loadError}</p><button type="button" onClick={() => setRefresh(value => value + 1)} className="mt-3 font-semibold underline">Thử lại</button></div>
                ) : members.length === 0 ? (
                    <div className="flex min-h-48 flex-col items-center justify-center px-6 py-12 text-center"><Users className="size-10 text-slate-300" /><h3 className="mt-3 font-semibold text-slate-700">{allMembers.length ? 'Không tìm thấy kết quả' : 'Chưa có tài khoản nào'}</h3>{allMembers.length > 0 && <p className="mt-1 text-sm text-slate-500">Thử thay đổi từ khóa hoặc bộ lọc.</p>}</div>
                ) : (
                    <>
                        <div className="hidden overflow-x-auto md:block"><table className="w-full text-left"><thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-6 py-4">Nhân sự</th><th className="px-6 py-4">Vai trò</th><th className="px-6 py-4">Trạng thái</th><th className="px-6 py-4">Ngày tạo</th><th className="px-6 py-4">Thao tác</th></tr></thead><tbody className="divide-y divide-slate-100">{members.map(member => <tr key={member.id} className="hover:bg-slate-50/70"><td className="px-6 py-4"><span className="block text-sm font-semibold text-slate-800">{member.full_name}</span><span className="block text-xs text-slate-500">{member.email}</span></td><td className="px-6 py-4 text-sm text-slate-600">{roleLabels[member.role] || member.role}</td><td className="px-6 py-4"><StatusBadge status={member.status} /></td><td className="px-6 py-4 text-sm text-slate-500">{formatDate(member.created_at)}</td><td className="px-6 py-4"><StatusAction member={member} onSelect={openStatus} /><RoleAction member={member} onSelect={openRole} /></td></tr>)}</tbody></table></div>
                        <div className="flex flex-col gap-3 p-4 md:hidden">{members.map(member => <article key={member.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-slate-800">{member.full_name}</h3><p className="mt-0.5 break-all text-xs text-slate-500">{member.email}</p></div><StatusBadge status={member.status} /></div><div className="mt-4 flex justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500"><span>Vai trò: <strong className="text-slate-700">{roleLabels[member.role] || member.role}</strong></span><span>Tạo ngày: {formatDate(member.created_at)}</span></div><div className="mt-2"><StatusAction member={member} onSelect={openStatus} /><RoleAction member={member} onSelect={openRole} /></div></article>)}</div>
                    </>
                )}
            </section>

            <dialog ref={roleDialogRef} aria-labelledby="role-title" onCancel={event => { if (roleBusyRef.current) event.preventDefault() }} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-6 shadow-2xl backdrop:bg-slate-950/40 sm:p-7">
                {roleTarget && <form onSubmit={submitRole}>
                    <h2 id="role-title" className="text-xl font-bold text-slate-900">Đổi vai trò</h2>
                    <p className="mt-3 text-sm leading-6 text-slate-600">Chuyển <strong>{roleTarget.full_name}</strong> ({roleTarget.email}) từ <strong>{roleLabels[roleTarget.role]}</strong> sang <strong>{roleTarget.role === 'COLLABORATOR' ? 'QA' : 'Cộng tác viên'}</strong>?</p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">Người dùng cần đăng nhập lại. CTV còn việc chưa hoàn tất hoặc QA còn lô đang quản lý phải bàn giao trước khi đổi vai trò.</p>
                    {roleError && <p role="alert" className="mt-4 text-sm text-red-600">{roleError}</p>}
                    <div className="mt-6 flex flex-wrap justify-end gap-3"><button type="button" disabled={roleBusy} onClick={() => roleDialogRef.current?.close()} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">Hủy</button><button type="submit" disabled={roleBusy} className="rounded-xl bg-[#0b4ea2] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">{roleBusy ? 'Đang xử lý...' : 'Xác nhận'}</button></div>
                </form>}
            </dialog>

            <dialog ref={statusDialogRef} aria-labelledby="status-title" onCancel={event => { if (statusBusyRef.current) event.preventDefault() }} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-6 shadow-2xl backdrop:bg-slate-950/40 sm:p-7">
                {statusTarget && <form onSubmit={submitStatus}>
                    <h2 id="status-title" className="text-xl font-bold text-slate-900">{statusTarget.status === 'ACTIVE' ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}</h2>
                    <p className="mt-3 text-sm leading-6 text-slate-600">Bạn muốn {statusTarget.status === 'ACTIVE' ? 'khóa' : 'mở khóa'} tài khoản <strong>{statusTarget.full_name}</strong> ({statusTarget.email})?</p>
                    <p className="mt-2 text-sm text-slate-500">{statusTarget.status === 'ACTIVE' ? 'Cần hoàn tất hoặc bàn giao công việc trước khi khóa. Phiên hiện tại sẽ hết hiệu lực.' : 'Người dùng có thể đăng nhập lại sau khi mở khóa.'}</p>
                    {statusError && <p role="alert" className="mt-4 text-sm text-red-600">{statusError}</p>}
                    <div className="mt-6 flex flex-wrap justify-end gap-3"><button type="button" disabled={statusBusy} onClick={() => statusDialogRef.current?.close()} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">Hủy</button><button type="submit" disabled={statusBusy} className="rounded-xl bg-[#0b4ea2] px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">{statusBusy ? 'Đang xử lý...' : 'Xác nhận'}</button></div>
                </form>}
            </dialog>

            <dialog ref={dialogRef} aria-labelledby="invite-title" onCancel={event => { if (sendingRef.current) event.preventDefault() }} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-6 shadow-2xl backdrop:bg-slate-950/40 sm:p-7">
                <div className="flex items-start justify-between"><div><h2 id="invite-title" className="text-xl font-bold text-[#0b4ea2]">Mời nhân sự</h2><p className="mt-1 text-sm text-slate-500">Thêm thành viên mới vào Docuflow.</p></div><button type="button" disabled={sending} aria-label="Đóng hộp thoại" onClick={closeInvite} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-50"><X className="size-5" /></button></div>
                <form onSubmit={submitInvite} className="mt-6 flex flex-col gap-4">
                    <fieldset disabled={sending} className="flex flex-col gap-4">
                        <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">Họ và tên<input required maxLength={100} value={name} onChange={event => setName(event.target.value)} placeholder="Nhập họ và tên" className={inputClass} /></label>
                        <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">Email<input required type="email" maxLength={100} value={email} onChange={event => setEmail(event.target.value)} placeholder="ten@congty.vn" className={inputClass} /></label>
                        <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">Vai trò<select value={inviteRole} onChange={event => setInviteRole(event.target.value as 'COLLABORATOR' | 'QA')} className={inputClass}><option value="COLLABORATOR">Cộng tác viên</option><option value="QA">QA</option></select></label>
                    </fieldset>
                    <div className="rounded-xl bg-blue-50 p-3 text-sm leading-5 text-blue-800">Người được mời sẽ dùng đường dẫn kích hoạt để tự đặt mật khẩu. Admin không cần tạo mật khẩu thay.</div>
                    {inviteError && <p role="alert" className="text-sm font-medium text-red-600">{inviteError}</p>}
                    <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" disabled={sending} onClick={closeInvite} className="rounded-xl px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">Hủy</button><button type="submit" disabled={sending} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0b4ea2] px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"><Check className="size-4" />{sending ? 'Đang gửi...' : 'Gửi lời mời'}</button></div>
                </form>
            </dialog>
        </main>
    )
}
