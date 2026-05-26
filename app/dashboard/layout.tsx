import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { DashboardShell } from '@/components/dashboard/DashboardShell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const isAdmin = user.email === process.env.ADMIN_EMAIL

  return (
    <DashboardShell user={{ email: user.email!, isAdmin }}>
      {children}
    </DashboardShell>
  )
}
