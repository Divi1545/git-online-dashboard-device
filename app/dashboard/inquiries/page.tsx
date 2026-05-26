import { redirect } from 'next/navigation'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { InquiriesClient } from '@/components/dashboard/InquiriesClient'

export const dynamic = 'force-dynamic'

export default async function InquiriesPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const isAdmin = user.email === process.env.ADMIN_EMAIL
  if (!isAdmin) redirect('/dashboard')

  const serviceClient = createServiceRoleClient()
  const { data: inquiries } = await serviceClient
    .from('hardware_inquiries')
    .select('*')
    .order('created_at', { ascending: false })

  return <InquiriesClient inquiries={inquiries || []} />
}
