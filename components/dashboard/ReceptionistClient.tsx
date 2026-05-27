'use client'

import { useState, useRef, useEffect } from 'react'
import { Bot, Send, Wifi, WifiOff, Clock, MessageSquare, Zap } from 'lucide-react'
import type { DeviceRow, SubscriptionRow, ConversationRow } from '@/types/database'

interface DeviceWithSub extends DeviceRow {
  hardware_subscriptions: Array<Pick<SubscriptionRow, 'plan' | 'status' | 'price_usd' | 'next_billing'>> | null
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ReceptionistClientProps {
  devices: DeviceWithSub[]
  conversations: ConversationRow[]
  isAdmin: boolean
  userId: string
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'si', label: 'Sinhala' },
  { value: 'ta', label: 'Tamil' },
]

export function ReceptionistClient({ devices, conversations }: ReceptionistClientProps) {
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(devices[0]?.device_id ?? '')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [language, setLanguage] = useState('en')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const selectedDevice = devices.find((d) => d.device_id === selectedDeviceId) ?? devices[0] ?? null
  const activeSub = selectedDevice?.hardware_subscriptions?.[0] ?? null
  const deviceConversations = conversations.filter((c) => c.device_id === selectedDeviceId)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  async function handleSend() {
    const text = inputText.trim()
    if (!text || isLoading || !selectedDeviceId) return

    const langHint = language !== 'en' ? ` [Respond in ${LANGUAGES.find((l) => l.value === language)?.label ?? language}]` : ''
    const userText = text + langHint

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setInputText('')
    setIsLoading(true)

    try {
      const res = await fetch('/api/dashboard/receptionist/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: selectedDeviceId,
          text: userText,
          history: messages,
        }),
      })
      const data = await res.json()
      if (res.ok && data.reply) {
        setMessages([...newMessages, { role: 'assistant', content: data.reply }])
      } else {
        setMessages([...newMessages, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }])
      }
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: 'Network error. Please try again.' }])
    } finally {
      setIsLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const statusColor = {
    online: 'text-teal-400 bg-teal-600/20 border-teal-600/30',
    offline: 'text-white/50 bg-white/10 border-white/20',
    lapsed: 'text-red-400 bg-red-500/20 border-red-500/30',
  }

  const subStatusColor = {
    active: 'text-teal-400 bg-teal-600/20 border-teal-600/30',
    lapsed: 'text-red-400 bg-red-500/20 border-red-500/30',
    cancelled: 'text-white/50 bg-white/10 border-white/20',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-white">AI Receptionist</h1>
        <p className="text-white/50 text-sm mt-1">Configure and test your Kiyanna AI receptionist</p>
      </div>

      {/* Top row — 3 cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Select Device */}
        <div className="bg-[#1A1A1A] border border-white/5 rounded-xl p-5 space-y-3">
          <p className="text-white/50 text-xs font-medium uppercase tracking-wider">Select Device</p>
          {devices.length === 0 ? (
            <p className="text-white/30 text-sm">No devices found</p>
          ) : (
            <select
              value={selectedDeviceId}
              onChange={(e) => {
                setSelectedDeviceId(e.target.value)
                setMessages([])
              }}
              className="w-full bg-[#0A0A0A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-600/50"
            >
              {devices.map((d) => (
                <option key={d.device_id} value={d.device_id}>
                  {d.device_id}{d.location ? ` — ${d.location}` : ''}
                </option>
              ))}
            </select>
          )}
          {selectedDevice && (
            <p className="text-white/30 text-xs">{selectedDevice.product_type}</p>
          )}
        </div>

        {/* Card 2: Device Status */}
        <div className="bg-[#1A1A1A] border border-white/5 rounded-xl p-5 space-y-3">
          <p className="text-white/50 text-xs font-medium uppercase tracking-wider">Device Status</p>
          {selectedDevice ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {selectedDevice.status === 'online' ? (
                  <Wifi className="w-4 h-4 text-teal-400" />
                ) : (
                  <WifiOff className="w-4 h-4 text-white/30" />
                )}
                <span
                  className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColor[selectedDevice.status]}`}
                >
                  {selectedDevice.status.charAt(0).toUpperCase() + selectedDevice.status.slice(1)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-white/40 text-xs">
                <Clock className="w-3.5 h-3.5" />
                <span>{timeAgo(selectedDevice.last_seen)}</span>
              </div>
              {activeSub && (
                <span className="inline-block text-xs px-2 py-0.5 rounded-full border text-teal-400 bg-teal-600/20 border-teal-600/30 font-medium capitalize">
                  {activeSub.plan}
                </span>
              )}
              {selectedDevice.location && (
                <p className="text-white/50 text-xs">{selectedDevice.location}</p>
              )}
            </div>
          ) : (
            <p className="text-white/30 text-sm">No device selected</p>
          )}
        </div>

        {/* Card 3: Subscription */}
        <div className="bg-[#1A1A1A] border border-white/5 rounded-xl p-5 space-y-3">
          <p className="text-white/50 text-xs font-medium uppercase tracking-wider">Subscription</p>
          {activeSub ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span className="text-white font-medium text-sm capitalize">{activeSub.plan}</span>
              </div>
              <p className="text-white/70 text-sm">${activeSub.price_usd}/mo</p>
              {activeSub.next_billing && (
                <p className="text-white/40 text-xs">
                  Next billing:{' '}
                  {new Date(activeSub.next_billing).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              )}
              <span
                className={`inline-block text-xs px-2 py-0.5 rounded-full border font-medium ${subStatusColor[activeSub.status]}`}
              >
                {activeSub.status.charAt(0).toUpperCase() + activeSub.status.slice(1)}
              </span>
            </div>
          ) : (
            <p className="text-white/30 text-sm">No active subscription</p>
          )}
        </div>
      </div>

      {/* Middle row — 2 cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Live Test Chat */}
        <div className="bg-[#1A1A1A] border border-white/5 rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-teal-400" />
              <span className="text-white font-medium text-sm">Test Receptionist</span>
            </div>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="bg-[#0A0A0A] border border-white/10 rounded-lg px-2 py-1 text-xs text-white/70 focus:outline-none focus:border-teal-600/50"
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>

          {/* Messages */}
          <div className="flex-1 max-h-80 overflow-y-auto space-y-3 pr-1">
            {messages.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <Bot className="w-8 h-8 text-white/20" />
                <p className="text-white/30 text-xs text-center">
                  Select a device and send a message to test your receptionist
                </p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
                    msg.role === 'user'
                      ? 'bg-teal-600/20 text-teal-100'
                      : 'bg-white/5 text-white'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white/5 px-3 py-2 rounded-xl flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={devices.length === 0 ? 'No devices available' : 'Type a message...'}
              disabled={isLoading || devices.length === 0}
              className="flex-1 bg-[#0A0A0A] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-teal-600/50 disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !inputText.trim() || devices.length === 0}
              className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-2 rounded-lg transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right: Recent Conversations */}
        <div className="bg-[#1A1A1A] border border-white/5 rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-teal-400" />
            <span className="text-white font-medium text-sm">Recent Conversations</span>
            {deviceConversations.length > 0 && (
              <span className="ml-auto text-white/30 text-xs">{deviceConversations.length} shown</span>
            )}
          </div>

          {deviceConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 h-48 gap-2">
              <MessageSquare className="w-8 h-8 text-white/20" />
              <p className="text-white/30 text-xs">No conversations yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-white/30 border-b border-white/5">
                    <th className="text-left pb-2 pr-2 font-medium">Device</th>
                    <th className="text-left pb-2 pr-2 font-medium">Lang</th>
                    <th className="text-left pb-2 pr-2 font-medium">Msgs</th>
                    <th className="text-left pb-2 pr-2 font-medium">Duration</th>
                    <th className="text-left pb-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {deviceConversations.map((conv) => (
                    <tr key={conv.id} className="text-white/60 hover:text-white/80 transition-colors">
                      <td className="py-2 pr-2 font-mono text-teal-400/80 truncate max-w-[80px]">
                        {conv.device_id}
                      </td>
                      <td className="py-2 pr-2 uppercase">{conv.language}</td>
                      <td className="py-2 pr-2">{conv.message_count}</td>
                      <td className="py-2 pr-2">{formatDuration(conv.duration_s)}</td>
                      <td className="py-2 text-white/40">{formatDate(conv.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
