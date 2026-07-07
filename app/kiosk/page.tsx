'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Loader2 } from 'lucide-react'
import {
  RealtimeVoiceClient,
  type RealtimeConnectionState,
  type RealtimeMood,
  type RealtimeTranscript,
} from '@/lib/realtime-voice'

// Kiosk voice screen for hardware devices with a display (e.g. AiDesk S1).
//
// Provisioning: the device page is opened with ?device_id=...&secret=... once,
// which are cached in localStorage. On connect it exchanges them for a device
// JWT (/api/device/auth), then mints a realtime token (/api/device/realtime-token)
// and opens the WebRTC voice call. The device persona is whatever Authority13
// has programmed for it.

const MOOD_LABEL: Record<RealtimeMood, string> = {
  idle: 'Tap to talk',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking…',
  error: 'Something went wrong',
}

export default function KioskPage() {
  const [connState, setConnState] = useState<RealtimeConnectionState>('idle')
  const [mood, setMood] = useState<RealtimeMood>('idle')
  const [level, setLevel] = useState(0)
  const [transcript, setTranscript] = useState<RealtimeTranscript[]>([])
  const [error, setError] = useState<string | null>(null)
  const clientRef = useRef<RealtimeVoiceClient | null>(null)

  useEffect(() => {
    // Cache credentials from the provisioning URL on first load.
    const params = new URLSearchParams(window.location.search)
    const did = params.get('device_id')
    const secret = params.get('secret')
    if (did) localStorage.setItem('kiosk_device_id', did)
    if (secret) localStorage.setItem('kiosk_secret', secret)
    return () => clientRef.current?.disconnect()
  }, [])

  const getDeviceJwt = useCallback(async (): Promise<string> => {
    const device_id = localStorage.getItem('kiosk_device_id')
    const secret = localStorage.getItem('kiosk_secret')
    if (!device_id || !secret) {
      throw new Error('Device not provisioned — open this screen with ?device_id=…&secret=… once.')
    }
    const res = await fetch('/api/device/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id, secret }),
    })
    if (!res.ok) throw new Error('Device authentication failed')
    const data = (await res.json()) as { token?: string }
    if (!data.token) throw new Error('No device token returned')
    return data.token
  }, [])

  const connect = useCallback(async () => {
    setError(null)
    try {
      const jwt = await getDeviceJwt()
      const client = new RealtimeVoiceClient({
        tokenEndpoint: '/api/device/realtime-token',
        tokenHeaders: { Authorization: `Bearer ${jwt}` },
        callbacks: {
          onConnectionState: setConnState,
          onMood: setMood,
          onAudioLevel: setLevel,
          onError: (m) => setError(m),
          onTranscript: (t) => setTranscript((prev) => [...prev.slice(-6), t]),
        },
      })
      clientRef.current = client
      await client.connect()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setConnState('error')
    }
  }, [getDeviceJwt])

  function disconnect() {
    clientRef.current?.disconnect()
    clientRef.current = null
  }

  const connected = connState === 'connected'
  const connecting = connState === 'connecting'
  const ringScale = 1 + Math.min(level, 1) * 0.35

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0A0A0A] px-6 text-white">
      <button
        onClick={connected ? disconnect : connect}
        disabled={connecting}
        className="relative grid place-items-center"
        aria-label={connected ? 'Stop' : 'Start talking'}
      >
        <span
          className="absolute rounded-full bg-teal-500/20 transition-transform duration-100"
          style={{ width: 220, height: 220, transform: `scale(${connected ? ringScale : 1})` }}
        />
        <span
          className={`grid size-40 place-items-center rounded-full ${
            connected ? 'bg-teal-500' : mood === 'error' ? 'bg-red-500' : 'bg-[#1A1A1A]'
          }`}
        >
          {connecting ? (
            <Loader2 className="size-16 animate-spin text-teal-400" />
          ) : connected ? (
            <Mic className="size-16 text-[#07100b]" />
          ) : (
            <MicOff className="size-16 text-zinc-400" />
          )}
        </span>
      </button>

      <p className="mt-10 text-lg font-medium text-zinc-300">{MOOD_LABEL[mood]}</p>

      {error && <p className="mt-3 max-w-md text-center text-sm text-red-400">{error}</p>}

      <div className="mt-8 min-h-[4rem] w-full max-w-md space-y-2">
        {transcript.slice(-3).map((t, i) => (
          <p
            key={i}
            className={`text-sm ${t.role === 'user' ? 'text-zinc-500' : 'text-teal-300'}`}
          >
            <span className="font-semibold">{t.role === 'user' ? 'You' : 'Assistant'}:</span> {t.text}
          </p>
        ))}
      </div>
    </main>
  )
}
