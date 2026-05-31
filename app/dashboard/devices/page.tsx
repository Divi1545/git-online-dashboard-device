import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { Cpu, Wifi, WifiOff, AlertCircle, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

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

function statusBadge(status: string) {
  if (status === 'online')
    return (
      <span className="flex items-center gap-1.5 text-teal-400 text-sm font-medium">
        <Wifi className="w-3.5 h-3.5" /> Online
      </span>
    )
  if (status === 'lapsed')
    return (
      <span className="flex items-center gap-1.5 text-amber-400 text-sm font-medium">
        <AlertCircle className="w-3.5 h-3.5" /> Lapsed
      </span>
    )
  return (
    <span className="flex items-center gap-1.5 text-white/40 text-sm font-medium">
      <WifiOff className="w-3.5 h-3.5" /> Offline
    </span>
  )
}

function formatLastSeen(ts: string | null) {
  if (!ts) return '—'
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default async function DevicesPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const isAdmin = user.email === process.env.ADMIN_EMAIL
  const client = isAdmin ? createServiceRoleClient() : supabase

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Devices</h1>
        <p className="text-white/50 text-sm mt-1">
          {devices.length} device{devices.length !== 1 ? 's' : ''} registered
        </p>
      </div>

      {devices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Cpu className="w-12 h-12 text-white/20 mb-4" />
          <h3 className="text-white/50 font-medium">No devices yet</h3>
          <p className="text-white/30 text-sm mt-1">Contact admin to activate your first device</p>
        </div>
      ) : (
        <div className="bg-[#1A1A1A] border border-white/10 rounded-lg overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[2fr_1.5fr_1fr_1.5fr_1fr_auto] gap-4 px-4 py-3 border-b border-white/5 text-xs text-white/30 uppercase tracking-wider">
            <span>Device</span>
            <span>Location</span>
            <span>Status</span>
            <span>Plan</span>
            <span>Last Seen</span>
            <span />
          </div>

          {/* Rows */}
          {devices.map((device) => {
            const sub = Array.isArray(device.hardware_subscriptions)
              ? device.hardware_subscriptions[0]
              : device.hardware_subscriptions

            return (
              <Link
                key={device.id}
                href={`/dashboard/device/${device.id}`}
                className="grid grid-cols-[2fr_1.5fr_1fr_1.5fr_1fr_auto] gap-4 px-4 py-4 border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors items-center group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[#111111] border border-white/10 flex items-center justify-center shrink-0">
                    <Cpu className="w-4 h-4 text-teal-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{device.device_id}</p>
                    <p className="text-white/30 text-xs truncate">{device.product_type}</p>
                  </div>
                </div>

                <span className="text-white/60 text-sm truncate">{device.location || '—'}</span>

                <span>{statusBadge(device.status)}</span>

                <span>
                  {sub ? (
                    <Badge
                      className={
                        sub.status === 'active'
                          ? 'bg-teal-600/10 text-teal-400 border-teal-600/20 text-xs'
                          : 'bg-white/5 text-white/30 border-white/10 text-xs'
                      }
                    >
                      {sub.plan} · ${sub.price_usd}/mo
                    </Badge>
                  ) : (
                    <span className="text-white/20 text-sm">No plan</span>
                  )}
                </span>

                <span className="text-white/40 text-sm">{formatLastSeen(device.last_seen)}</span>

                <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/40 transition-colors" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
