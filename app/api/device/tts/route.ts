export const runtime = 'nodejs'
export const maxDuration = 30

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

// Downsample 16-bit mono PCM from srcRate Hz to dstRate Hz (linear interpolation)
function resamplePCM(pcm: Buffer, srcRate: number, dstRate: number): Buffer {
  if (srcRate === dstRate) return pcm
  const srcSamples = pcm.length / 2
  const dstSamples = Math.floor(srcSamples * dstRate / srcRate)
  const out = Buffer.alloc(dstSamples * 2)
  const ratio = srcRate / dstRate
  for (let i = 0; i < dstSamples; i++) {
    const pos = i * ratio
    const idx = Math.floor(pos)
    const frac = pos - idx
    const s0 = pcm.readInt16LE(Math.min(idx, srcSamples - 1) * 2)
    const s1 = pcm.readInt16LE(Math.min(idx + 1, srcSamples - 1) * 2)
    const sample = Math.round(s0 + frac * (s1 - s0))
    out.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), i * 2)
  }
  return out
}

// Wrap raw 16-bit mono PCM into a WAV file
function buildWav(pcm: Buffer, sampleRate: number): Buffer {
  const dataSize = pcm.length
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataSize, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)           // PCM chunk size
  header.writeUInt16LE(1, 20)            // PCM format
  header.writeUInt16LE(1, 22)            // mono
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28) // byte rate
  header.writeUInt16LE(2, 32)            // block align
  header.writeUInt16LE(16, 34)           // bits per sample
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

  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    console.error('[tts] OPENAI_API_KEY not set')
    return NextResponse.json({ error: 'TTS not configured' }, { status: 503, headers: CORS_HEADERS })
  }

  // Generate TTS via OpenAI — returns 24kHz WAV
  const ttsRes = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
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
    console.error(`[tts] OpenAI ${ttsRes.status}: ${err.slice(0, 200)}`)
    return NextResponse.json({ error: 'TTS generation failed' }, { status: 502, headers: CORS_HEADERS })
  }

  const rawBytes = Buffer.from(await ttsRes.arrayBuffer())

  // OpenAI WAV is 24kHz 16-bit mono — strip the 44-byte header, resample to 16kHz
  // (ESP32 I2S is configured at 16kHz SAMPLE_RATE in config.h)
  const pcm24k = rawBytes.subarray(44)  // skip WAV header
  const pcm16k = resamplePCM(pcm24k, 24000, 16000)
  const wav16k = buildWav(pcm16k, 16000)

  return new NextResponse(new Uint8Array(wav16k), {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'audio/wav',
      'Content-Length': wav16k.length.toString(),
      'Cache-Control': 'no-store',
    },
  })
}
