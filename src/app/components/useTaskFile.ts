'use client'

import { useEffect, useState } from 'react'

type LoadedFile = { key: string; href: string }

export function useTaskFile(taskId: number | null, fileUrl: string | null, token: string, logout: () => void) {
    const [loaded, setLoaded] = useState<LoadedFile | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const key = taskId !== null && fileUrl?.startsWith('stored:') ? `${taskId}:${fileUrl}` : null

    useEffect(() => {
        if (!key || taskId === null) return
        const controller = new AbortController()
        let objectUrl: string | null = null
        async function load() {
            setLoading(true)
            setError('')
            try {
                const response = await fetch(`/api/tasks/${taskId}/file`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
                if (response.status === 401) { logout(); return }
                if (!response.ok) throw new Error('Không thể tải file tài liệu.')
                const blob = await response.blob()
                if (!controller.signal.aborted) {
                    objectUrl = URL.createObjectURL(blob)
                    setLoaded({ key: key!, href: objectUrl })
                }
            } catch (cause) {
                if (!controller.signal.aborted) setError(cause instanceof Error && cause.message !== 'Failed to fetch' ? cause.message : 'Không thể kết nối để tải file.')
            } finally { if (!controller.signal.aborted) setLoading(false) }
        }
        load()
        return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
    }, [key, taskId, token, logout])

    return { href: key && loaded?.key === key ? loaded.href : null, loading: !!key && loading, error: key ? error : '' }
}
