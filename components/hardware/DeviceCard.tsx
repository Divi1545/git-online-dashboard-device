import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LedIndicator } from './LedIndicator'
import { timeAgo, truncateId, formatDate } from '@/lib/utils'
import Link from 'next/link'
import { Wifi, WifiOff, AlertCircle, Calendar, MapPin } from 'lucide-react'

interface DeviceCardProps {
  device: {
    id: string
    device_id: string
    product_type: string
    status: 'online' | 'offline' | 'lapsed'
    location: string | null
    last_seen: string | null
    deployed_at: string
  }
  subscription?: {
    plan: string
    next_billing: string | null
    price_usd: number
  } | null
}

const statusConfig = {
  online: {
    label: 'ONLINE',
    classes: 'bg-teal-600/20 text-teal-400 border-teal-600/30',
    icon: Wifi,
  },
  offline: {
    label: 'OFFLINE',
    classes: 'bg-red-500/20 text-red-400 border-red-500/30',
    icon: WifiOff,
  },
  lapsed: {
    label: 'SUBSCRIPTION LAPSED',
    classes: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    icon: AlertCircle,
  },
}

export function DeviceCard({ device, subscription }: DeviceCardProps) {
  const status = statusConfig[device.status]
  const StatusIcon = status.icon

  return (
    <Card className="bg-[#1A1A1A] border-white/10 hover:border-white/20 transition-all duration-200 group">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <LedIndicator status={device.status} />
            <div>
              <h3 className="font-semibold text-white text-sm leading-tight">
                {device.product_type}
              </h3>
              {device.location && (
                <p className="text-white/50 text-xs flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3" />
                  {device.location}
                </p>
              )}
            </div>
          </div>
          <Badge className={`text-xs border ${status.classes} shrink-0`}>
            <StatusIcon className="w-3 h-3 mr-1" />
            {status.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-xs text-white/40 font-mono bg-white/5 rounded px-2 py-1">
          {truncateId(device.device_id)} — {device.device_id}
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-white/40 mb-0.5">Last Seen</p>
            <p className="text-white/70">{timeAgo(device.last_seen)}</p>
          </div>
          <div>
            <p className="text-white/40 mb-0.5">Deployed</p>
            <p className="text-white/70">{formatDate(device.deployed_at)}</p>
          </div>
        </div>

        {subscription && (
          <div className="border-t border-white/5 pt-3 grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-white/40 mb-0.5">Plan</p>
              <p className="text-white capitalize font-medium">{subscription.plan}</p>
            </div>
            <div>
              <p className="text-white/40 mb-0.5">Next Billing</p>
              <p className="text-white/70 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {subscription.next_billing ? formatDate(subscription.next_billing) : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-white/40 mb-0.5">Monthly</p>
              <p className="text-teal-400 font-semibold">${subscription.price_usd}/mo</p>
            </div>
          </div>
        )}

        <Link href={`/dashboard/device/${device.id}`}>
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-1 border-white/10 text-white/70 hover:bg-white/5 hover:text-white text-xs"
          >
            View Details →
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}
