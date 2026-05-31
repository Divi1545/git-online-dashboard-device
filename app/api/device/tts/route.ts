export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { extractBearerToken, verifyDeviceToken } from '@/lib/device-auth'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(req: NextRequest) {
  // Validate device JWT
  const token = extractBearerToken(req.headers.get('Authorization'))
  if (!token) {
    return NextResponse.json({ error: 'Missing Authorization' }, { status: 401, headers: CORS_HEADERS })
  }
  try {
    verifyDeviceToken(token)
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401, headers: CORS_HEADERS })
  }

  const text = req.nextUrl.searchParams.get('text')?.trim()
  if (!text) {
    return NextResponse.json({ error: 'text param required' }, { status: 400, headers: CORS_HEADERS })
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'TTS not configured' }, { status: 503, headers: CORS_HEADERS })
  }

  // Generate TTS via OpenAI — wav format, 24kHz 16-bit mono (matches ESP32 speaker config)
  const ttsRes = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      voice: 'nova',
      input: text,
      response_format: 'wav',
    }),
  })

  if (!ttsRes.ok) {
    const err = await ttsRes.text()
    console.error('[tts] OpenAI error:', ttsRes.status, err)
    return NextResponse.json({ error: 'TTS generation failed' }, { status: 502, headers: CORS_HEADERS })
  }

  const audioBytes = await ttsRes.arrayBuffer()

  return new NextResponse(audioBytes, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'audio/wav',
      'Content-Length': audioBytes.byteLength.toString(),
      'Cache-Control': 'no-store',
    },
  })
}
