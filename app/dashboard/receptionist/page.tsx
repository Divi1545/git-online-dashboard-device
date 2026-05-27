import { redirect } from 'next/navigation'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { ReceptionistClient } from '@/components/dashboard/ReceptionistClient'
import type { DeviceRow, SubscriptionRow, ConversationRow } from '@/types/database'

export const dynamic = 'force-dynamic'

interface DeviceWithSub extends DeviceRow {
  hardware_subscriptions: Array<Pick<SubscriptionRow, 'plan' | 'status' | 'price_usd' | 'next_billing'>> | null
}

export default async function ReceptionistPage() {
  const supabase = createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const isAdmin = user.email === process.env.ADMIN_EMAIL
  const client = isAdmin ? createServiceRoleClient() : supabase

  // Fetch devices with subscriptions
  let devicesQuery = client
    .from('hardware_devices')
    .select(`
      *,
      hardware_subscriptions (
        plan,
        status,
        price_usd,
        next_billing
      )
    `)
    .order('deployed_at', { ascending: false })

  if (!isAdmin) {
    devicesQuery = devicesQuery.eq('owner_id', user.id)
  }

  const { data: rawDevices } = await devicesQuery
  const devices = (rawDevices || []) as DeviceWithSub[]

  // Fetch recent conversations
  const adminClient = isAdmin ? createServiceRoleClient() : supabase
  const { data: rawConversations } = await adminClient
    .from('hardware_conversations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)

  const conversations = (rawConversations || []) as ConversationRow[]

  return (
    <ReceptionistClient
      devices={devices}
      conversations={conversations}
      isAdmin={isAdmin}
      userId={user.id}
    />
  )
}
