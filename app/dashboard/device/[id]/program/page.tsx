import { notFound, redirect } from 'next/navigation'
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { DeviceProgramClient } from '@/components/dashboard/DeviceProgramClient'

export const dynamic = 'force-dynamic'

export default async function DeviceProgramPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Admin only
  if (user.email !== process.env.ADMIN_EMAIL) redirect(`/dashboard/device/${params.id}`)

  const client = createServiceRoleClient()
  const { data: device } = await client
    .from('hardware_devices')
    .select('id, device_id, product_type, location, status, personality_name, system_prompt, ai_model, default_language, wake_word, config_version, config_updated_at')
    .eq('id', params.id)
    .single()

  if (!device) notFound()

  return (
    <DeviceProgramClient
      device={device}
    />
  )
}
