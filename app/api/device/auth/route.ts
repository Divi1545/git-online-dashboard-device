export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, mutate } from '@/lib/supabase-admin'
import { compareSecret } from '@/lib/bcrypt'
import { signDeviceToken } from '@/lib/device-auth'
import { sendTelegramAlert } from '@/lib/telegram'
import type { DeviceRow, SubscriptionRow, SupabaseSingle } from '@/types/database'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-key',
}

// In-memory rate limiter: device_id → { count, reset_at }
const rateLimitMap = new Map<string, { count: number; reset_at: number }>()

function isRateLimited(device_id: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(device_id)
  if (!entry || now > entry.reset_at) {
    rateLimitMap.set(device_id, { count: 1, reset_at: now + 60_000 })
    return false
  }
  if (entry.count >= 10) return true
  entry.count++
  return false
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: NextRequest) {
  let body: { device_id?: string; secret?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON', code: 'BAD_REQUEST' },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  const { device_id, secret } = body

  if (!device_id || !secret) {
    return NextResponse.json(
      { error: 'device_id and secret are required', code: 'BAD_REQUEST' },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  if (isRateLimited(device_id)) {
    return NextResponse.json(
      { error: 'Too many requests', code: 'RATE_LIMITED' },
      { status: 429, headers: CORS_HEADERS }
    )
  }

  const db = getAdminClient()

  // 1. Look up device
  const { data: device } = (await db
    .from('hardware_devices')
    .select('*')
    .eq('device_id', device_id)
    .single()) as SupabaseSingle<DeviceRow>

  if (!device) {
    return NextResponse.json(
      { error: 'Device not registered', code: 'DEVICE_NOT_FOUND' },
      { status: 404, headers: CORS_HEADERS }
    )
  }

  // 2. Verify secret
  const valid = await compareSecret(secret, device.secret_hash)
  if (!valid) {
    return NextResponse.json(
      { error: 'Invalid credentials', code: 'AUTH_FAILED' },
      { status: 401, headers: CORS_HEADERS }
    )
  }

  // 3. Look up active subscription
  const { data: subscription } = (await db
    .from('hardware_subscriptions')
    .select('*')
    .eq('device_id', device.id)
    .eq('status', 'active')
    .single()) as SupabaseSingle<SubscriptionRow>

  if (!subscription) {
    await mutate('hardware_devices')
      .update({ status: 'lapsed' })
      .eq('id', device.id)
    await sendTelegramAlert(
      `⚠️ <b>Subscription lapsed</b>\nDevice: <code>${device_id}</code>\nLocation: ${device.location ?? 'unknown'}`
    )
    return NextResponse.json(
      {
        error: 'Subscription inactive',
        code: 'SUBSCRIPTION_LAPSED',
        message: 'Contact AI Code Agency: +94XXXXXXXXX',
      },
      { status: 402, headers: CORS_HEADERS }
    )
  }

  // 4. Check if past due >3 days
  if (subscription.next_billing) {
    const nextBilling = new Date(subscription.next_billing)
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    if (nextBilling < threeDaysAgo) {
      await mutate('hardware_devices').update({ status: 'lapsed' }).eq('id', device.id)
      await mutate('hardware_subscriptions')
        .update({ status: 'lapsed' })
        .eq('id', subscription.id)
      await sendTelegramAlert(
        `⚠️ <b>Subscription past due</b>\nDevice: <code>${device_id}</code>\nDue: ${subscription.next_billing}`
      )
      return NextResponse.json(
        {
          error: 'Subscription inactive',
          code: 'SUBSCRIPTION_LAPSED',
          message: 'Contact AI Code Agency: +94XXXXXXXXX',
        },
        { status: 402, headers: CORS_HEADERS }
      )
    }
  }

  // 5. Update device status
  await mutate('hardware_devices')
    .update({ status: 'online', last_seen: new Date().toISOString() })
    .eq('id', device.id)

  // 6. Sign JWT (24h TTL)
  const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const token = signDeviceToken({
    device_id,
    plan: subscription.plan,
    region: subscription.region,
    expires_at,
  })

  return NextResponse.json(
    {
      token,
      expires_at,
      plan: subscription.plan,
      region: subscription.region,
      claude_model: 'claude-haiku-4-5',
      api_base: 'https://api.anthropic.com',
      device_name: device.location ?? device_id,
      wake_word: device.wake_word ?? 'hey_kiyanna',
    },
    { status: 200, headers: CORS_HEADERS }
  )
}
