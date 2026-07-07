/**
 * Browser WebRTC client for OpenAI Realtime voice.
 *
 * Ported and generalized from the rileyjarvis pattern. Framework-agnostic —
 * usable from Authority13's dashboard or a device kiosk page. It:
 *   1. asks a token endpoint for an ephemeral OpenAI client secret,
 *   2. opens a WebRTC peer connection, publishes the mic, plays back audio,
 *   3. surfaces connection state, mood, and transcripts via callbacks.
 *
 * The token endpoint (never the OpenAI key) is the only server dependency.
 */

export type RealtimeConnectionState = 'idle' | 'connecting' | 'connected' | 'error'
export type RealtimeMood = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error'

export interface RealtimeTranscript {
  role: 'user' | 'assistant'
  text: string
  at: string
}

export interface RealtimeClientCallbacks {
  onConnectionState?: (state: RealtimeConnectionState) => void
  onMood?: (mood: RealtimeMood) => void
  onTranscript?: (entry: RealtimeTranscript) => void
  onAudioLevel?: (level: number) => void
  onError?: (message: string) => void
}

export interface RealtimeClientOptions {
  /** Endpoint that returns { token: string } — POSTed with tokenRequestBody */
  tokenEndpoint: string
  /** Extra headers for the token request (e.g. device Authorization) */
  tokenHeaders?: Record<string, string>
  /** Body sent to the token endpoint (persona overrides) */
  tokenRequestBody?: Record<string, unknown>
  callbacks?: RealtimeClientCallbacks
}

const REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls'

export class RealtimeVoiceClient {
  private pc: RTCPeerConnection | null = null
  private dc: RTCDataChannel | null = null
  private micStream: MediaStream | null = null
  private audioEl: HTMLAudioElement | null = null
  private audioContext: AudioContext | null = null
  private meterFrame = 0
  private assistantText = ''
  private readonly opts: RealtimeClientOptions

  constructor(opts: RealtimeClientOptions) {
    this.opts = opts
  }

  private cb = <K extends keyof RealtimeClientCallbacks>(
    name: K,
    ...args: Parameters<NonNullable<RealtimeClientCallbacks[K]>>
  ) => {
    const fn = this.opts.callbacks?.[name] as
      | ((...a: Parameters<NonNullable<RealtimeClientCallbacks[K]>>) => void)
      | undefined
    fn?.(...args)
  }

  async connect(): Promise<void> {
    if (this.pc) return
    this.cb('onConnectionState', 'connecting')
    this.cb('onMood', 'thinking')

    try {
      // 1. Mint an ephemeral token from our own server.
      const tokenRes = await fetch(this.opts.tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(this.opts.tokenHeaders ?? {}) },
        body: JSON.stringify(this.opts.tokenRequestBody ?? {}),
      })
      if (!tokenRes.ok) {
        throw new Error(`Token endpoint returned ${tokenRes.status}`)
      }
      const { token } = (await tokenRes.json()) as { token?: string }
      if (!token) throw new Error('Token endpoint did not return a token')

      // 2. WebRTC peer connection + mic + playback.
      const pc = new RTCPeerConnection()
      const audio = document.createElement('audio')
      audio.autoplay = true
      this.audioEl = audio

      pc.ontrack = (event) => {
        audio.srcObject = event.streams[0]
        this.startMeter(event.streams[0])
      }

      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      pc.addTrack(this.micStream.getAudioTracks()[0], this.micStream)

      const dc = pc.createDataChannel('oai-events')
      dc.addEventListener('open', () => {
        this.cb('onConnectionState', 'connected')
        this.cb('onMood', 'idle')
      })
      dc.addEventListener('message', (event) => this.handleServerEvent(String(event.data)))

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const sdpRes = await fetch(REALTIME_CALLS_URL, {
        method: 'POST',
        body: offer.sdp,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/sdp' },
      })
      if (!sdpRes.ok) {
        throw new Error(`Realtime call failed: ${sdpRes.status}`)
      }
      await pc.setRemoteDescription({ type: 'answer', sdp: await sdpRes.text() })

      this.pc = pc
      this.dc = dc
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.cb('onConnectionState', 'error')
      this.cb('onMood', 'error')
      this.cb('onError', message)
      this.disconnect()
    }
  }

  disconnect(): void {
    this.dc?.close()
    this.pc?.close()
    this.micStream?.getTracks().forEach((t) => t.stop())
    this.stopMeter()
    if (this.audioEl) this.audioEl.srcObject = null
    this.dc = null
    this.pc = null
    this.micStream = null
    this.audioEl = null
    this.assistantText = ''
    this.cb('onConnectionState', 'idle')
    this.cb('onMood', 'idle')
  }

  /** Send a typed message (optional — the device is voice-first). */
  sendText(text: string): void {
    if (this.dc?.readyState !== 'open') return
    this.cb('onTranscript', { role: 'user', text, at: nowLabel() })
    this.send({
      type: 'conversation.item.create',
      item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
    })
    this.send({ type: 'response.create' })
  }

  private handleServerEvent(raw: string): void {
    let event: { type?: string; delta?: string; transcript?: string }
    try {
      event = JSON.parse(raw)
    } catch {
      return
    }
    if (!event.type) return

    switch (event.type) {
      case 'input_audio_buffer.speech_started':
        this.cb('onMood', 'listening')
        break
      case 'input_audio_buffer.speech_stopped':
        this.cb('onMood', 'thinking')
        break
      case 'response.output_audio.delta':
      case 'response.audio.delta':
        this.cb('onMood', 'speaking')
        break
      case 'response.output_audio.done':
      case 'response.audio.done':
        this.cb('onMood', 'idle')
        break
      case 'response.output_audio_transcript.delta':
      case 'response.audio_transcript.delta':
      case 'response.output_text.delta':
        this.assistantText += event.delta ?? ''
        break
      case 'conversation.item.input_audio_transcription.completed':
        if (event.transcript) {
          this.cb('onTranscript', { role: 'user', text: event.transcript, at: nowLabel() })
        }
        break
      case 'response.done':
        if (this.assistantText) {
          this.cb('onTranscript', { role: 'assistant', text: this.assistantText, at: nowLabel() })
          this.assistantText = ''
        }
        break
    }
  }

  private send(event: Record<string, unknown>): void {
    if (this.dc?.readyState === 'open') this.dc.send(JSON.stringify(event))
  }

  private startMeter(stream: MediaStream): void {
    this.stopMeter()
    const ctx = new AudioContext()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    this.audioContext = ctx
    const samples = new Uint8Array(analyser.fftSize)
    const tick = () => {
      analyser.getByteTimeDomainData(samples)
      let total = 0
      for (let i = 0; i < samples.length; i += 1) {
        const c = (samples[i] - 128) / 128
        total += c * c
      }
      this.cb('onAudioLevel', Math.min(1, Math.sqrt(total / samples.length) * 10))
      this.meterFrame = requestAnimationFrame(tick)
    }
    tick()
  }

  private stopMeter(): void {
    if (this.meterFrame) cancelAnimationFrame(this.meterFrame)
    this.meterFrame = 0
    void this.audioContext?.close()
    this.audioContext = null
  }
}

function nowLabel(): string {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
