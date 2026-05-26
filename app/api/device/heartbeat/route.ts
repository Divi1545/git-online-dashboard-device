export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, mutate } from '@/lib/supabase-admin'
import { verifyDeviceToken, extractBearerToken } from '@/lib/device-auth'
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
  const token = extractBearerToken(req.headers.get('authorization'))
  if (!token) {
    return NextResponse.json(
      { error: 'Missing authorization token', code: 'UNAUTHORIZED' },
      { status: 401, headers: CORS_HEADERS }
    )
  }

  let claims
  try {
    claims = verifyDeviceToken(token)
  } catch {
    return NextResponse.json(
      { error: 'Invalid or expired token', code: 'TOKEN_INVALID' },
      { status: 401, headers: CORS_HEADERS }
    )
  }

  let body: { device_id?: string; status?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON', code: 'BAD_REQUEST' },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  const newStatus = body.status ?? 'idle'
  const db = getAdminClient()

  // Fetch current device to detect offline >1h scenario
  const { data: device } = (await db
    .from('hardware_devices')
    .select('status, last_seen, location')
    .eq('device_id', claims.device_id)
    .single()) as SupabaseSingle<Pick<DeviceRow, 'status' | 'last_seen' | 'location'>>

  if (device) {
    const wasOnline = device.status === 'online'
    const lastSeen = device.last_seen ? new Date(device.last_seen) : null
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

    if (wasOnline && lastSeen && lastSeen < oneHourAgo) {
      await sendTelegramAlert(
        `📴 <b>Device went offline</b>\nDevice: <code>${claims.device_id}</code>\nLocation: ${device.location ?? 'unknown'}\nLast seen: ${lastSeen.toISOString()}`
      )
    }
  }

  await mutate('hardware_devices')
    .update({ status: newStatus, last_seen: new Date().toISOString() })
    .eq('device_id', claims.device_id)

  return NextResponse.json({ ok: true }, { status: 200, headers: CORS_HEADERS })
}
