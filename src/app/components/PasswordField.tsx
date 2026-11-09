'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

type PasswordFieldProps = {
    id: string
    label: string
    placeholder: string
    description?: string
    minLength?: number
}

export default function PasswordField({ id, label, placeholder, description, minLength }: PasswordFieldProps) {
    const [visible, setVisible] = useState(false)

    return (
        <div className="flex flex-col gap-2">
            <label htmlFor={id} className="text-sm font-semibold text-slate-700">{label}</label>
            <div className="relative">
                <input id={id} name={id} type={visible ? 'text' : 'password'} placeholder={placeholder} autoComplete="new-password" required minLength={minLength} aria-describedby={description ? `${id}-help` : undefined} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 pr-12 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
                <button type="button" onClick={() => setVisible(value => !value)} className="absolute right-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`${visible ? 'Ẩn' : 'Hiện'} ${label.toLowerCase()}`}>
                    {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                </button>
            </div>
            {description && <p id={`${id}-help`} className="text-xs text-slate-500">{description}</p>}
        </div>
    )
}
