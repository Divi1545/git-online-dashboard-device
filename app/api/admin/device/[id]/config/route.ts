export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getAdminClient, mutate } from '@/lib/supabase-admin'
import type { DeviceRow, SupabaseSingle } from '@/types/database'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // 1. Verify admin
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  let body: {
    personality_name?: string
    system_prompt?: string | null
    ai_model?: string
    default_language?: string
    wake_word?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const db = getAdminClient()

  // 2. Verify device exists
  const { data: device } = (await db
    .from('hardware_devices')
    .select('id, config_version')
    .eq('id', params.id)
    .single()) as SupabaseSingle<Pick<DeviceRow, 'id' | 'config_version'>>

  if (!device) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 })
  }

  // 3. Save config — increment version so device knows to reload
  const newVersion = (device.config_version ?? 1) + 1
  const { error } = await mutate('hardware_devices')
    .update({
      personality_name: body.personality_name ?? 'Kiyanna',
      system_prompt: body.system_prompt ?? null,
      ai_model: body.ai_model ?? 'claude-haiku-4-5',
      default_language: body.default_language ?? 'en',
      wake_word: body.wake_word ?? 'hey_kiyanna',
      config_version: newVersion,
      config_updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)

  if (error) {
    console.error('[admin/config] DB error:', error)
    return NextResponse.json({ error: 'Failed to save config' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, config_version: newVersion })
}
