export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(
  req: NextRequest
) {
  // 1. Verify admin
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  let body: {
    message: string
    system_prompt: string
    ai_model?: string
    personality_name?: string
    device_name?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { message, system_prompt, ai_model = 'claude-haiku-4-5', device_name = 'Test Device' } = body

  if (!message || !system_prompt) {
    return NextResponse.json({ error: 'message and system_prompt are required' }, { status: 400 })
  }

  // Build the system prompt with device context injected
  const fullSystemPrompt = system_prompt
    .replace(/\{device_name\}/g, device_name)
    .replace(/\{personality_name\}/g, body.personality_name ?? 'Kiyanna')

  let reply: string
  try {
    const response = await anthropic.messages.create({
      model: ai_model as string,
      max_tokens: 300,
      system: fullSystemPrompt,
      messages: [{ role: 'user', content: message }],
    })
    const block = response.content[0]
    reply = block.type === 'text' ? block.text : ''
  } catch (err) {
    console.error('[admin/test] Claude error:', err)
    return NextResponse.json({ error: 'AI service error' }, { status: 502 })
  }

  return NextResponse.json({ reply, model: ai_model })
}
