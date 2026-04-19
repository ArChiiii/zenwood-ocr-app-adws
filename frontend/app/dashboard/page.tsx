import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { FeatureGrid } from './FeatureGrid'

export default async function DashboardPage() {
  const supabase = await createClient()
  // getUser() fetches the user from Auth server — cryptographically verified
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Zentral AI</h1>
          <p className="text-sm text-gray-500 mt-1">
            Select a feature to process your document
          </p>
        </div>
        <FeatureGrid />
      </div>
    </main>
  )
}
