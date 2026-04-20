import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardShell } from './shell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <DashboardShell userEmail={user.email ?? ''}>
      {children}
    </DashboardShell>
  )
}
