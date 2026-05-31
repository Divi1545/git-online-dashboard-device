import { notFound, redirect } from 'next/navigation'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { DeviceDetailClient } from '@/components/dashboard/DeviceDetailClient'

export const dynamic = 'force-dynamic'

export default async function DeviceDetailPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { page?: string; language?: string }
}) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const isAdmin = user.email === process.env.ADMIN_EMAIL
  const client = isAdmin ? createServiceRoleClient() : supabase

  const page = parseInt(searchParams.page || '1', 10)
  const language = searchParams.language || 'all'
  const pageSize = 20
  const offset = (page - 1) * pageSize

  let convQuery = client
    .from('hardware_conversations')
    .select('*', { count: 'exact' })
    .eq('device_id', params.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (language !== 'all') {
    convQuery = convQuery.eq('language', language)
  }

  // Run all queries in parallel
  const [
    { data: device },
    { data: subscription },
    { data: conversations, count: totalConversations },
    { data: allConversationsRaw },
  ] = await Promise.all([
    client.from('hardware_devices').select('*').eq('id', params.id).single(),
    client.from('hardware_subscriptions').select('*').eq('device_id', params.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    convQuery,
    client.from('hardware_conversations').select('language, duration_s, created_at').eq('device_id', params.id),
  ])

  if (!device) notFound()
  const allConversations = allConversationsRaw as Array<{ language: string; duration_s: number; created_at: string }> | null

  const avgDuration =
    allConversations && allConversations.length > 0
      ? Math.round(
          allConversations.reduce((sum, c) => sum + c.duration_s, 0) / allConversations.length
        )
      : 0

  // Language breakdown
  const langMap: Record<string, number> = {}
  allConversations?.forEach((c) => {
    langMap[c.language] = (langMap[c.language] || 0) + 1
  })
  const languageData = Object.entries(langMap).map(([language, count]) => ({ language, count }))

  // Daily conversations (last 30 days)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const dailyMap: Record<string, number> = {}
  allConversations?.forEach((c) => {
    const date = c.created_at.slice(0, 10)
    if (new Date(date) >= thirtyDaysAgo) {
      dailyMap[date] = (dailyMap[date] || 0) + 1
    }
  })
  const dailyData = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))

  return (
    <DeviceDetailClient
      device={device}
      subscription={subscription || null}
      conversations={conversations || []}
      totalConversations={totalConversations || 0}
      avgDuration={avgDuration}
      languageData={languageData}
      dailyData={dailyData}
      isAdmin={isAdmin}
      currentPage={page}
      selectedLanguage={language}
    />
  )
}
