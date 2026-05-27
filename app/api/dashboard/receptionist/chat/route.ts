export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getAdminClient, mutate } from '@/lib/supabase-admin'
import type { DeviceRow, SubscriptionRow, SupabaseSingle } from '@/types/database'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export async function POST(req: NextRequest) {
  // 1. Verify user session
  const supabase = createServiceRoleClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse request body
  let body: {
    device_id: string
    text: string
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { device_id, text, history = [] } = body

  if (!device_id || !text || text.trim().length === 0) {
    return NextResponse.json({ error: 'device_id and text are required' }, { status: 400 })
  }

  // 3. Look up device
  const db = getAdminClient()
  const { data: device } = (await db
    .from('hardware_devices')
    .select('location, product_type')
    .eq('device_id', device_id)
    .single()) as SupabaseSingle<Pick<DeviceRow, 'location' | 'product_type'>>

  const location = device?.location ?? device_id

  // 4. Look up active subscription
  const { data: subscription } = (await db
    .from('hardware_subscriptions')
    .select('plan')
    .eq('device_id', device_id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()) as SupabaseSingle<Pick<SubscriptionRow, 'plan'>>

  const plan = subscription?.plan ?? 'starter'

  // 5. Build system prompt
  const systemPrompt = `You are Kiyanna, AI receptionist at ${location}. Be concise — responses go to speech. No markdown. Reply in user's language. Plan: ${plan}.`

  // 6. Build messages
  const recentHistory = history.slice(-10)
  const messages: Anthropic.MessageParam[] = [
    ...recentHistory,
    { role: 'user', content: text.trim() },
  ]

  // 7. Call Claude
  let reply: string
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      system: systemPrompt,
      messages,
    })

    const block = response.content[0]
    reply = block.type === 'text' ? block.text : ''
  } catch (err) {
    console.error('[dashboard/receptionist/chat] Anthropic error:', err)
    return NextResponse.json({ error: 'AI service error' }, { status: 502 })
  }

  // 8. Log to hardware_conversations (best-effort)
  const session_id = 'dashboard-test-' + Date.now()
  try {
    await mutate('hardware_conversations').insert({
      device_id,
      session_id,
      language: 'en',
      duration_s: 0,
      message_count: messages.length,
    })
  } catch (err) {
    console.error('[dashboard/receptionist/chat] Conversation log error:', err)
  }

  return NextResponse.json({ reply, device_id }, { status: 200 })
}
