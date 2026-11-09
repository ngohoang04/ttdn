'use client'

import { useState, type FormEvent } from 'react'
import { ArrowRight, FileText, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function Page() {
    const [showPassword, setShowPassword] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const router = useRouter()
    async function handleLogin(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        setError('')
        setSuccess('')
        setIsLoading(true)

        const formData = new FormData(event.currentTarget)

        const email = String(formData.get('email') ?? '').trim()
        const password = String(formData.get('password') ?? '')

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            })

            const data = await response.json()

            if (!response.ok) {
                setError(data.message || 'Đăng nhập thất bại. Vui lòng thử lại.')
                return
            }

            // Tạm lưu token trong phiên trình duyệt để dùng ở các bước tiếp theo.
            sessionStorage.setItem('access_token', data.access_token)

            router.replace('/dashboard')
        } catch {
            setError('Không thể kết nối đến máy chủ. Hãy kiểm tra backend.')
        } finally {
            setIsLoading(false)
        }
    }
    return (
        <main className="relative flex min-h-screen overflow-hidden bg-[#f4f8fc] text-slate-950">
            <div className="pointer-events-none absolute -left-28 -top-28 size-72 rounded-full bg-blue-100/60 blur-3xl" aria-hidden="true" />
            <div className="pointer-events-none absolute -bottom-36 -right-24 size-96 rounded-full bg-sky-100/70 blur-3xl" aria-hidden="true" />

            <section className="relative hidden w-[47%] flex-col justify-between overflow-hidden bg-[#0b4ea2] px-12 py-10 text-white lg:flex xl:px-20">
                <div className="absolute inset-0 opacity-25" aria-hidden="true">
                    <div className="absolute -right-36 top-20 size-[31rem] rounded-full border border-white/30" />
                    <div className="absolute -right-20 top-36 size-[24rem] rounded-full border border-white/20" />
                    <div className="absolute -bottom-48 -left-40 size-[34rem] rounded-full border border-white/20" />
                </div>
                <div className="relative flex items-center gap-3">
                    <div className="flex size-11 items-center justify-center rounded-xl bg-white text-[#0b4ea2] shadow-lg shadow-blue-950/20">
                        <FileText className="size-6" aria-hidden="true" />
                    </div>
                    <div>
                        <p className="text-[15px] font-semibold tracking-wide">DOCU<span className="text-blue-200">FLOW</span></p>
                        <p className="text-[10px] uppercase tracking-[0.25em] text-blue-200">Digital workspace</p>
                    </div>
                </div>

                <div className="relative max-w-lg pb-12">
                    
                    <h1 className="text-4xl font-semibold leading-[1.12] tracking-tight xl:text-5xl">Quản lý tài liệu<br />thông minh hơn.</h1>
                    <p className="mt-6 max-w-md text-[15px] leading-7 text-blue-100">Tập trung, bảo mật và tối ưu mọi quy trình số hóa tài liệu của doanh nghiệp bạn.</p>
                    <div className="mt-9 flex items-center gap-3 text-sm text-blue-100">
                        <ShieldCheck className="size-5 text-blue-200" aria-hidden="true" />
                        <span>Bảo mật theo tiêu chuẩn doanh nghiệp</span>
                    </div>
                </div>
                <p className="relative text-xs text-blue-200">© 2024 Docuflow. All rights reserved.</p>
            </section>

            <section className="relative flex flex-1 items-center justify-center px-5 py-10 sm:px-10">
                <div className="w-full max-w-[440px]">
                    <div className="mb-8 flex items-center gap-3 lg:hidden">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-[#0b4ea2] text-white">
                            <FileText className="size-5" aria-hidden="true" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold tracking-wide">DOCU<span className="text-[#0b4ea2]">FLOW</span></p>
                            <p className="text-[9px] uppercase tracking-[0.22em] text-slate-500">Digital workspace</p>
                        </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-7 shadow-[0_18px_55px_-24px_rgba(15,55,100,0.28)] sm:p-10">
                        <div className="mb-8">
                            
                            <h2 className="page-title">Đăng nhập tài khoản</h2>
                            <p className="mt-2 text-sm leading-6 text-slate-500">Truy cập không gian quản lý tài liệu của bạn.</p>
                        </div>

                        <form className="flex flex-col gap-5" onSubmit={handleLogin}>
                            <div className="flex flex-col gap-2">
                                <label htmlFor="email" className="text-sm font-medium text-slate-700">Địa chỉ email</label>
                                <div className="relative">
                                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                    <input id="email" name="email" type="email" autoComplete="email" placeholder="ten@doanhnghiep.com" required className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50/60 pl-11 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10" />
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <label htmlFor="password" className="text-sm font-medium text-slate-700">Mật khẩu</label>
                                    <a href="#quen-mat-khau" className="text-xs font-semibold text-[#0b4ea2] transition hover:text-blue-700 hover:underline">Quên mật khẩu?</a>
                                </div>
                                <div className="relative">
                                    <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-slate-400" aria-hidden="true" />
                                    <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Nhập mật khẩu" required className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50/60 pl-11 pr-24 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10" />
                                    <button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded px-1 text-xs font-semibold text-slate-500 hover:text-[#0b4ea2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiển thị mật khẩu'}>{showPassword ? 'Ẩn' : 'Hiện'}</button>
                                </div>
                            </div>
                            {error && (
                                <p role="alert" className="text-sm text-red-600">
                                    {error}
                                </p>
                            )}

                            {success && (
                                <p role="status" className="text-sm text-green-600">
                                    {success}
                                </p>
                            )}
                            <button type="submit" className="group mt-2 flex h-12 items-center justify-center gap-2 rounded-lg bg-[#0b4ea2] text-sm font-semibold text-white shadow-lg shadow-blue-900/15 transition hover:bg-[#083f86] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/25 active:translate-y-px">{isLoading ? 'Đang đăng nhập...' : 'Đăng nhập'}<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></button>
                        </form>
                    </div>
                    <p className="mt-7 text-center text-xs text-slate-400">Nếu cần hỗ trợ, vui lòng liên hệ quản trị viên hệ thống.</p>
                </div>
            </section>
        </main>
    )
}
