export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { extractBearerToken, verifyDeviceToken } from '@/lib/device-auth'
import { getAdminClient, mutate } from '@/lib/supabase-admin'
import type { DeviceRow, ConversationRow, SupabaseSingle } from '@/types/database'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// Default system prompt used when no custom prompt is configured
function buildDefaultSystemPrompt(device_name: string, personality_name: string, plan: string, language?: string): string {
  const langNote = language && language !== 'en'
    ? `The user may speak ${language} — reply in the same language they use.`
    : 'Reply in the same language the user speaks.'

  return `You are ${personality_name}, an AI assistant by AI Code Agency. You are deployed at ${device_name}.
You help guests, customers, and staff with questions, information, and requests.
Be concise — your responses will be converted to speech, so keep answers under 3 sentences unless more detail is essential.
Do not use markdown, bullet points, or any formatting — plain conversational text only.
${langNote}
Plan: ${plan}. Be professional and helpful.`
}

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

  // 2. Parse request body
  let body: {
    text: string
    session_id?: string
    language?: string
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON', code: 'BAD_REQUEST' },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  const { text, session_id, language, history = [] } = body

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json(
      { error: 'text is required', code: 'BAD_REQUEST' },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  // 3. Look up device config from DB
  const db = getAdminClient()
  const { data: device } = (await db
    .from('hardware_devices')
    .select('location, product_type, personality_name, system_prompt, ai_model')
    .eq('device_id', devicePayload.device_id)
    .single()) as SupabaseSingle<Pick<DeviceRow, 'location' | 'product_type' | 'personality_name' | 'system_prompt' | 'ai_model'>>

  const device_name = device?.location ?? devicePayload.device_id
  const personality_name = device?.personality_name ?? 'Kiyanna'
  const ai_model = device?.ai_model ?? 'claude-haiku-4-5'

  // Use custom system prompt if set, otherwise build the default
  let systemPrompt: string
  if (device?.system_prompt) {
    systemPrompt = device.system_prompt
      .replace(/\{device_name\}/g, device_name)
      .replace(/\{personality_name\}/g, personality_name)
  } else {
    systemPrompt = buildDefaultSystemPrompt(device_name, personality_name, devicePayload.plan, language)
  }

  // 4. Build message history (max last 10 turns to stay within token budget)
  const recentHistory = history.slice(-10)
  const messages: Anthropic.MessageParam[] = [
    ...recentHistory,
    { role: 'user', content: text.trim() },
  ]

  // 5. Call Claude API using device's configured model
  let reply: string
  try {
    const response = await anthropic.messages.create({
      model: ai_model,
      max_tokens: 300,
      system: systemPrompt,
      messages,
    })

    const block = response.content[0]
    reply = block.type === 'text' ? block.text : ''
  } catch (err) {
    console.error('[claude/route] Anthropic API error:', err)
    return NextResponse.json(
      { error: 'AI service error', code: 'CLAUDE_ERROR' },
      { status: 502, headers: CORS_HEADERS }
    )
  }

  // 6. Log conversation turn to Supabase (best-effort)
  if (session_id) {
    try {
      const { data: existing } = (await db
        .from('hardware_conversations')
        .select('id, message_count')
        .eq('session_id', session_id)
        .single()) as SupabaseSingle<Pick<ConversationRow, 'id' | 'message_count'>>

      if (existing) {
        await mutate('hardware_conversations')
          .update({ message_count: existing.message_count + 1 })
          .eq('id', existing.id)
      } else {
        await mutate('hardware_conversations').insert({
          device_id: devicePayload.device_id,
          session_id,
          language: language ?? 'en',
          duration_s: 0,
          message_count: 1,
        })
      }
    } catch (err) {
      console.error('[claude/route] Conversation log error:', err)
      // non-fatal — device still gets the reply
    }
  }

  return NextResponse.json(
    {
      reply,
      model: ai_model,
      device_id: devicePayload.device_id,
    },
    { status: 200, headers: CORS_HEADERS }
  )
}
