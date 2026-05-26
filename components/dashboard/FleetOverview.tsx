'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'
import { DeviceCard } from '@/components/hardware/DeviceCard'
import { Server, Wifi, AlertCircle, DollarSign } from 'lucide-react'

interface Device {
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

interface Stats {
  total: number
  online: number
  lapsed: number
  revenue: number
}

interface FleetOverviewProps {
  initialDevices: Device[]
  stats: Stats | null
  isAdmin: boolean
  userId: string
}

export function FleetOverview({ initialDevices, stats, isAdmin }: FleetOverviewProps) {
  const [devices, setDevices] = useState<Device[]>(initialDevices)
  const supabase = createBrowserClient()

  useEffect(() => {
    const channel = supabase
      .channel('hardware_devices_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'hardware_devices',
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setDevices((prev) =>
              prev.map((d) =>
                d.id === (payload.new as Device).id
                  ? { ...d, ...(payload.new as Device) }
                  : d
              )
            )
          } else if (payload.eventType === 'INSERT') {
            setDevices((prev) => [payload.new as Device, ...prev])
          } else if (payload.eventType === 'DELETE') {
            setDevices((prev) => prev.filter((d) => d.id !== (payload.old as Device).id))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Fleet Overview</h1>
        <p className="text-white/50 text-sm mt-1">
          {isAdmin ? 'All devices globally' : 'Your deployed devices'}
        </p>
      </div>

      {/* Stats Row (admin only) */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Server} label="Total Devices" value={stats.total} />
          <StatCard icon={Wifi} label="Online Now" value={stats.online} color="text-teal-400" />
          <StatCard
            icon={AlertCircle}
            label="Lapsed"
            value={stats.lapsed}
            color="text-amber-400"
          />
          <StatCard
            icon={DollarSign}
            label="Monthly Revenue"
            value={`$${stats.revenue.toLocaleString()}`}
            color="text-teal-400"
          />
        </div>
      )}

      {/* Device Grid */}
      {devices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Server className="w-12 h-12 text-white/20 mb-4" />
          <h3 className="text-white/50 font-medium">No devices yet</h3>
          <p className="text-white/30 text-sm mt-1">
            Contact admin to activate your first device
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((device) => {
            const sub = Array.isArray(device.hardware_subscriptions)
              ? device.hardware_subscriptions[0]
              : device.hardware_subscriptions
            return (
              <DeviceCard
                key={device.id}
                device={device}
                subscription={sub || null}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  color = 'text-white',
}: {
  icon: React.ElementType
  label: string
  value: string | number
  color?: string
}) {
  return (
    <div className="bg-[#1A1A1A] border border-white/10 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-white/40" />
        <p className="text-xs text-white/40">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  )
}
