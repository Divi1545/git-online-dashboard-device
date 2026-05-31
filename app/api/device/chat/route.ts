export const runtime = 'nodejs'
export const maxDuration = 60  // audio transcription + Claude response

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { extractBearerToken, verifyDeviceToken } from '@/lib/device-auth'
import { getAdminClient, mutate } from '@/lib/supabase-admin'
import type { DeviceRow, SupabaseSingle } from '@/types/database'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: NextRequest) {
  // 1. Verify device JWT
  const token = extractBearerToken(req.headers.get('Authorization'))
  if (!token) {
    return NextResponse.json(
      { error: 'Missing Authorization header', code: 'UNAUTHORIZED' },
      { status: 401, headers: CORS_HEADERS }
    )
  }

  let devicePayload: ReturnType<typeof verifyDeviceToken>
  try {
    devicePayload = verifyDeviceToken(token)
  } catch {
    return NextResponse.json(
      { error: 'Invalid or expired token', code: 'TOKEN_INVALID' },
      { status: 401, headers: CORS_HEADERS }
    )
  }

  // 2. Parse body
  let body: { audio_base64: string; device_id: string; language?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON', code: 'BAD_REQUEST' },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  if (!body.audio_base64) {
    return NextResponse.json(
      { error: 'audio_base64 is required', code: 'BAD_REQUEST' },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  // 3. Transcribe audio with Groq Whisper (fast, free, not OpenAI)
  //    Groq API key: https://console.groq.com/keys (free account)
  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) {
    console.error('[chat] GROQ_API_KEY not set — add it to Vercel env vars')
    return NextResponse.json(
      { error: 'STT service not configured', code: 'CONFIG_ERROR' },
      { status: 500, headers: CORS_HEADERS }
    )
  }

  const audioBuffer = Buffer.from(body.audio_base64, 'base64')
  let transcript = ''

  try {
    const formData = new FormData()
    formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav')
    formData.append('model', 'whisper-large-v3-turbo')  // fastest Groq Whisper model
    if (body.language && body.language !== 'auto' && body.language !== 'en') {
      formData.append('language', body.language)
    }

    const whisperRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}` },
      body: formData,
    })

    if (!whisperRes.ok) {
      const errText = await whisperRes.text()
      console.error('[chat] Groq Whisper error:', whisperRes.status, errText)
      return NextResponse.json(
        { error: 'Transcription failed', code: 'STT_ERROR' },
        { status: 500, headers: CORS_HEADERS }
      )
    }

    const whisperData = await whisperRes.json()
    transcript = (whisperData.text ?? '').trim()
  } catch (err) {
    console.error('[chat] Groq Whisper exception:', err)
    return NextResponse.json(
      { error: 'Transcription service error', code: 'STT_ERROR' },
      { status: 500, headers: CORS_HEADERS }
    )
  }

  if (!transcript) {
    return NextResponse.json(
      { text: "I didn't catch that. Could you please speak again?", language: body.language ?? 'en' },
      { status: 200, headers: CORS_HEADERS }
    )
  }

  console.log(`[chat] Transcript (${devicePayload.device_id}): "${transcript}"`)

  // 4. Look up device for personalised system prompt
  const db = getAdminClient()
  const { data: device } = (await db
    .from('hardware_devices')
    .select('id, location, product_type')
    .eq('device_id', devicePayload.device_id)
    .single()) as SupabaseSingle<Pick<DeviceRow, 'id' | 'location' | 'product_type'>>

  const deviceName = device?.location ?? devicePayload.device_id
  const langNote =
    body.language && body.language !== 'auto' && body.language !== 'en'
      ? `The user may speak ${body.language} — reply in the same language they use.`
      : 'Reply in the same language the user speaks.'

  const systemPrompt = `You are Kiyanna, an AI assistant by AI Code Agency. You are deployed at ${deviceName}.
Help guests, customers, and staff with questions, information, and requests.
Be concise — your responses will be converted to speech, so keep answers under 3 sentences unless more detail is essential.
Do not use markdown, bullet points, or any formatting — plain conversational text only.
${langNote}
Plan: ${devicePayload.plan}. Be professional and helpful.`

  // 5. Call Claude Haiku for the AI response
  let reply = ''
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: transcript }],
    })
    const block = response.content[0]
    reply = block.type === 'text' ? block.text : ''
  } catch (err) {
    console.error('[chat] Claude error:', err)
    return NextResponse.json(
      { error: 'AI service error', code: 'CLAUDE_ERROR' },
      { status: 500, headers: CORS_HEADERS }
    )
  }

  if (!reply) {
    return NextResponse.json(
      { text: "I didn't catch that. Could you please repeat?", language: body.language ?? 'en' },
      { status: 200, headers: CORS_HEADERS }
    )
  }

  // 6. Log conversation (best-effort, non-blocking) — use UUID from device lookup
  if (device?.id) {
    try {
      const sessionId = `${devicePayload.device_id}-${Date.now()}`
      await mutate('hardware_conversations').insert({
        device_id: device.id,
        session_id: sessionId,
        language: body.language ?? 'en',
        duration_s: 0,
        message_count: 1,
      })
    } catch (err) {
      console.error('[chat] Conversation log error:', err)
    }
  }

  // 7. Build TTS URL — device downloads and plays this via I2S speaker
  const baseUrl = `https://${req.headers.get('host')}`
  const audioUrl = `${baseUrl}/api/device/tts?text=${encodeURIComponent(reply)}`

  return NextResponse.json(
    { text: reply, audio_url: audioUrl, language: body.language ?? 'en' },
    { status: 200, headers: CORS_HEADERS }
  )
}
