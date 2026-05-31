export const runtime = 'nodejs'
export const maxDuration = 30

import { NextRequest, NextResponse } from 'next/server'
import { extractBearerToken, verifyDeviceToken } from '@/lib/device-auth'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// ElevenLabs voice ID — "Rachel" (clear, natural English)
const ELEVENLABS_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

// Wrap raw 16-bit mono PCM into a WAV file
function buildWav(pcm: Buffer, sampleRate: number): Buffer {
  const dataSize = pcm.length
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataSize, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)            // PCM
  header.writeUInt16LE(1, 22)            // mono
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)           // 16-bit
  header.write('data', 36)
  header.writeUInt32LE(dataSize, 40)
  return Buffer.concat([header, pcm])
}

export async function GET(req: NextRequest) {
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

  const elevenKey = process.env.ELEVENLABS_API_KEY

  // ── ElevenLabs TTS (free tier — sign up at elevenlabs.io) ─────────────────
  if (elevenKey) {
    // pcm_16000 = raw 16-bit mono PCM at 16kHz — exactly what the ESP32 I2S expects
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}?output_format=pcm_16000`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': elevenKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    )

    if (res.ok) {
      const pcm = Buffer.from(await res.arrayBuffer())
      const wav = buildWav(pcm, 16000)
      return new NextResponse(new Uint8Array(wav), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' },
      })
    }

    const err = await res.text()
    console.error(`[tts] ElevenLabs ${res.status}: ${err.slice(0, 200)}`)
    // fall through to OpenAI backup
  }

  // ── OpenAI TTS fallback (if OPENAI_API_KEY set) ───────────────────────────
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    console.error('[tts] No TTS key — set ELEVENLABS_API_KEY or OPENAI_API_KEY')
    return NextResponse.json({ error: 'TTS not configured' }, { status: 503, headers: CORS_HEADERS })
  }

  const ttsRes = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'tts-1', voice: 'nova', input: text, response_format: 'wav' }),
  })

  if (!ttsRes.ok) {
    const err = await ttsRes.text()
    console.error(`[tts] OpenAI ${ttsRes.status}: ${err.slice(0, 200)}`)
    return NextResponse.json({ error: 'TTS generation failed' }, { status: 502, headers: CORS_HEADERS })
  }

  // OpenAI returns 24kHz — downsample to 16kHz for ESP32 I2S
  const raw = Buffer.from(await ttsRes.arrayBuffer())
  const pcm24k = raw.subarray(44)  // strip WAV header
  const outSamples = Math.floor((pcm24k.length / 2) * 16000 / 24000)
  const pcm16k = Buffer.alloc(outSamples * 2)
  for (let i = 0; i < outSamples; i++) {
    const pos = i * 24000 / 16000
    const idx = Math.floor(pos)
    const frac = pos - idx
    const s0 = pcm24k.readInt16LE(Math.min(idx, pcm24k.length / 2 - 1) * 2)
    const s1 = pcm24k.readInt16LE(Math.min(idx + 1, pcm24k.length / 2 - 1) * 2)
    pcm16k.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s0 + frac * (s1 - s0)))), i * 2)
  }
  const wav16k = buildWav(pcm16k, 16000)

  return new NextResponse(new Uint8Array(wav16k), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' },
  })
}
