'use client'

import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'

const SIDEBAR_FULL = 260   // matches --sidebar-width
const SIDEBAR_DOCK = 52    // collapsed icon rail

interface ResponsiveShellProps {
  children: React.ReactNode
  userEmail?: string
}

export function ResponsiveShell({ children, userEmail }: ResponsiveShellProps) {
  const [collapsed, setCollapsed] = useState(false)
  const sidebarWidth = collapsed ? SIDEBAR_DOCK : SIDEBAR_FULL

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <Sidebar
        userEmail={userEmail}
        collapsed={collapsed}
        onToggle={() => setCollapsed(c => !c)}
      />
      <BottomNav />

      {/* On mobile (< md): no sidebar padding. On md+: pad for sidebar. */}
      <style>{`
        .shell-main {
          padding-left: 0;
          transition: padding-left 220ms cubic-bezier(0.4,0,0.2,1);
        }
        @media (min-width: 768px) {
          .shell-main {
            padding-left: ${sidebarWidth}px;
          }
        }
      `}</style>

      <main className="shell-main min-h-screen pb-[var(--bottom-nav-height)] md:pb-0">
        <div className="p-6 md:p-8 max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
