'use client'

import { ResponsiveShell } from '@/components/ResponsiveShell'

interface DashboardShellProps {
  userEmail: string
  children: React.ReactNode
}

export function DashboardShell({ userEmail, children }: DashboardShellProps) {
  return (
    <ResponsiveShell userEmail={userEmail}>
      {children}
    </ResponsiveShell>
  )
}
