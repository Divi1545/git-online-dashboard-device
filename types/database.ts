export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      hardware_devices: {
        Row: {
          id: string
          device_id: string
          secret_hash: string
          owner_id: string | null
          product_type: string
          status: 'online' | 'offline' | 'lapsed'
          location: string | null
          wake_word: string
          firmware: string
          deployed_at: string
          last_seen: string | null
        }
        Insert: {
          id?: string
          device_id: string
          secret_hash: string
          owner_id?: string | null
          product_type?: string
          status?: 'online' | 'offline' | 'lapsed'
          location?: string | null
          wake_word?: string
          firmware?: string
          deployed_at?: string
          last_seen?: string | null
        }
        Update: {
          id?: string
          device_id?: string
          secret_hash?: string
          owner_id?: string | null
          product_type?: string
          status?: 'online' | 'offline' | 'lapsed'
          location?: string | null
          wake_word?: string
          firmware?: string
          deployed_at?: string
          last_seen?: string | null
        }
      }
      hardware_subscriptions: {
        Row: {
          id: string
          device_id: string
          plan: 'starter' | 'pro' | 'enterprise'
          region: string
          price_usd: number
          status: 'active' | 'lapsed' | 'cancelled'
          stripe_sub_id: string | null
          next_billing: string | null
          created_at: string
        }
        Insert: {
          id?: string
          device_id: string
          plan: 'starter' | 'pro' | 'enterprise'
          region: string
          price_usd: number
          status?: 'active' | 'lapsed' | 'cancelled'
          stripe_sub_id?: string | null
          next_billing?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          device_id?: string
          plan?: 'starter' | 'pro' | 'enterprise'
          region?: string
          price_usd?: number
          status?: 'active' | 'lapsed' | 'cancelled'
          stripe_sub_id?: string | null
          next_billing?: string | null
          created_at?: string
        }
      }
      hardware_conversations: {
        Row: {
          id: string
          device_id: string
          session_id: string
          language: string
          duration_s: number
          message_count: number
          created_at: string
        }
        Insert: {
          id?: string
          device_id: string
          session_id: string
          language?: string
          duration_s?: number
          message_count?: number
          created_at?: string
        }
        Update: {
          id?: string
          device_id?: string
          session_id?: string
          language?: string
          duration_s?: number
          message_count?: number
          created_at?: string
        }
      }
      hardware_inquiries: {
        Row: {
          id: string
          name: string
          business: string
          business_type: string | null
          city: string | null
          product_interest: string | null
          message: string | null
          contacted: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          business: string
          business_type?: string | null
          city?: string | null
          product_interest?: string | null
          message?: string | null
          contacted?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          business?: string
          business_type?: string | null
          city?: string | null
          product_interest?: string | null
          message?: string | null
          contacted?: boolean
          created_at?: string
        }
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
  }
}

// Row type helpers
export type DeviceRow = Database['public']['Tables']['hardware_devices']['Row']
export type SubscriptionRow = Database['public']['Tables']['hardware_subscriptions']['Row']
export type ConversationRow = Database['public']['Tables']['hardware_conversations']['Row']
export type InquiryRow = Database['public']['Tables']['hardware_inquiries']['Row']

// Supabase single-row query result helper
export type SupabaseSingle<T> = { data: T | null; error: unknown }
export type SupabaseList<T> = { data: T[] | null; error: unknown }
