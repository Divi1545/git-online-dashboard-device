'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save, RotateCcw, Play, Cpu, Zap, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { LedIndicator } from '@/components/hardware/LedIndicator'

const DEFAULT_SYSTEM_PROMPT = `You are {personality_name}, an AI assistant by AI Code Agency. You are deployed at {device_name}.
You help guests, customers, and staff with questions, information, and requests.
Be concise — your responses will be converted to speech, so keep answers under 3 sentences unless more detail is essential.
Do not use markdown, bullet points, or any formatting — plain conversational text only.
Reply in the same language the user speaks.
Be professional and helpful.`

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'si', label: 'Sinhala' },
  { value: 'ar', label: 'Arabic' },
  { value: 'zh', label: 'Chinese (Mandarin)' },
  { value: 'de', label: 'German' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' },
  { value: 'ta', label: 'Tamil' },
]

interface DeviceProgramClientProps {
  device: {
    id: string
    device_id: string
    product_type: string
    location: string | null
    status: 'online' | 'offline' | 'lapsed'
    personality_name: string | null
    system_prompt: string | null
    ai_model: string | null
    default_language: string | null
    wake_word: string | null
    config_version: number | null
    config_updated_at: string | null
  }
}

export function DeviceProgramClient({ device }: DeviceProgramClientProps) {
  const router = useRouter()

  // Form state — initialise from DB values
  const [personalityName, setPersonalityName] = useState(device.personality_name ?? 'Kiyanna')
  const [wakeWord, setWakeWord] = useState(device.wake_word ?? 'hey_kiyanna')
  const [aiModel, setAiModel] = useState<string>(device.ai_model ?? 'claude-haiku-4-5')
  const [defaultLanguage, setDefaultLanguage] = useState<string>(device.default_language ?? 'en')
  const [systemPrompt, setSystemPrompt] = useState(device.system_prompt ?? DEFAULT_SYSTEM_PROMPT)

  // Save state
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<'success' | 'error' | null>(null)
  const [savedVersion, setSavedVersion] = useState(device.config_version ?? 1)

  // Test console state
  const [testMessage, setTestMessage] = useState('')
  const [testing, setTesting] = useState(false)
  const [testReply, setTestReply] = useState<string | null>(null)
  const [testError, setTestError] = useState<string | null>(null)

  function resetToDefault() {
    setSystemPrompt(DEFAULT_SYSTEM_PROMPT)
  }

  async function handleSave() {
    setSaving(true)
    setSaveResult(null)
    try {
      const res = await fetch(`/api/admin/device/${device.id}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personality_name: personalityName,
          wake_word: wakeWord,
          ai_model: aiModel,
          default_language: defaultLanguage,
          system_prompt: systemPrompt === DEFAULT_SYSTEM_PROMPT ? null : systemPrompt,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      const data = await res.json()
      setSavedVersion(data.config_version)
      setSaveResult('success')
      router.refresh()
    } catch {
      setSaveResult('error')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveResult(null), 3000)
    }
  }

  async function handleTest() {
    if (!testMessage.trim()) return
    setTesting(true)
    setTestReply(null)
    setTestError(null)
    try {
      const res = await fetch(`/api/admin/device/${device.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: testMessage,
          system_prompt: systemPrompt,
          ai_model: aiModel,
          personality_name: personalityName,
          device_name: device.location ?? device.device_id,
        }),
      })
      if (!res.ok) throw new Error('Test failed')
      const data = await res.json()
      setTestReply(data.reply)
    } catch {
      setTestError('Test failed — check API keys and try again.')
    } finally {
      setTesting(false)
    }
  }

  const previewPrompt = systemPrompt
    .replace(/\{device_name\}/g, device.location ?? device.device_id)
    .replace(/\{personality_name\}/g, personalityName)

  const statusConfig = {
    online: 'bg-teal-600/20 text-teal-400 border-teal-600/30',
    offline: 'bg-red-500/20 text-red-400 border-red-500/30',
    lapsed: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href={`/dashboard/device/${device.id}`}>
          <Button variant="ghost" size="sm" className="text-white/50 hover:text-white p-0">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Device
          </Button>
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <LedIndicator status={device.status} size="md" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">Program Device</h1>
              <Badge className="text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30">Admin</Badge>
            </div>
            <p className="text-white/40 text-sm">
              {device.product_type}
              {device.location && <span> — {device.location}</span>}
              <span className="font-mono ml-2">{device.device_id}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={`text-xs border ${statusConfig[device.status]}`}>
            {device.status.toUpperCase()}
          </Badge>
          <span className="text-white/30 text-xs">Config v{savedVersion}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — Config Form */}
        <div className="lg:col-span-2 space-y-4">

          {/* Personality Card */}
          <Card className="bg-[#1A1A1A] border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-white/70 flex items-center gap-2">
                <Cpu className="w-4 h-4" />
                AI Personality
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-white/50">Personality Name</label>
                  <Input
                    value={personalityName}
                    onChange={(e) => setPersonalityName(e.target.value)}
                    placeholder="Kiyanna"
                    className="bg-[#0A0A0A] border-white/10 text-white placeholder:text-white/20 focus:border-teal-600/50"
                  />
                  <p className="text-[11px] text-white/30">The AI&apos;s name. Use <code className="text-teal-400/70">{'{personality_name}'}</code> in your prompt.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-white/50">Wake Word</label>
                  <Input
                    value={wakeWord}
                    onChange={(e) => setWakeWord(e.target.value)}
                    placeholder="hey_kiyanna"
                    className="bg-[#0A0A0A] border-white/10 text-white placeholder:text-white/20 focus:border-teal-600/50 font-mono"
                  />
                  <p className="text-[11px] text-white/30">Trigger phrase (no spaces, use underscores)</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs text-white/50">AI Model</label>
                  <Select value={aiModel} onValueChange={(v) => { if (v) setAiModel(v) }}>
                    <SelectTrigger className="bg-[#0A0A0A] border-white/10 text-white focus:border-teal-600/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1A1A1A] border-white/10 text-white">
                      <SelectItem value="claude-haiku-4-5" className="focus:bg-white/5 focus:text-white">
                        <div>
                          <span>claude-haiku-4-5</span>
                          <span className="ml-2 text-xs text-teal-400">Fast · Cheap</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="claude-sonnet-4-6" className="focus:bg-white/5 focus:text-white">
                        <div>
                          <span>claude-sonnet-4-6</span>
                          <span className="ml-2 text-xs text-amber-400">Smart · Premium</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-white/30">Haiku recommended for voice devices</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-white/50">Default Language</label>
                  <Select value={defaultLanguage} onValueChange={(v) => { if (v) setDefaultLanguage(v) }}>
                    <SelectTrigger className="bg-[#0A0A0A] border-white/10 text-white focus:border-teal-600/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#1A1A1A] border-white/10 text-white max-h-60">
                      {LANGUAGES.map((lang) => (
                        <SelectItem key={lang.value} value={lang.value} className="focus:bg-white/5 focus:text-white">
                          {lang.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* System Prompt Card */}
          <Card className="bg-[#1A1A1A] border-white/10">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-white/70 flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  System Prompt
                </CardTitle>
                <button
                  onClick={resetToDefault}
                  className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset to default
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={12}
                className="w-full bg-[#0A0A0A] border border-white/10 rounded-md px-3 py-2 text-sm text-white/80 font-mono resize-y focus:outline-none focus:border-teal-600/50 placeholder:text-white/20 leading-relaxed"
                placeholder="Write your system prompt here..."
                spellCheck={false}
              />
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-white/30">
                  Use <code className="text-teal-400/70">{'{personality_name}'}</code> and <code className="text-teal-400/70">{'{device_name}'}</code> as dynamic variables
                </p>
                <span className="text-[11px] text-white/30">{systemPrompt.length} chars</span>
              </div>

              {/* Live preview of substituted prompt */}
              <details className="group">
                <summary className="text-[11px] text-white/30 cursor-pointer hover:text-white/50 select-none">
                  Preview with variables filled in ▾
                </summary>
                <div className="mt-2 bg-[#0A0A0A] border border-white/5 rounded-md p-3 text-[11px] text-white/40 font-mono whitespace-pre-wrap leading-relaxed">
                  {previewPrompt}
                </div>
              </details>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleSave}
              disabled={saving}
              className="bg-teal-600 hover:bg-teal-700 text-white px-6"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save &amp; Deploy
                </>
              )}
            </Button>
            {saveResult === 'success' && (
              <span className="flex items-center gap-1.5 text-sm text-teal-400">
                <CheckCircle2 className="w-4 h-4" />
                Saved — device will reload config on next boot
              </span>
            )}
            {saveResult === 'error' && (
              <span className="flex items-center gap-1.5 text-sm text-red-400">
                <AlertCircle className="w-4 h-4" />
                Save failed — try again
              </span>
            )}
          </div>
        </div>

        {/* Right — Test Console */}
        <div className="space-y-4">
          <Card className="bg-[#1A1A1A] border-white/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-white/70 flex items-center gap-2">
                <Play className="w-4 h-4" />
                Test Console
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-white/40">
                Preview how the device will respond using the current prompt (no need to save first).
              </p>

              <textarea
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                rows={3}
                placeholder="e.g. What time is breakfast?"
                className="w-full bg-[#0A0A0A] border border-white/10 rounded-md px-3 py-2 text-sm text-white/80 resize-none focus:outline-none focus:border-teal-600/50 placeholder:text-white/20"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleTest()
                }}
              />
              <p className="text-[11px] text-white/20">⌘+Enter to test</p>

              <Button
                onClick={handleTest}
                disabled={testing || !testMessage.trim()}
                variant="outline"
                className="w-full border-white/10 text-white/70 hover:text-white hover:bg-white/5"
              >
                {testing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Asking {personalityName}...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Test Response
                  </>
                )}
              </Button>

              {testReply && (
                <div className="bg-teal-600/10 border border-teal-600/20 rounded-md p-3">
                  <p className="text-[11px] text-teal-400/70 mb-1 font-medium">{personalityName} says:</p>
                  <p className="text-sm text-white/80 leading-relaxed">{testReply}</p>
                </div>
              )}

              {testError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-md p-3">
                  <p className="text-sm text-red-400">{testError}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Config Info */}
          <Card className="bg-[#1A1A1A] border-white/10">
            <CardContent className="pt-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-white/40">Config Version</span>
                <span className="text-white/70 font-mono">v{savedVersion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Device ID</span>
                <span className="text-white/70 font-mono text-[11px]">{device.device_id}</span>
              </div>
              {device.config_updated_at && (
                <div className="flex justify-between">
                  <span className="text-white/40">Last Updated</span>
                  <span className="text-white/70">
                    {new Date(device.config_updated_at).toLocaleDateString()}
                  </span>
                </div>
              )}
              <div className="pt-2 border-t border-white/5 text-[11px] text-white/30 leading-relaxed">
                Device fetches config on boot via <code className="text-teal-400/60">GET /api/device/config</code>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
