export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { extractBearerToken, verifyDeviceToken } from '@/lib/device-auth'
import type { DeviceRow, SupabaseSingle } from '@/types/database'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

// Called by device on boot (after /api/device/auth) to fetch its programming config
export async function GET(req: NextRequest) {
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

  const db = getAdminClient()
  const { data: device } = (await db
    .from('hardware_devices')
    .select('personality_name, system_prompt, ai_model, default_language, wake_word, config_version, config_updated_at, location, product_type')
    .eq('device_id', claims.device_id)
    .single()) as SupabaseSingle<Pick<
      DeviceRow,
      'personality_name' | 'system_prompt' | 'ai_model' | 'default_language' | 'wake_word' | 'config_version' | 'config_updated_at' | 'location' | 'product_type'
    >>

  if (!device) {
    return NextResponse.json(
      { error: 'Device not found', code: 'DEVICE_NOT_FOUND' },
      { status: 404, headers: CORS_HEADERS }
    )
  }

  return NextResponse.json(
    {
      personality_name: device.personality_name ?? 'Kiyanna',
      system_prompt: device.system_prompt ?? null,
      ai_model: device.ai_model ?? 'claude-haiku-4-5',
      default_language: device.default_language ?? 'en',
      wake_word: device.wake_word ?? 'hey_kiyanna',
      config_version: device.config_version ?? 1,
      config_updated_at: device.config_updated_at ?? null,
      device_name: device.location ?? claims.device_id,
    },
    { status: 200, headers: CORS_HEADERS }
  )
}
