'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { LedIndicator } from '@/components/hardware/LedIndicator'
import { ConversationTable } from '@/components/hardware/ConversationTable'
import { UsageCharts } from '@/components/hardware/UsageCharts'
import { formatDate, formatDateTime, truncateId } from '@/lib/utils'
import { ArrowLeft, MapPin, Calendar, Cpu, CreditCard, AlertTriangle, Code2 } from 'lucide-react'
import Link from 'next/link'
import { createBrowserClient } from '@/lib/supabase/client'

interface DeviceDetailClientProps {
  device: {
    id: string
    device_id: string
    product_type: string
    status: 'online' | 'offline' | 'lapsed'
    location: string | null
    deployed_at: string
    last_seen: string | null
    owner_id: string | null
  }
  subscription: {
    id: string
    plan: string
    region: string
    price_usd: number
    status: string
    stripe_sub_id: string | null
    next_billing: string | null
  } | null
  conversations: Array<{
    id: string
    session_id: string
    language: string
    duration_s: number
    message_count: number
    created_at: string
  }>
  totalConversations: number
  avgDuration: number
  languageData: Array<{ language: string; count: number }>
  dailyData: Array<{ date: string; count: number }>
  isAdmin: boolean
  currentPage: number
  selectedLanguage: string
}

export function DeviceDetailClient({
  device,
  subscription,
  conversations,
  totalConversations,
  avgDuration,
  languageData,
  dailyData,
  isAdmin,
  currentPage,
  selectedLanguage,
}: DeviceDetailClientProps) {
  const router = useRouter()
  const [deactivating, setDeactivating] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const supabase = createBrowserClient()

  function handlePageChange(page: number) {
    const params = new URLSearchParams()
    params.set('page', page.toString())
    if (selectedLanguage !== 'all') params.set('language', selectedLanguage)
    router.push(`/dashboard/device/${device.id}?${params.toString()}`)
  }

  function handleLanguageFilter(language: string) {
    const params = new URLSearchParams()
    params.set('page', '1')
    if (language !== 'all') params.set('language', language)
    router.push(`/dashboard/device/${device.id}?${params.toString()}`)
  }

  async function handleDeactivate() {
    setDeactivating(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('hardware_devices')
      .update({ status: 'offline' })
      .eq('id', device.id)
    setDeactivating(false)
    setDialogOpen(false)
    router.refresh()
  }

  const statusConfig = {
    online: 'bg-teal-600/20 text-teal-400 border-teal-600/30',
    offline: 'bg-red-500/20 text-red-400 border-red-500/30',
    lapsed: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="text-white/50 hover:text-white p-0">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Fleet
          </Button>
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <LedIndicator status={device.status} size="md" />
          <div>
            <h1 className="text-xl font-bold text-white">
              {device.product_type}
              {device.location && (
                <span className="text-white/50 font-normal"> — {device.location}</span>
              )}
            </h1>
            <p className="text-white/40 text-sm font-mono">{device.device_id}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={`text-sm border ${statusConfig[device.status]}`}>
            {device.status.toUpperCase()}
          </Badge>
          {isAdmin && (
            <Link href={`/dashboard/device/${device.id}/program`}>
              <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5">
                <Code2 className="w-3.5 h-3.5" />
                Program Device
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Device Info + Subscription */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-[#1A1A1A] border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-white/70 flex items-center gap-2">
              <Cpu className="w-4 h-4" />
              Device Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <InfoRow label="Device ID" value={device.device_id} mono />
            <InfoRow label="Internal ID" value={truncateId(device.id)} mono />
            <InfoRow label="Product Type" value={device.product_type} />
            <InfoRow
              label="Location"
              value={device.location || 'Not specified'}
              icon={<MapPin className="w-3 h-3" />}
            />
            <InfoRow
              label="Deployed"
              value={formatDate(device.deployed_at)}
              icon={<Calendar className="w-3 h-3" />}
            />
            <InfoRow
              label="Last Seen"
              value={formatDateTime(device.last_seen)}
            />
          </CardContent>
        </Card>

        <Card className="bg-[#1A1A1A] border-white/10">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-white/70 flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              Subscription
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {subscription ? (
              <>
                <InfoRow label="Plan" value={subscription.plan} capitalize />
                <InfoRow label="Region" value={subscription.region.replace('_', ' ')} capitalize />
                <InfoRow label="Price" value={`$${subscription.price_usd}/mo`} accent />
                <InfoRow
                  label="Status"
                  value={subscription.status}
                  capitalize
                  badge
                  badgeClass={
                    subscription.status === 'active'
                      ? 'bg-teal-600/20 text-teal-400 border-teal-600/30'
                      : 'bg-red-500/20 text-red-400 border-red-500/30'
                  }
                />
                {subscription.next_billing && (
                  <InfoRow label="Next Billing" value={formatDate(subscription.next_billing)} />
                )}
                {subscription.stripe_sub_id && (
                  <InfoRow label="Stripe Sub" value={truncateId(subscription.stripe_sub_id)} mono />
                )}
              </>
            ) : (
              <p className="text-white/40">No active subscription</p>
            )}
          </CardContent>

          {isAdmin && (
            <div className="px-6 pb-4">
              <Separator className="bg-white/5 mb-4" />
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger className="w-full inline-flex items-center justify-center rounded-md border border-red-500/30 text-red-400 hover:bg-red-500/10 px-3 py-1.5 text-xs font-medium transition-colors">
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    Deactivate Device
                </DialogTrigger>
                <DialogContent className="bg-[#1A1A1A] border-white/10 text-white">
                  <DialogHeader>
                    <DialogTitle className="text-white">Deactivate Device</DialogTitle>
                    <DialogDescription className="text-white/60">
                      This will set the device status to offline. The operator will lose access
                      to the device dashboard. Are you sure?
                    </DialogDescription>
                  </DialogHeader>
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">
                    <strong>Device:</strong> {device.device_id} — {device.location}
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setDialogOpen(false)}
                      className="border-white/10 text-white/70"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleDeactivate}
                      disabled={deactivating}
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      {deactivating ? 'Deactivating...' : 'Confirm Deactivate'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {!isAdmin && (
            <div className="px-6 pb-4">
              <Separator className="bg-white/5 mb-4" />
              <Dialog>
                <DialogTrigger className="w-full inline-flex items-center justify-center rounded-md border border-white/10 text-white/50 hover:bg-white/5 px-3 py-1.5 text-xs font-medium transition-colors">
                    Deactivate Device
                </DialogTrigger>
                <DialogContent className="bg-[#1A1A1A] border-white/10 text-white">
                  <DialogHeader>
                    <DialogTitle>Deactivate Device</DialogTitle>
                    <DialogDescription className="text-white/60">
                      Device deactivation requires admin approval. Please contact the admin.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 text-amber-400 text-sm">
                    Contact admin to deactivate this device: divindu@aicodeagency.org
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </Card>
      </div>

      {/* Analytics */}
      <div>
        <h2 className="text-base font-semibold text-white mb-4">Usage Analytics</h2>
        <UsageCharts
          dailyData={dailyData}
          languageData={languageData}
          avgDuration={avgDuration}
          totalConversations={totalConversations}
        />
      </div>

      {/* Conversation History */}
      <div>
        <h2 className="text-base font-semibold text-white mb-4">Conversation History</h2>
        <ConversationTable
          conversations={conversations}
          total={totalConversations}
          page={currentPage}
          onPageChange={handlePageChange}
          onLanguageFilter={handleLanguageFilter}
          selectedLanguage={selectedLanguage}
        />
      </div>
    </div>
  )
}

function InfoRow({
  label,
  value,
  mono,
  capitalize,
  icon,
  accent,
  badge,
  badgeClass,
}: {
  label: string
  value: string
  mono?: boolean
  capitalize?: boolean
  icon?: React.ReactNode
  accent?: boolean
  badge?: boolean
  badgeClass?: string
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-white/40 shrink-0">{label}</span>
      {badge ? (
        <Badge className={`text-xs border ${badgeClass}`}>{value}</Badge>
      ) : (
        <span
          className={[
            'text-right',
            mono ? 'font-mono text-xs text-white/60' : '',
            capitalize ? 'capitalize' : '',
            accent ? 'text-teal-400 font-semibold' : 'text-white/80',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {icon && <span className="inline mr-1 opacity-60">{icon}</span>}
          {value}
        </span>
      )}
    </div>
  )
}
