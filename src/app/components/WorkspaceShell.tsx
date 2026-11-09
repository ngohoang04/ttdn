'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { BriefcaseBusiness, FileArchive, FileCheck2, FileText, KeyRound, LayoutDashboard, LogOut, Menu, Users, X } from 'lucide-react'

export type Role = 'ADMIN' | 'QA' | 'COLLABORATOR'
export type User = { id: number; full_name: string; email: string; role: Role }
type Auth = { user: User; token: string; logout: () => void }
const AuthContext = createContext<Auth | null>(null)

export function useWorkspace() {
    const context = useContext(AuthContext)
    if (!context) throw new Error('Workspace context is unavailable')
    return context
}

const roleLabels: Record<Role, string> = {
    ADMIN: 'Quản trị viên',
    QA: 'Kiểm duyệt viên',
    COLLABORATOR: 'Cộng tác viên',
}

const menus = {
    ADMIN: [
        { label: 'Tổng quan', icon: LayoutDashboard, href: '/dashboard' },
        { label: 'Lô tài liệu', icon: FileArchive, href: '/batches' },
        { label: 'Công việc', icon: BriefcaseBusiness, href: '/tasks' },
        { label: 'Nhân sự', icon: Users, href: '/users' },
        { label: 'Lịch sử duyệt', icon: FileCheck2, href: '/reviews/history' },
        { label: 'Đổi mật khẩu', icon: KeyRound, href: '/change-password' },
    ],
    QA: [
        { label: 'Tổng quan', icon: LayoutDashboard, href: '/dashboard' },
        { label: 'Lô tài liệu', icon: FileArchive, href: '/batches' },
        { label: 'Công việc', icon: BriefcaseBusiness, href: '/tasks' },
        { label: 'Lịch sử duyệt', icon: FileCheck2, href: '/reviews/history' },
        { label: 'Đổi mật khẩu', icon: KeyRound, href: '/change-password' },
    ],
    COLLABORATOR: [
        { label: 'Tổng quan', icon: LayoutDashboard, href: '/dashboard' },
        { label: 'Lô tài liệu', icon: FileArchive, href: '/batches' },
        { label: 'Công việc của tôi', icon: BriefcaseBusiness, href: '/tasks' },
        { label: 'Đổi mật khẩu', icon: KeyRound, href: '/change-password' },
    ],
} satisfies Record<Role, { label: string; icon: typeof LayoutDashboard; href?: string }[]>

export default function WorkspaceShell({ children }: { children: ReactNode }) {
    const router = useRouter()
    const pathname = usePathname()
    const [user, setUser] = useState<User | null>(null)
    const [token, setToken] = useState('')
    const [error, setError] = useState('')
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const logout = useCallback(() => {
        sessionStorage.removeItem('access_token')
        setUser(null)
        setToken('')
        router.replace('/login')
    }, [router])

    useEffect(() => {
        const storedToken = sessionStorage.getItem('access_token')
        if (!storedToken) {
            router.replace('/login')
            return
        }
        const controller = new AbortController()
        async function loadUser() {
            try {
                const response = await fetch('/api/auth/me', {
                    headers: { Authorization: `Bearer ${storedToken}` },
                    signal: controller.signal,
                })
                if (response.status === 401) {
                    logout()
                    return
                }
                if (!response.ok) throw new Error('Không thể lấy thông tin tài khoản')
                const data: User = await response.json()
                if (!Object.hasOwn(roleLabels, data.role)) throw new Error('Vai trò tài khoản không hợp lệ')
                if (!controller.signal.aborted) {
                    setUser(data)
                    setToken(storedToken!)
                }
            } catch {
                if (!controller.signal.aborted) setError('Không thể tải thông tin tài khoản. Hãy kiểm tra backend và tải lại trang.')
            }
        }
        loadUser()
        return () => controller.abort()
    }, [logout, router])

    const menuItems: { label: string; icon: typeof LayoutDashboard; href?: string }[] = user ? menus[user.role] : []

    return (
        <div className="min-h-screen bg-[#f5f8fc] text-slate-900">
            {sidebarOpen && <button type="button" className="fixed inset-0 z-20 bg-slate-950/30 lg:hidden" aria-label="Đóng menu" onClick={() => setSidebarOpen(false)} />}
            <aside className={`fixed inset-y-0 left-0 z-30 flex w-[260px] flex-col bg-[#0b4ea2] px-5 py-6 text-white transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-white text-[#0b4ea2]"><FileText className="size-5" aria-hidden="true" /></div>
                        <div><p className="text-[15px] font-semibold tracking-wide">DOCU<span className="text-blue-200">FLOW</span></p><p className="text-[9px] uppercase tracking-[0.24em] text-blue-200">Digital workspace</p></div>
                    </div>
                    <button type="button" className="rounded-lg p-2 text-blue-100 hover:bg-white/10 lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Đóng menu"><X className="size-5" /></button>
                </div>
                <div className="mt-12">
                    <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-200">Không gian làm việc</p>
                    <nav className="flex flex-col gap-1">
                        {menuItems.map(({ label, icon: Icon, href }) => {
                            const active = href && (pathname === href || pathname.startsWith(href + '/') || (href === '/tasks' && pathname === '/reviews/report'))
                            const classes = `flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${active ? 'bg-white text-[#0b4ea2] shadow-sm' : 'text-blue-100 hover:bg-white/10'}`
                            return href ? (
                                <Link key={label} href={href} className={classes} onClick={() => setSidebarOpen(false)} aria-current={active ? 'page' : undefined}><Icon className="size-[18px]" aria-hidden="true" />{label}</Link>
                            ) : (
                                <span key={label} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-blue-200/70" title="Chức năng chưa được kết nối"><Icon className="size-[18px]" aria-hidden="true" />{label}</span>
                            )
                        })}
                    </nav>
                </div>
                {user && <button type="button" onClick={logout} className="mt-auto flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-blue-100 hover:bg-white/10"><LogOut className="size-[18px]" />Đăng xuất</button>}
            </aside>
            <div className="min-h-screen lg:pl-[260px]">
                <header className="flex h-[76px] items-center justify-between border-b border-slate-200 bg-white px-5 sm:px-8 lg:px-10">
                    <button type="button" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Mở menu"><Menu className="size-5" /></button>
                    <p className="hidden text-sm text-slate-500 lg:block">{pathname.startsWith('/batches') ? 'Lô tài liệu' : pathname.startsWith('/tasks') ? (user?.role === 'COLLABORATOR' ? 'Công việc của tôi' : 'Công việc') : pathname.startsWith('/users') ? 'Nhân sự' : pathname === '/reviews/report' ? 'Báo cáo duyệt' : pathname === '/reviews/history' ? 'Lịch sử duyệt' : pathname === '/change-password' ? 'Đổi mật khẩu' : 'Tổng quan'}</p>
                    {user && <div className="ml-auto flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-[#0b4ea2]">{user.full_name.charAt(0).toUpperCase()}</div><div className="text-right"><p className="text-sm font-semibold text-slate-800">{user.full_name}</p><p className="text-xs text-slate-500">{roleLabels[user.role]}</p></div></div>}
                </header>
                {error ? <p role="alert" className="p-8 text-red-600">{error}</p> : user && token ? (
                    <AuthContext.Provider value={{ user, token, logout }}>{children}</AuthContext.Provider>
                ) : <p className="p-8 text-slate-600">Đang tải thông tin tài khoản...</p>}
            </div>
        </div>
    )
}
