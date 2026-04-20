'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { LogoIcon } from '@/components/LogoIcon'

interface SidebarProps {
  userEmail?: string
  collapsed?: boolean
  onToggle?: () => void
}

const NAV_ITEMS = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
    exact: true,
  },
  {
    href: '/dashboard/upload',
    label: 'Upload',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
    exact: false,
  },
]

function ExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function CollapseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

export function Sidebar({ userEmail, collapsed = false, onToggle }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  const handleSignOut = async () => {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // ── COLLAPSED DOCK ──────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <aside
        className="hidden md:flex fixed inset-y-0 left-0 flex-col items-center z-40 py-3 gap-1"
        style={{
          width: '52px',
          background: 'var(--bg-card)',
          borderRight: '1px solid var(--border)',
        }}
      >
        {/* Logo — click to expand, hover shows chevron overlay */}
        <button
          onClick={onToggle}
          aria-label="Expand sidebar"
          className="group relative flex items-center justify-center w-9 h-9 mb-2 rounded-lg transition-colors hover:bg-[var(--bg-surface)]"
        >
          <LogoIcon size={26} />
          {/* Expand chevron — shown on hover */}
          <span
            className="absolute inset-0 flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
          >
            <ExpandIcon />
          </span>
        </button>

        {/* Nav icons */}
        <nav className="flex flex-col items-center gap-1 flex-1">
          {NAV_ITEMS.map(item => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href) && item.href !== '/dashboard'
                ? true
                : pathname === item.href

            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors"
                style={{
                  background: active ? 'var(--accent-light)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-muted)',
                }}
              >
                {item.icon}
              </Link>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="flex flex-col items-center gap-1 mt-auto">
          {userEmail && (
            <div
              className="flex items-center justify-center w-9 h-9 rounded-lg"
              title={userEmail}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
                style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
              >
                {userEmail[0].toUpperCase()}
              </div>
            </div>
          )}
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            title="Sign out"
            className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors hover:bg-[var(--bg-surface)] disabled:opacity-50"
            style={{ color: 'var(--text-muted)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </aside>
    )
  }

  // ── EXPANDED SIDEBAR ────────────────────────────────────────────────────────
  return (
    <aside
      className="hidden md:flex fixed inset-y-0 left-0 flex-col z-40"
      style={{
        width: '260px',
        background: 'var(--bg-card)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Logo + collapse button */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-5 py-[18px]"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2.5">
          <LogoIcon size={28} />
          <span className="font-semibold text-sm tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Zentral AI
          </span>
        </div>
        {onToggle && (
          <button
            onClick={onToggle}
            className="flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-[var(--bg-surface)]"
            style={{ color: 'var(--text-muted)', flexShrink: 0 }}
            aria-label="Collapse sidebar"
          >
            <CollapseIcon />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href) && item.href !== '/dashboard'
              ? true
              : pathname === item.href

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: active ? 'var(--accent-light)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
              }}
            >
              <span className="flex-shrink-0" style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User + sign out */}
      <div className="flex-shrink-0 px-3 py-4" style={{ borderTop: '1px solid var(--border)' }}>
        {userEmail && (
          <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
              style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
            >
              {userEmail[0].toUpperCase()}
            </div>
            <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
              {userEmail}
            </p>
          </div>
        )}
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
          style={{ color: 'var(--text-secondary)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </aside>
  )
}
