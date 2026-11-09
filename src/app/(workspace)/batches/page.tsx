'use client'
import { useEffect, useState } from 'react'
import BatchesView, { type Batch } from '@/app/components/BatchesView'
import { useWorkspace } from '@/app/components/WorkspaceShell'

export default function BatchesPage() {
    const { token, logout } = useWorkspace()
    const [batches, setBatches] = useState<Batch[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState('')
    useEffect(() => {
        const controller = new AbortController()
        async function loadBatches() {
            try {
                const response = await fetch('/api/batches', {
                    headers: { Authorization: 'Bearer ' + token },
                    signal: controller.signal,
                })
                if (response.status === 401) { logout(); return }
                if (!response.ok) throw new Error('Không thể tải danh sách lô tài liệu')
                const data: Batch[] = await response.json()
                if (!controller.signal.aborted) setBatches(data)
            } catch {
                if (!controller.signal.aborted) setError('Không thể tải danh sách. Hãy kiểm tra backend.')
            } finally {
                if (!controller.signal.aborted) setIsLoading(false)
            }
        }
        loadBatches()
        return () => controller.abort()
    }, [token, logout])
    return <BatchesView batches={batches} isLoading={isLoading} error={error} />
}
