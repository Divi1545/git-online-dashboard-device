import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { FleetOverview } from '@/components/dashboard/FleetOverview'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface DeviceWithSub {
  id: string
  device_id: string
  product_type: string
  status: 'online' | 'offline' | 'lapsed'
  location: string | null
  last_seen: string | null
  deployed_at: string
  hardware_subscriptions: Array<{
    plan: string
    price_usd: number
    status: string
    next_billing: string | null
  }> | null
}

export default async function DashboardPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const isAdmin = user.email === process.env.ADMIN_EMAIL
  const client = isAdmin ? createServiceRoleClient() : supabase

  // Fetch devices with subscriptions
  const { data: rawDevices } = await client
    .from('hardware_devices')
    .select(`
      *,
      hardware_subscriptions (
        plan,
        price_usd,
        status,
        next_billing
      )
    `)
    .order('deployed_at', { ascending: false })

  const devices = (rawDevices || []) as DeviceWithSub[]

  // Admin stats
  let stats = null
  if (isAdmin) {
    const thisMonthRevenue = devices.reduce((sum, d) => {
      const sub = Array.isArray(d.hardware_subscriptions) ? d.hardware_subscriptions[0] : d.hardware_subscriptions
      return sub?.status === 'active' ? sum + (sub.price_usd || 0) : sum
    }, 0)
    stats = {
      total: devices.length,
      online: devices.filter((d) => d.status === 'online').length,
      lapsed: devices.filter((d) => d.status === 'lapsed').length,
      revenue: thisMonthRevenue,
    }
  }

  return (
    <FleetOverview
      initialDevices={devices}
      stats={stats}
      isAdmin={isAdmin}
      userId={user.id}
    />
  )
}
