export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { extractBearerToken, verifyDeviceToken } from '@/lib/device-auth'
import type { DeviceRow, SupabaseSingle } from '@/types/database'

// Realtime voice token for hardware devices.
//
// A device authenticates with its JWT (from /api/device/auth) and gets a
// short-lived OpenAI Realtime client secret. The device then opens a WebRTC
// call to OpenAI directly — the real OPENAI_API_KEY never leaves the server.
//
// The persona (personality, system prompt, language, voice) comes from the
// device's row, which Authority13 programs remotely via the mesh
// device-command endpoint. So Authority13 controls how every device talks.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL ?? 'gpt-realtime'
const DEFAULT_VOICE = process.env.OPENAI_REALTIME_VOICE ?? 'cedar'

const LANGUAGE_NAMES: Record<string, string> = { en: 'English', si: 'Sinhala', ta: 'Tamil' }

export function OPTIONS() {
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

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'Realtime voice not configured (OPENAI_API_KEY missing)', code: 'NOT_CONFIGURED' },
      { status: 503, headers: CORS_HEADERS }
    )
  }

  const db = getAdminClient()
  const { data: device } = (await db
    .from('hardware_devices')
    .select('personality_name, system_prompt, default_language, wake_word, product_type, location, status')
    .eq('device_id', claims.device_id)
    .single()) as SupabaseSingle<
    Pick<
      DeviceRow,
      | 'personality_name'
      | 'system_prompt'
      | 'default_language'
      | 'wake_word'
      | 'product_type'
      | 'location'
      | 'status'
    >
  >

  if (!device) {
    return NextResponse.json(
      { error: 'Device not found', code: 'DEVICE_NOT_FOUND' },
      { status: 404, headers: CORS_HEADERS }
    )
  }

  if (device.status === 'lapsed') {
    return NextResponse.json(
      { error: 'Device subscription is lapsed', code: 'SUBSCRIPTION_LAPSED' },
      { status: 402, headers: CORS_HEADERS }
    )
  }

  const name = device.personality_name || 'Kiyanna'
  const lang = device.default_language || 'en'
  const langLine = `\n\nAlways speak in ${LANGUAGE_NAMES[lang] ?? lang} unless the user switches languages first.`
  const instructions =
    (device.system_prompt ||
      `You are ${name}, a friendly AI assistant embedded in a ${device.product_type} device${device.location ? ` at ${device.location}` : ''}. Keep spoken replies short and natural.`) + langLine

  const sessionConfig = {
    type: 'realtime',
    model: REALTIME_MODEL,
    instructions,
    output_modalities: ['audio'],
    tool_choice: 'none',
    audio: {
      input: {
        turn_detection: {
          type: 'semantic_vad',
          eagerness: 'medium',
          create_response: true,
          interrupt_response: true,
        },
      },
      output: { voice: DEFAULT_VOICE },
    },
  }

  try {
    const res = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ session: sessionConfig }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[device/realtime-token] mint failed: ${res.status} ${text}`)
      return NextResponse.json(
        { error: 'Failed to mint realtime token', code: 'MINT_FAILED' },
        { status: 502, headers: CORS_HEADERS }
      )
    }

    const data = (await res.json()) as {
      value?: string
      expires_at?: number
      client_secret?: { value?: string; expires_at?: number }
    }
    const value = data.value ?? data.client_secret?.value
    if (!value) {
      return NextResponse.json(
        { error: 'No client secret returned', code: 'MINT_FAILED' },
        { status: 502, headers: CORS_HEADERS }
      )
    }

    return NextResponse.json(
      {
        token: value,
        expires_at: data.expires_at ?? data.client_secret?.expires_at ?? null,
        model: REALTIME_MODEL,
        persona: { name, voice: DEFAULT_VOICE, language: lang },
      },
      { status: 200, headers: CORS_HEADERS }
    )
  } catch (err) {
    console.error('[device/realtime-token] error:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: 'Realtime token error', code: 'ERROR' },
      { status: 502, headers: CORS_HEADERS }
    )
  }
}
