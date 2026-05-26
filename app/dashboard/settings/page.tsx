import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function SettingsPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-white/50 text-sm mt-1">Account and device settings</p>
      </div>
      <div className="bg-[#1A1A1A] border border-white/10 rounded-lg p-6">
        <h2 className="text-base font-semibold text-white mb-4">Account</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-white/50">Email</span>
            <span className="text-white">{user.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/50">User ID</span>
            <span className="text-white/60 font-mono text-xs">{user.id.slice(0, 16)}...</span>
          </div>
        </div>
      </div>
    </div>
  )
}
