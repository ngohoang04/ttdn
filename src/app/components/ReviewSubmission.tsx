type Field = { key: string; label: string }

function parseData(value: unknown): Record<string, unknown> | null {
    try {
        const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : null
    } catch {
        return null
    }
}

export default function ReviewSubmission({ data, submittedAt, schema }: {
    data: unknown
    submittedAt: string | null
    schema: unknown
}) {
    const submitted = parseData(data)
    const fields = Array.isArray(schema) ? schema as Field[] : []

    return <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <summary className="cursor-pointer font-semibold text-[#0b4ea2]">Xem nội dung CTV đã nộp</summary>
        {submitted ? <div className="mt-4">
            {submittedAt && <p className="mb-3 text-xs text-slate-500">Nộp lúc {new Date(submittedAt).toLocaleString('vi-VN')}</p>}
            <dl className="grid gap-3 sm:grid-cols-2">
                {Object.entries(submitted).map(([key, value]) => <div key={key} className="min-w-0 rounded-lg bg-white p-3">
                    <dt className="text-xs font-medium text-slate-500">{fields.find(field => field.key === key)?.label || key}</dt>
                    <dd className="mt-1 whitespace-pre-wrap break-words font-medium text-slate-800">{value === null || value === '' ? '—' : String(value)}</dd>
                </div>)}
            </dl>
        </div> : <p className="mt-3 text-slate-500">Lượt duyệt này chưa lưu nội dung CTV đã nộp.</p>}
    </details>
}
