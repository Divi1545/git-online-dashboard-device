export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, mutate } from '@/lib/supabase-admin'
import { verifyDeviceToken, extractBearerToken } from '@/lib/device-auth'
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

  let body: {
    device_id?: string
    session_id?: string
    language?: string
    duration_s?: number
    message_count?: number
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON', code: 'BAD_REQUEST' },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  if (!body.session_id) {
    return NextResponse.json(
      { error: 'session_id is required', code: 'BAD_REQUEST' },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  const db = getAdminClient()

  // Resolve device UUID from device_id string
  const { data: device } = (await db
    .from('hardware_devices')
    .select('id')
    .eq('device_id', claims.device_id)
    .single()) as SupabaseSingle<Pick<DeviceRow, 'id'>>

  if (!device) {
    return NextResponse.json(
      { error: 'Device not found', code: 'DEVICE_NOT_FOUND' },
      { status: 404, headers: CORS_HEADERS }
    )
  }

  const { error: insertErr } = await mutate('hardware_conversations').insert({
    device_id: device.id,
    session_id: body.session_id,
    language: body.language ?? 'en',
    duration_s: body.duration_s ?? 0,
    message_count: body.message_count ?? 0,
  })

  if (insertErr) {
    console.error('[conversation] DB insert error:', insertErr)
    return NextResponse.json(
      { error: 'Failed to log conversation', code: 'DB_ERROR' },
      { status: 500, headers: CORS_HEADERS }
    )
  }

  return NextResponse.json({ ok: true }, { status: 200, headers: CORS_HEADERS })
}
