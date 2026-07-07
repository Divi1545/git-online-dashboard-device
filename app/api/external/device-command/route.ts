export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, mutate } from '@/lib/supabase-admin'
import type { DeviceRow, SupabaseSingle } from '@/types/database'

// Machine-to-machine device command endpoint (Authority13 mesh).
// "Commands" are config updates: devices poll /api/device/config and reload
// when config_version bumps, so updating config + bumping the version is the
// supported way to reprogram a device in the field.
//
// Only whitelisted config fields can be changed. Auth: x-admin-key, same
// model as /api/device/status.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: NextRequest) {
  const adminKey = req.headers.get('x-admin-key')
  if (!process.env.ADMIN_REGISTER_KEY || adminKey !== process.env.ADMIN_REGISTER_KEY) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED' },
      { status: 401, headers: CORS_HEADERS }
    )
  }

  let body: {
    device_id?: string
    personality_name?: string
    system_prompt?: string | null
    ai_model?: string
    default_language?: string
    wake_word?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS_HEADERS })
  }

  if (!body.device_id) {
    return NextResponse.json(
      { error: 'device_id is required' },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  const db = getAdminClient()
  const { data: device } = (await db
    .from('hardware_devices')
    .select('id, config_version, personality_name, system_prompt, ai_model, default_language, wake_word')
    .eq('device_id', body.device_id)
    .single()) as SupabaseSingle<
    Pick<
      DeviceRow,
      | 'id'
      | 'config_version'
      | 'personality_name'
      | 'system_prompt'
      | 'ai_model'
      | 'default_language'
      | 'wake_word'
    >
  >

  if (!device) {
    return NextResponse.json(
      { error: 'Device not found', code: 'DEVICE_NOT_FOUND' },
      { status: 404, headers: CORS_HEADERS }
    )
  }

  // Only overwrite fields the caller actually sent — partial updates keep
  // the rest of the device's config intact.
  const newVersion = (device.config_version ?? 1) + 1
  const { error } = await mutate('hardware_devices')
    .update({
      personality_name: body.personality_name ?? device.personality_name,
      system_prompt: body.system_prompt !== undefined ? body.system_prompt : device.system_prompt,
      ai_model: body.ai_model ?? device.ai_model,
      default_language: body.default_language ?? device.default_language,
      wake_word: body.wake_word ?? device.wake_word,
      config_version: newVersion,
      config_updated_at: new Date().toISOString(),
    })
    .eq('id', device.id)

  if (error) {
    console.error('[external/device-command] DB error:', error)
    return NextResponse.json(
      { error: 'Failed to apply command' },
      { status: 500, headers: CORS_HEADERS }
    )
  }

  return NextResponse.json(
    { ok: true, config_version: newVersion },
    { status: 200, headers: CORS_HEADERS }
  )
}
