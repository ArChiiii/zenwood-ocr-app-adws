'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div
        className="w-full max-w-md rounded-2xl p-10 text-center"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          boxShadow: '0 4px 24px 0 rgb(0 0 0 / 0.08)',
        }}
      >
        <div className="text-3xl mb-4">✉️</div>
        <h1 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          Check your email
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.
        </p>
      </div>
    )
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
        Create account
      </h1>
      <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
        Get started with Zentral AI
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
          <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            className="w-full px-3 rounded-lg text-sm outline-none"
            style={{
              height: '42px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            className="w-full px-3 rounded-lg text-sm outline-none"
            style={{
              height: '42px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Confirm password</label>
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            required
            placeholder="••••••••"
            className="w-full px-3 rounded-lg text-sm outline-none"
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
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
        Already have an account?{' '}
        <Link href="/login" className="font-semibold" style={{ color: 'var(--accent)' }}>
          Sign in
        </Link>
      </p>
    </div>
  )
}
