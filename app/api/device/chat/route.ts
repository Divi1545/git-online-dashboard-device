export const runtime = 'nodejs'
export const maxDuration = 60  // audio transcription + Claude response

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { extractBearerToken, verifyDeviceToken } from '@/lib/device-auth'
import { getAdminClient } from '@/lib/supabase-admin'
import { callIslandLoaf, hasIslandLoafDevice } from '@/lib/islandloaf'
import type { DeviceRow, SupabaseSingle } from '@/types/database'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

async function localizeForSpeech(message: string, userSpeech: string): Promise<string> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      system: 'Say the supplied message naturally and briefly in the same language the user used. Output only the spoken response.',
      messages: [{ role: 'user', content: `User said: ${userSpeech}\nMessage: ${message}` }],
    })
    const block = response.content.find((item) => item.type === 'text')
    return block?.type === 'text' && block.text.trim() ? block.text.trim() : message
  } catch {
    return message
  }
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

  // 2. Parse body
  let body: { audio_base64: string; device_id: string; language?: string; pending_confirmation?: string }
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

  // 3. Transcribe audio with Groq Whisper (free, 20 RPM, much faster than OpenAI)
  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) {
    console.error('[chat] GROQ_API_KEY not set in git-online-dashboard-device project')
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
    formData.append('model', 'whisper-large-v3-turbo')
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
      console.error(`[chat] Groq ${whisperRes.status}: ${errText.slice(0, 200)}`)
      return NextResponse.json(
        { error: 'Transcription failed', code: 'STT_ERROR', status: whisperRes.status },
        { status: 500, headers: CORS_HEADERS }
      )
    }

    const whisperData = await whisperRes.json()
    transcript = (whisperData.text ?? '').trim()
  } catch (err) {
    console.error('[chat] Groq exception:', err)
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

  // A pending write is never executed from the original request. The device
  // must send the short-lived token on the next voice turn and the user must
  // explicitly confirm it in any language.
  if (body.pending_confirmation && hasIslandLoafDevice(devicePayload.device_id)) {
    try {
      const decision = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8,
        system: 'Classify whether the user explicitly confirms or cancels a proposed action. Understand every language. Reply with exactly CONFIRM, CANCEL, or UNCLEAR.',
        messages: [{ role: 'user', content: transcript }],
      })
      const decisionText = decision.content[0]?.type === 'text' ? decision.content[0].text.trim() : 'UNCLEAR'

      if (decisionText === 'CONFIRM') {
        const executed = await callIslandLoaf(devicePayload.device_id, '/api/kiyanna/actions/execute', {
          confirmationToken: body.pending_confirmation,
        })
        const resultMessage = typeof executed.message === 'string'
          ? executed.message
          : 'The confirmed change was completed and the hotel dashboard was notified.'
        const reply = await localizeForSpeech(resultMessage, transcript)
        const baseUrl = `https://${req.headers.get('host')}`
        return NextResponse.json(
          { text: reply, audio_url: `${baseUrl}/api/device/tts?text=${encodeURIComponent(reply)}`, language: body.language ?? 'en', pending_confirmation: '' },
          { status: 200, headers: CORS_HEADERS }
        )
      }

      if (decisionText === 'CANCEL') {
        const reply = await localizeForSpeech('Cancelled. I did not change the hotel dashboard.', transcript)
        const baseUrl = `https://${req.headers.get('host')}`
        return NextResponse.json(
          { text: reply, audio_url: `${baseUrl}/api/device/tts?text=${encodeURIComponent(reply)}`, language: body.language ?? 'en', pending_confirmation: '' },
          { status: 200, headers: CORS_HEADERS }
        )
      }

      const reply = await localizeForSpeech('Please clearly say confirm or cancel.', transcript)
      const baseUrl = `https://${req.headers.get('host')}`
      return NextResponse.json(
        { text: reply, audio_url: `${baseUrl}/api/device/tts?text=${encodeURIComponent(reply)}`, language: body.language ?? 'en', pending_confirmation: body.pending_confirmation },
        { status: 200, headers: CORS_HEADERS }
      )
    } catch (err) {
      console.error('[chat] Island Loaf confirmation error:', err)
      return NextResponse.json(
        { error: 'Could not complete the hotel dashboard action', code: 'ISLANDLOAF_ERROR' },
        { status: 502, headers: CORS_HEADERS }
      )
    }
  }

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

  const islandLoafEnabled = hasIslandLoafDevice(devicePayload.device_id)
  const systemPrompt = `You are Kiyanna, an AI assistant by AI Code Agency. You are deployed at ${deviceName}.
Help guests, customers, and staff with questions, information, and requests.
Respond naturally in one short sentence whenever possible. Your response is spoken aloud, so answer immediately without filler.
Do not use markdown, bullet points, or any formatting — plain conversational text only.
${islandLoafEnabled ? 'Use Island Loaf tools for real hotel data and dashboard requests. Never claim an action succeeded unless a tool says it did. Writes only prepare a change; ask the user to confirm it.' : ''}
${langNote}
Plan: ${devicePayload.plan}. Be professional and helpful.`

  // 5. Call Claude Haiku for the AI response
  let reply = ''
  let pendingConfirmation = ''
  try {
    const tools: Anthropic.Tool[] = islandLoafEnabled ? [
      {
        name: 'islandloaf_read',
        description: 'Read real hotel dashboard data, bookings, services, or notifications.',
        input_schema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['get_dashboard_summary', 'list_bookings', 'list_services', 'list_notifications'] },
            status: { type: 'string', enum: ['pending', 'confirmed', 'completed', 'cancelled', 'refunded'] },
            limit: { type: 'number' },
            availableOnly: { type: 'boolean' },
          },
          required: ['action'],
        },
      },
      {
        name: 'islandloaf_prepare_booking_request',
        description: 'Prepare a new pending hotel booking request. This requires spoken confirmation before execution.',
        input_schema: {
          type: 'object',
          properties: {
            serviceId: { type: 'number' },
            customerName: { type: 'string' },
            customerEmail: { type: 'string' },
            startDate: { type: 'string', description: 'YYYY-MM-DD' },
            endDate: { type: 'string', description: 'YYYY-MM-DD' },
            totalPrice: { type: 'number' },
            notes: { type: 'string' },
          },
          required: ['serviceId', 'customerName', 'startDate', 'endDate', 'totalPrice'],
        },
      },
    ] : []

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 180,
      system: systemPrompt,
      messages: [{ role: 'user', content: transcript }],
      tools,
    })

    const toolUse = response.content.find((block) => block.type === 'tool_use')
    if (toolUse?.type === 'tool_use') {
      let toolResult: Record<string, unknown>
      if (toolUse.name === 'islandloaf_read') {
        toolResult = await callIslandLoaf(devicePayload.device_id, '/api/kiyanna/read', toolUse.input as Record<string, unknown>)
      } else if (toolUse.name === 'islandloaf_prepare_booking_request') {
        toolResult = await callIslandLoaf(devicePayload.device_id, '/api/kiyanna/actions/prepare', {
          action: 'create_booking_request',
          ...(toolUse.input as Record<string, unknown>),
        })
        pendingConfirmation = typeof toolResult.confirmationToken === 'string' ? toolResult.confirmationToken : ''
      } else throw new Error(`Unsupported Island Loaf tool: ${toolUse.name}`)

      const finalResponse = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 160,
        system: `${systemPrompt}\nExplain this tool result briefly in the user's language. If it requires confirmation, clearly ask the user to confirm or cancel.`,
        messages: [
          { role: 'user', content: transcript },
          { role: 'assistant', content: response.content },
          { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(toolResult) }] },
        ],
      })
      const finalText = finalResponse.content.find((block) => block.type === 'text')
      reply = finalText?.type === 'text' ? finalText.text : ''
    } else {
      const block = response.content.find((item) => item.type === 'text')
      reply = block?.type === 'text' ? block.text : ''
    }
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

  // 6. Build TTS URL. The device logs the completed conversation separately,
  // so do not delay the spoken response with a second database write here.
  const baseUrl = `https://${req.headers.get('host')}`
  const audioUrl = `${baseUrl}/api/device/tts?text=${encodeURIComponent(reply)}`

  return NextResponse.json(
    { text: reply, audio_url: audioUrl, language: body.language ?? 'en', pending_confirmation: pendingConfirmation },
    { status: 200, headers: CORS_HEADERS }
  )
}
