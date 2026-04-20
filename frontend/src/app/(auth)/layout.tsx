import { LogoIcon } from '@/components/LogoIcon'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <header className="px-8 py-6">
        <div className="flex items-center gap-3">
          <LogoIcon size={32} />
          <span className="font-semibold text-lg tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Zentral AI
          </span>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 pb-16">
        {children}
      </main>
    </div>
  )
}
