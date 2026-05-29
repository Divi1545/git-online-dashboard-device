import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'

let client: SupabaseClient<Database> | null = null

export function getAdminClient(): SupabaseClient<Database> {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
    if (!url || !key) {
      throw new Error(`Missing Supabase env vars: URL=${!!url} KEY=${!!key}`)
    }
    client = createClient<Database>(
      url,
      key,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )
  }
  return client
}

/**
 * Escape hatch for insert/update/delete mutations.
 * The project's Supabase generic chain collapses update/insert parameter types to `never`
 * due to a known typing issue. This returns an untyped query builder for mutations only.
 * Read queries should still use getAdminClient() with SupabaseSingle/SupabaseList casts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mutate(table: string): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (getAdminClient() as any).from(table)
}
