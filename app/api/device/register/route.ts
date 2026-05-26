export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, mutate } from '@/lib/supabase-admin'
import { hashSecret } from '@/lib/bcrypt'
import { sendTelegramAlert } from '@/lib/telegram'
import type { DeviceRow, SupabaseSingle } from '@/types/database'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: NextRequest) {
  let body: {
    device_id?: string
    secret?: string
    product_type?: string
    location?: string
    wake_word?: string
    firmware?: string
    admin_key?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON', code: 'BAD_REQUEST' },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  const { device_id, secret, product_type, location, wake_word, firmware, admin_key } = body

  // 1. Verify admin key
  if (!admin_key || admin_key !== process.env.ADMIN_REGISTER_KEY) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 401, headers: CORS_HEADERS }
    )
  }

  if (!device_id || !secret) {
    return NextResponse.json(
      { error: 'device_id and secret are required', code: 'BAD_REQUEST' },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  const db = getAdminClient()

  // 2. Check not already registered
  const { data: existing } = (await db
    .from('hardware_devices')
    .select('id')
    .eq('device_id', device_id)
    .single()) as SupabaseSingle<Pick<DeviceRow, 'id'>>

  if (existing) {
    return NextResponse.json(
      { error: 'Device already registered', code: 'DEVICE_EXISTS' },
      { status: 409, headers: CORS_HEADERS }
    )
  }

  // 3. Hash secret
  const secret_hash = await hashSecret(secret)

  // 4. Insert device
  const { error: insertErr } = await mutate('hardware_devices').insert({
    device_id,
    secret_hash,
    product_type: product_type ?? 'AiDesk S1',
    location: location ?? null,
    wake_word: wake_word ?? 'hey_kiyanna',
    firmware: firmware ?? 'voice',
    status: 'offline',
  })

  if (insertErr) {
    console.error('[register] DB insert error:', insertErr)
    return NextResponse.json(
      { error: 'Failed to register device', code: 'DB_ERROR' },
      { status: 500, headers: CORS_HEADERS }
    )
  }

  // 5. Telegram alert
  await sendTelegramAlert(
    `🆕 <b>New Kiyanna device registered</b>\nDevice: <code>${device_id}</code>\nLocation: ${location ?? 'unknown'}\nProduct: ${product_type ?? 'AiDesk S1'}`
  )

  return NextResponse.json(
    {
      device_id,
      message: 'Device registered. Assign a subscription in the dashboard to activate.',
    },
    { status: 201, headers: CORS_HEADERS }
  )
}
