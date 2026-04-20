'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    const redirect = searchParams.get('redirect') || '/dashboard'
    router.push(redirect)
    router.refresh()
  }

  return (
    <div
      className="w-full max-w-md rounded-2xl p-10"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        boxShadow: '0 4px 24px 0 rgb(0 0 0 / 0.08)',
      }}
    >
      <h1 className="text-3xl font-bold mb-1" style={{ color: 'var(--text-primary)', letterSpacing: '-0.4px' }}>
        Welcome back
      </h1>
      <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
        Sign in to your Zentral AI account
      </p>

      {error && (
        <div
          className="mb-4 px-4 py-3 rounded-lg text-sm"
          style={{ background: 'var(--error-bg)', color: 'var(--error)' }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            className="w-full px-3 rounded-lg text-sm outline-none transition-all"
            style={{
              height: '42px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            className="w-full px-3 rounded-lg text-sm outline-none transition-all"
            style={{
              height: '42px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60 mt-2"
          style={{
            height: '44px',
            background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)',
          }}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="font-semibold" style={{ color: 'var(--accent)' }}>
          Sign up
        </Link>
      </p>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
