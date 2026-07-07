export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'
import type { DeviceRow, SupabaseList } from '@/types/database'

// Fleet list for machine callers (Authority13's lib/kiyanna.ts calls
// GET /api/admin/devices with x-admin-key). Same auth model as
// /api/device/status/[device_id].

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(req: NextRequest) {
  const adminKey = req.headers.get('x-admin-key')
  if (!process.env.ADMIN_REGISTER_KEY || adminKey !== process.env.ADMIN_REGISTER_KEY) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 401, headers: CORS_HEADERS }
    )
  }

  const db = getAdminClient()
  const { data: devices, error } = (await db
    .from('hardware_devices')
    .select('id, device_id, product_type, personality_name, status, location, last_seen, firmware')
    .order('last_seen', { ascending: false })) as SupabaseList<
    Pick<
      DeviceRow,
      | 'id'
      | 'device_id'
      | 'product_type'
      | 'personality_name'
      | 'status'
      | 'location'
      | 'last_seen'
      | 'firmware'
    >
  >

  if (error) {
    console.error('[admin/devices] DB error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch devices' },
      { status: 500, headers: CORS_HEADERS }
    )
  }

  // Shape matches Authority13's KiyannaDevice type (lib/kiyanna.ts)
  const fleet = (devices ?? []).map((d) => ({
    id: d.id,
    device_id: d.device_id,
    name: d.personality_name || d.product_type,
    status: d.status,
    operator_name: d.location ?? undefined,
    last_seen: d.last_seen ?? undefined,
    firmware_version: d.firmware,
  }))

  return NextResponse.json({ devices: fleet }, { status: 200, headers: CORS_HEADERS })
}
