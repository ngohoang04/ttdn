'use client'

import { useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { useWorkspace } from '@/app/components/WorkspaceShell'

type FieldType = 'text' | 'number' | 'date' | 'textarea'
type Field = {
    id: number
    key: string
    label: string
    type: FieldType
    required: boolean
}

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100'
const labelClass = 'mb-2 block text-sm font-semibold text-slate-700'

export default function CreateBatchPage() {
    const { user, token, logout } = useWorkspace()
    const router = useRouter()
    const nextId = useRef(2)
    const submitting = useRef(false)
    const [batchCode, setBatchCode] = useState('')
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [unitPrice, setUnitPrice] = useState('')
    const [fields, setFields] = useState<Field[]>([
        { id: 1, key: '', label: '', type: 'text', required: true },
    ])
    const [error, setError] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    function updateField(id: number, changes: Partial<Omit<Field, 'id'>>) {
        setFields(current => current.map(field => field.id === id ? { ...field, ...changes } : field))
    }

    function addField() {
        const id = nextId.current++
        setFields(current => [...current, { id, key: '', label: '', type: 'text', required: true }])
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (submitting.current) return
        setError('')

        const code = batchCode.trim()
        const batchName = name.trim()
        const schema = fields.map(field => ({
            key: field.key.trim(),
            label: field.label.trim(),
            type: field.type,
            required: field.required,
        }))

        if (!code || !batchName) {
            setError('Vui lòng nhập mã lô và tên lô.')
            return
        }
        if (schema.some(field => !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(field.key) || !field.label)) {
            setError('Mỗi trường cần tên hiển thị và mã bắt đầu bằng chữ, chỉ gồm chữ không dấu, số hoặc dấu gạch dưới.')
            return
        }
        if (new Set(schema.map(field => field.key)).size !== schema.length) {
            setError('Mã các trường nhập liệu không được trùng nhau.')
            return
        }
        const price = unitPrice === '' ? undefined : Number(unitPrice)
        if (price !== undefined && (!Number.isFinite(price) || price < 0 || price > 99999999.99)) {
            setError('Đơn giá phải từ 0 đến 99.999.999,99.')
            return
        }

        submitting.current = true
        setIsSubmitting(true)
        try {
            const response = await fetch('/api/batches', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    batch_code: code,
                    name: batchName,
                    description: description.trim(),
                    schema_config: schema,
                    ...(price === undefined ? {} : { unit_price: price }),
                }),
            })
            if (response.status === 401) {
                logout()
                return
            }
            if (!response.ok) {
                const data: { message?: string | string[] } = await response.json().catch(() => ({}))
                const message = Array.isArray(data.message) ? data.message.join('; ') : data.message
                setError(message || 'Không thể tạo lô tài liệu. Vui lòng thử lại.')
                return
            }
            router.replace('/batches')
        } catch {
            setError('Không thể kết nối đến máy chủ. Hãy kiểm tra backend và thử lại.')
        } finally {
            submitting.current = false
            setIsSubmitting(false)
        }
    }

    if (user.role !== 'ADMIN' && user.role !== 'QA') {
        return (
            <main className="p-8">
                <p className="text-red-600">Bạn không có quyền tạo lô tài liệu.</p>
                <Link href="/batches" className="mt-4 inline-block text-blue-700 hover:underline">
                    ← Quay lại danh sách lô
                </Link>
            </main>
        )
    }

    return (
        <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
            <Link href="/batches" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 transition hover:text-blue-900">
                <ArrowLeft className="size-4" aria-hidden="true" />
                Quay lại danh sách lô
            </Link>
            <h1 className="mt-6 page-title">Tạo lô tài liệu</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Tạo một lô tài liệu mới và cấu hình các trường thông tin cộng tác viên cần nhập khi xử lý.</p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                <fieldset disabled={isSubmitting} className="space-y-6">
                    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                        <div className="border-b border-slate-100 pb-5">
                            <h2 className="text-lg font-bold text-slate-900">Thông tin lô</h2>
                            <p className="mt-1 text-sm text-slate-500">Nhập các thông tin cơ bản để nhận diện lô tài liệu.</p>
                        </div>
                        <div className="grid gap-5 pt-6 md:grid-cols-2">
                            <div>
                                <label htmlFor="batch-code" className={labelClass}>Mã lô <span className="text-red-600">*</span></label>
                                <input id="batch-code" className={inputClass} required maxLength={50} value={batchCode} onChange={event => setBatchCode(event.target.value)} placeholder="Ví dụ: LO-001" />
                            </div>
                            <div>
                                <label htmlFor="batch-name" className={labelClass}>Tên lô <span className="text-red-600">*</span></label>
                                <input id="batch-name" className={inputClass} required maxLength={200} value={name} onChange={event => setName(event.target.value)} placeholder="Ví dụ: Hồ sơ nhân sự" />
                            </div>
                            <div className="md:col-span-2">
                                <label htmlFor="batch-description" className={labelClass}>Mô tả <span className="font-normal text-slate-400">(không bắt buộc)</span></label>
                                <textarea id="batch-description" className={inputClass + ' resize-y'} rows={4} value={description} onChange={event => setDescription(event.target.value)} placeholder="Mô tả ngắn về lô tài liệu" />
                            </div>
                            <div>
                                <label htmlFor="batch-price" className={labelClass}>Đơn giá <span className="font-normal text-slate-400">(không bắt buộc)</span></label>
                                <input id="batch-price" className={inputClass} type="number" min="0" max="99999999.99" step="0.01" value={unitPrice} onChange={event => setUnitPrice(event.target.value)} placeholder="Ví dụ: 5000" />
                                <p className="mt-1 text-xs text-slate-500">Không bắt buộc; để trống để dùng giá mặc định.</p>
                            </div>
                        </div>
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
                            <div>
                                <h2 className="text-lg font-bold text-slate-900">Các trường nhập liệu</h2>
                                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Đây là các thông tin cộng tác viên sẽ nhập khi xử lý tài liệu trong lô.</p>
                            </div>
                            <button type="button" onClick={addField} className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50">
                                <Plus className="size-4" /> Thêm trường
                            </button>
                        </div>

                        <div className="mt-5 space-y-4">
                            {fields.map((field, index) => (
                                <div key={field.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
                                    <div className="mb-4 flex items-center justify-between gap-3">
                                        <h3 className="font-medium text-slate-800">Trường {index + 1}</h3>
                                        <button type="button" disabled={fields.length === 1} onClick={() => setFields(current => current.filter(item => item.id !== field.id))} aria-label={`Xóa trường ${index + 1}`} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40">
                                            <Trash2 className="size-4" /> Xóa
                                        </button>
                                    </div>
                                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                        <div>
                                            <label htmlFor={`field-key-${field.id}`} className={labelClass}>Mã trường <span className="text-red-600">*</span></label>
                                            <input id={`field-key-${field.id}`} className={inputClass} required pattern="[A-Za-z][A-Za-z0-9_]*" title="Bắt đầu bằng chữ; chỉ dùng chữ không dấu, số và dấu gạch dưới." value={field.key} onChange={event => updateField(field.id, { key: event.target.value })} placeholder="Ví dụ: ho_ten" />
                                        </div>
                                        <div>
                                            <label htmlFor={`field-label-${field.id}`} className={labelClass}>Tên hiển thị <span className="text-red-600">*</span></label>
                                            <input id={`field-label-${field.id}`} className={inputClass} required value={field.label} onChange={event => updateField(field.id, { label: event.target.value })} placeholder="Ví dụ: Họ và tên" />
                                        </div>
                                        <div>
                                            <label htmlFor={`field-type-${field.id}`} className={labelClass}>Kiểu dữ liệu</label>
                                            <select id={`field-type-${field.id}`} className={inputClass} value={field.type} onChange={event => updateField(field.id, { type: event.target.value as FieldType })}>
                                                <option value="text">Văn bản ngắn</option>
                                                <option value="number">Số</option>
                                                <option value="date">Ngày</option>
                                                <option value="textarea">Văn bản dài</option>
                                            </select>
                                        </div>
                                        <div className="flex items-center xl:pt-6">
                                            <label className="flex items-center gap-2 text-sm text-slate-700">
                                                <input type="checkbox" checked={field.required} onChange={event => updateField(field.id, { required: event.target.checked })} className="size-4 accent-blue-700" />
                                                Bắt buộc nhập
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <p className="mt-5 rounded-lg bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
                            Mã trường bắt đầu bằng chữ, chỉ chứa chữ không dấu, số và dấu gạch dưới. Mã các trường không được trùng nhau.
                        </p>
                    </section>
                </fieldset>

                {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <Link href="/batches" className="inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">Hủy</Link>
                    <button type="submit" disabled={isSubmitting} className="inline-flex items-center justify-center rounded-xl bg-[#0b4ea2] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/10 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
                        {isSubmitting ? 'Đang tạo lô...' : 'Tạo lô tài liệu'}
                    </button>
                </div>
            </form>
        </main>
    )
}

