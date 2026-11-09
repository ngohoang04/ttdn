import type { ReactNode } from 'react'
import WorkspaceShell from '@/app/components/WorkspaceShell'

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
    return <WorkspaceShell>{children}</WorkspaceShell>
}
