'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useWorkspace } from './WorkspaceShell'
import {
    Archive,
    Plus,
    Search,
} from 'lucide-react'

type Role = 'ADMIN' | 'QA' | 'COLLABORATOR'
export type Batch = {
    id: number
    batch_code: string
    name: string
    description: string | null
    created_at: string
}

const roles: Record<Role, { label: string; shortLabel: string; subtitle: string }> = {
    ADMIN: { label: 'Quản trị viên', shortLabel: 'ADMIN', subtitle: 'Tất cả lô tài liệu trong hệ thống' },
    QA: { label: 'Kiểm duyệt viên', shortLabel: 'QA', subtitle: 'Các lô tài liệu do bạn tạo' },
    COLLABORATOR: { label: 'Cộng tác viên', shortLabel: 'COLLABORATOR', subtitle: 'Các lô có công việc được giao cho bạn' },
}

type BatchesViewProps = {
    batches: Batch[]
    isLoading: boolean
    error: string
}

function App({ batches, isLoading, error }: BatchesViewProps) {
    const { user } = useWorkspace()
    const role = user.role
    const [query, setQuery] = useState('')
    const roleInfo = roles[role]

    const visibleBatches = useMemo(() => {
        const normalized = query.trim().toLowerCase()
        if (!normalized) return batches
        return batches.filter((batch) =>
            `${batch.batch_code} ${batch.name}`.toLowerCase().includes(normalized)
        )
    }, [query, batches])

    return (
        <>
                <main className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 sm:py-9 lg:px-10">
                    <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><h1 className="page-title">Lô tài liệu</h1><p className="mt-2 text-sm text-slate-500">{roleInfo.subtitle}</p></div>{(role === 'ADMIN' || role === 'QA') && <Link href="/batches/new" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0b4ea2] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/10 transition hover:bg-blue-800"><Plus className="size-4" />Tạo lô tài liệu</Link>}</div>
                    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><label className="relative block w-full sm:max-w-md"><span className="sr-only">Tìm theo mã hoặc tên lô</span><Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo mã hoặc tên lô..." className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" /></label></div>
                    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        {isLoading ? <p role="status" className="px-6 py-16 text-center text-sm text-slate-500">Đang tải dữ liệu...</p> : error ? <p role="alert" className="px-6 py-16 text-center text-sm text-red-600">{error}</p> : visibleBatches.length === 0 ? (
                            <div className="px-6 py-16 text-center">
                                <Archive className="mx-auto size-10 text-slate-300" />
                                <p className="mt-4 font-semibold text-slate-700">
                                    {batches.length === 0 ? 'Chưa có lô tài liệu nào' : 'Không tìm thấy kết quả'}
                                </p>
                                {batches.length > 0 && <p className="mt-1 text-sm text-slate-400">Thử tìm bằng mã hoặc tên lô khác.</p>}
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {visibleBatches.map(batch => (
                                    <article key={batch.id} className="flex flex-col gap-2 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <p className="text-sm font-bold text-blue-700">{batch.batch_code}</p>
                                            <h2 className="mt-1 font-semibold text-slate-800">{batch.name}</h2>
                                            <p className="mt-1 text-sm text-slate-500">{batch.description || 'Không có mô tả'}</p>
                                        </div>
                                        <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                                            <p className="text-sm text-slate-500">Ngày tạo: {new Date(batch.created_at).toLocaleDateString('vi-VN')}</p>
                                            <Link href={`/batches/${batch.id}`} aria-label={`Xem chi tiết lô ${batch.name}`} className="text-sm font-semibold text-blue-700 hover:underline">Xem chi tiết</Link>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>
                </main>
        </>
    )
}

export default App
