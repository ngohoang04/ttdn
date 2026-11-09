'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
    AlertCircle,
    ArrowLeft,
    CheckCircle2,
    Eye,
    EyeOff,
    KeyRound,
    LoaderCircle,
    Save,
    ShieldCheck,
} from 'lucide-react'
import { useWorkspace } from '@/app/components/WorkspaceShell'

// ─── PasswordField ────────────────────────────────────────────────────────────
function PasswordField({
    id,
    label,
    value,
    visible,
    error,
    autoComplete,
    placeholder,
    disabled,
    onChange,
    onToggle,
}: {
    id: string
    label: string
    value: string
    visible: boolean
    error?: string
    autoComplete: string
    placeholder: string
    disabled: boolean
    onChange: (value: string) => void
    onToggle: () => void
}) {
    return (
        <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor={id}>
                {label} <span className="text-red-500">*</span>
            </label>
            <div className="relative">
                <input
                    aria-invalid={Boolean(error)}
                    autoComplete={autoComplete}
                    className={`h-12 w-full rounded-xl border bg-white px-4 pr-12 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-4 ${
                        error
                            ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
                            : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100'
                    }`}
                    disabled={disabled}
                    id={id}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    type={visible ? 'text' : 'password'}
                    value={value}
                />
                <button
                    aria-label={visible ? `Ẩn ${label.toLowerCase()}` : `Hiện ${label.toLowerCase()}`}
                    className="absolute right-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:pointer-events-none"
                    disabled={disabled}
                    onClick={onToggle}
                    type="button"
                >
                    {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                </button>
            </div>
            {error && (
                <p className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-red-600" role="alert">
                    <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                    {error}
                </p>
            )}
        </div>
    )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ChangePasswordPage() {
    const { token, logout } = useWorkspace()
    const router = useRouter()
    const submitting = useRef(false)

    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [visible, setVisible] = useState({ current: false, next: false, confirm: false })
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
    const [submitError, setSubmitError] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [success, setSuccess] = useState(false)
    const [countdown, setCountdown] = useState(3)

    // Đếm ngược và logout sau khi đổi thành công
    useEffect(() => {
        if (!success) return
        if (countdown <= 0) { logout(); return }
        const timer = window.setTimeout(() => setCountdown((n) => n - 1), 1000)
        return () => clearTimeout(timer)
    }, [success, countdown, logout])

    const passwordChecks = [
        { label: 'Ít nhất 6 ký tự', passed: newPassword.length >= 6 },
        { label: 'Có chữ hoa và chữ thường', passed: /[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword) },
        { label: 'Có ít nhất một chữ số', passed: /\d/.test(newPassword) },
    ]

    function clearFieldError(field: string) {
        setFieldErrors((prev) => ({ ...prev, [field]: '' }))
        setSubmitError('')
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (submitting.current) return

        const errors: Record<string, string> = {}
        if (!currentPassword) errors.current = 'Vui lòng nhập mật khẩu hiện tại.'
        if (!newPassword) {
            errors.next = 'Vui lòng nhập mật khẩu mới.'
        } else if (newPassword.length < 6) {
            errors.next = 'Mật khẩu mới phải từ 6 ký tự trở lên.'
        } else if (newPassword === currentPassword) {
            errors.next = 'Mật khẩu mới phải khác mật khẩu hiện tại.'
        }
        if (!confirmPassword) {
            errors.confirm = 'Vui lòng nhập lại mật khẩu mới.'
        } else if (confirmPassword !== newPassword) {
            errors.confirm = 'Mật khẩu nhập lại không khớp.'
        }

        setFieldErrors(errors)
        if (Object.keys(errors).length > 0) return

        submitting.current = true
        setIsSaving(true)
        setSubmitError('')

        try {
            const response = await fetch('/api/auth/change-password', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    current_password: currentPassword,
                    new_password: newPassword,
                }),
            })

            if (response.status === 401) { logout(); return }

            const data: { message?: string | string[] } = await response.json().catch(() => ({}))

            if (!response.ok) {
                const message = Array.isArray(data.message) ? data.message.join('; ') : data.message
                setSubmitError(message || 'Không thể đổi mật khẩu. Vui lòng thử lại.')
                return
            }

            // Đổi thành công → reset form, hiện đếm ngược
            setCurrentPassword('')
            setNewPassword('')
            setConfirmPassword('')
            setFieldErrors({})
            setSuccess(true)
        } catch {
            setSubmitError('Không thể kết nối đến máy chủ. Hãy kiểm tra backend.')
        } finally {
            submitting.current = false
            setIsSaving(false)
        }
    }

    return (
        <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
            {/* Breadcrumb / back */}
            <button
                className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 transition hover:text-blue-900"
                onClick={() => router.back()}
                type="button"
            >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Quay lại
            </button>

            {/* Tiêu đề */}
            <div className="mt-6">
                <h1 className="page-title">Đổi mật khẩu</h1>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                    Cập nhật mật khẩu định kỳ để bảo vệ tài khoản Docuflow của bạn.
                </p>
            </div>

            {/* Thành công */}
            {success ? (
                <div className="mt-8 flex flex-col items-center rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-12 text-center shadow-sm">
                    <span className="flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                        <CheckCircle2 className="size-7" aria-hidden="true" />
                    </span>
                    <h2 className="mt-4 text-xl font-bold text-slate-900">Đổi mật khẩu thành công!</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                        Bạn sẽ được đăng xuất sau{' '}
                        <span className="font-bold text-[#0b4ea2]">{countdown}</span> giây để đăng nhập lại bằng mật khẩu mới.
                    </p>
                </div>
            ) : (
                <div className="mt-8 grid items-start gap-6 xl:grid-cols-[1fr_320px]">
                    {/* Form card */}
                    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-4">
                            <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-[#0b4ea2]">
                                <KeyRound className="size-5" aria-hidden="true" />
                            </div>
                            <div>
                                <h2 className="font-bold text-slate-900">Thông tin mật khẩu</h2>
                                <p className="mt-0.5 text-xs text-slate-500">Tất cả các trường đều bắt buộc.</p>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} noValidate>
                            <fieldset disabled={isSaving} className="space-y-5 p-6">
                                <PasswordField
                                    autoComplete="current-password"
                                    disabled={isSaving}
                                    error={fieldErrors.current}
                                    id="current-password"
                                    label="Mật khẩu hiện tại"
                                    onChange={(v) => { setCurrentPassword(v); clearFieldError('current') }}
                                    onToggle={() => setVisible((s) => ({ ...s, current: !s.current }))}
                                    placeholder="Nhập mật khẩu hiện tại"
                                    value={currentPassword}
                                    visible={visible.current}
                                />

                                <div className="border-t border-slate-100 pt-5">
                                    <PasswordField
                                        autoComplete="new-password"
                                        disabled={isSaving}
                                        error={fieldErrors.next}
                                        id="new-password"
                                        label="Mật khẩu mới"
                                        onChange={(v) => { setNewPassword(v); clearFieldError('next') }}
                                        onToggle={() => setVisible((s) => ({ ...s, next: !s.next }))}
                                        placeholder="Nhập mật khẩu mới"
                                        value={newPassword}
                                        visible={visible.next}
                                    />
                                </div>

                                <PasswordField
                                    autoComplete="new-password"
                                    disabled={isSaving}
                                    error={fieldErrors.confirm}
                                    id="confirm-password"
                                    label="Nhập lại mật khẩu mới"
                                    onChange={(v) => { setConfirmPassword(v); clearFieldError('confirm') }}
                                    onToggle={() => setVisible((s) => ({ ...s, confirm: !s.confirm }))}
                                    placeholder="Nhập lại mật khẩu mới"
                                    value={confirmPassword}
                                    visible={visible.confirm}
                                />
                            </fieldset>

                            <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-5">
                                {submitError && (
                                    <div
                                        className="mb-4 flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm leading-5 text-red-700"
                                        role="alert"
                                    >
                                        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                                        {submitError}
                                    </div>
                                )}
                                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                                    <button
                                        className="rounded-xl px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                                        onClick={() => router.back()}
                                        type="button"
                                    >
                                        Hủy
                                    </button>
                                    <button
                                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0b4ea2] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/10 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                                        disabled={isSaving}
                                        type="submit"
                                    >
                                        {isSaving ? (
                                            <>
                                                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                                                Đang cập nhật...
                                            </>
                                        ) : (
                                            <>
                                                <Save className="size-4" aria-hidden="true" />
                                                Lưu thay đổi
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </section>

                    {/* Sidebar yêu cầu bảo mật */}
                    <aside className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                        <div className="flex size-10 items-center justify-center rounded-xl bg-white text-[#0b4ea2] shadow-sm">
                            <ShieldCheck className="size-5" aria-hidden="true" />
                        </div>
                        <h2 className="mt-4 font-bold text-blue-950">Yêu cầu bảo mật</h2>
                        <p className="mt-1 text-sm leading-6 text-blue-800">
                            Mật khẩu mới nên đáp ứng các điều kiện sau:
                        </p>
                        <ul className="mt-4 space-y-3">
                            {passwordChecks.map((check) => (
                                <li className="flex items-center gap-2.5 text-sm text-blue-900" key={check.label}>
                                    <span
                                        className={`flex size-5 shrink-0 items-center justify-center rounded-full transition ${
                                            check.passed ? 'bg-emerald-500 text-white' : 'bg-white text-slate-300'
                                        }`}
                                    >
                                        <CheckCircle2 className="size-3.5" aria-hidden="true" />
                                    </span>
                                    <span className={check.passed ? 'font-semibold' : ''}>{check.label}</span>
                                </li>
                            ))}
                        </ul>
                        <div className="mt-5 border-t border-blue-200 pt-4">
                            <p className="text-xs leading-5 text-blue-700">
                                Không chia sẻ mật khẩu với bất kỳ ai và không dùng lại mật khẩu từ các dịch vụ khác.
                            </p>
                        </div>
                    </aside>
                </div>
            )}
        </main>
    )
}
