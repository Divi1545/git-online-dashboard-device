export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'
import type { DeviceRow, SubscriptionRow, ConversationRow, SupabaseSingle, SupabaseList } from '@/types/database'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(
  req: NextRequest,
  { params }: { params: { device_id: string } }
) {
  const adminKey = req.headers.get('x-admin-key')
  if (!adminKey || adminKey !== process.env.ADMIN_REGISTER_KEY) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 401, headers: CORS_HEADERS }
    )
  }

  const { device_id } = params
  const db = getAdminClient()

  const { data: device } = (await db
    .from('hardware_devices')
    .select('*')
    .eq('device_id', device_id)
    .single()) as SupabaseSingle<DeviceRow>

  if (!device) {
    return NextResponse.json(
      { error: 'Device not found', code: 'DEVICE_NOT_FOUND' },
      { status: 404, headers: CORS_HEADERS }
    )
  }

  const { data: subscription } = (await db
    .from('hardware_subscriptions')
    .select('*')
    .eq('device_id', device.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()) as SupabaseSingle<SubscriptionRow>

  const { data: recentConversations } = (await db
    .from('hardware_conversations')
    .select('*')
    .eq('device_id', device.id)
    .order('created_at', { ascending: false })
    .limit(10)) as SupabaseList<ConversationRow>

  return NextResponse.json(
    {
      device,
      subscription: subscription ?? null,
      recent_conversations: recentConversations ?? [],
    },
    { status: 200, headers: CORS_HEADERS }
  )
}
