'use client'

import { Suspense, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, CheckCircle2, FileText, LockKeyhole, TriangleAlert } from 'lucide-react'
import PasswordField from '../components/PasswordField'

function PasswordSetupForm() {
    const searchParams = useSearchParams()
    const token = searchParams.get('token')
    const [isSaving, setIsSaving] = useState(false)
    const [success, setSuccess] = useState(false)
    const [error, setError] = useState('')
    const submitting = useRef(false)

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (submitting.current) return
        const form = new FormData(event.currentTarget)
        const password = String(form.get('password') ?? '')
        const confirmation = String(form.get('confirmation') ?? '')
        setError('')
        if (!token) {
            setError('Đường dẫn xác thực không hợp lệ. Vui lòng mở lại đường dẫn trong email.')
            return
        }
        if (password.length < 6) {
            setError('Mật khẩu phải có ít nhất 6 ký tự.')
            return
        }
        if (password !== confirmation) {
            setError('Mật khẩu xác nhận không trùng khớp.')
            return
        }

        submitting.current = true
        setIsSaving(true)
        try {
            const response = await fetch('/api/auth/set-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, new_password: password }),
            })
            if (!response.ok) {
                if (response.status === 400) {
                    setError('Đường dẫn xác thực không hợp lệ hoặc đã hết hạn. Vui lòng liên hệ quản trị viên hoặc yêu cầu đặt lại mật khẩu.')
                } else {
                    setError('Không thể thiết lập mật khẩu. Vui lòng thử lại sau.')
                }
                return
            }
            setSuccess(true)
        } catch {
            setError('Không thể kết nối đến máy chủ. Hãy kiểm tra kết nối và thử lại.')
        } finally {
            submitting.current = false
            setIsSaving(false)
        }
    }

    return (
        <main className="min-h-screen bg-[#f5f8fc] px-4 py-8 text-slate-900 sm:px-6 sm:py-12">
            <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[480px] flex-col items-center justify-center sm:min-h-[calc(100vh-6rem)]">
                <Link href="/login" className="mb-7 flex items-center gap-3" aria-label="Docuflow - đăng nhập">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-[#0b4ea2] shadow-[0_8px_20px_rgba(13,91,225,0.22)]"><FileText className="size-5 text-white" aria-hidden="true" /></span>
                    <span className="text-[22px] font-bold tracking-[-0.04em] text-[#0b4ea2]">Docuflow</span>
                </Link>
                <section className="w-full rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_18px_60px_rgba(35,67,110,0.08)] sm:p-9">
                    {success ? (
                        <div role="status" className="flex flex-col items-center text-center">
                            <span className="mb-5 flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="size-7" aria-hidden="true" /></span>
                            <h1 className="page-title">Mật khẩu đã được thiết lập</h1>
                            <p className="mt-3 max-w-sm text-sm leading-6 text-slate-500">Bạn có thể sử dụng mật khẩu mới để đăng nhập vào Docuflow.</p>
                            <Link href="/login" className="mt-7 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#0b4ea2] px-5 text-sm font-semibold text-white transition hover:bg-blue-800">Đến trang đăng nhập</Link>
                        </div>
                    ) : (
                        <>
                            <div className="mb-7">
                                <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-blue-50 text-[#0b4ea2]"><LockKeyhole className="size-5" aria-hidden="true" /></div>
                                <h1 className="page-title">Thiết lập mật khẩu</h1>
                                <p className="mt-2 text-sm leading-6 text-slate-500">Đặt mật khẩu để sử dụng tài khoản Docuflow của bạn.</p>
                            </div>
                            {!token && <p role="alert" className="mb-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">Đường dẫn xác thực không hợp lệ. Vui lòng mở lại đường dẫn trong email.</p>}
                            <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
                                <fieldset disabled={isSaving || !token} className="flex flex-col gap-5">
                                    <PasswordField id="password" label="Mật khẩu mới" placeholder="Nhập mật khẩu mới" description="Tối thiểu 6 ký tự." minLength={6} />
                                    <PasswordField id="confirmation" label="Xác nhận mật khẩu" placeholder="Nhập lại mật khẩu mới" />
                                </fieldset>
                                {error && <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm leading-5 text-red-700"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{error}</span></div>}
                                <button type="submit" disabled={isSaving || !token} className="flex h-12 w-full items-center justify-center rounded-xl bg-[#0b4ea2] px-5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">{isSaving ? 'Đang lưu...' : 'Lưu mật khẩu'}</button>
                            </form>
                            <div className="mt-7 flex items-center justify-center border-t border-slate-100 pt-6"><Link href="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-[#0b4ea2] hover:text-blue-800"><ArrowLeft className="size-4" aria-hidden="true" />Quay lại đăng nhập</Link></div>
                        </>
                    )}
                </section>
                <p className="mt-6 text-center text-xs text-slate-400">Docuflow · Hệ thống số hóa tài liệu</p>
            </div>
        </main>
    )
}

export default function PasswordSetupPage() {
    return <Suspense fallback={<main className="min-h-screen bg-[#f5f8fc] p-8 text-slate-600">Đang tải...</main>}><PasswordSetupForm /></Suspense>
}
