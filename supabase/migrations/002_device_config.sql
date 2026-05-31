-- Add device configuration columns for remote programming
ALTER TABLE hardware_devices
  ADD COLUMN IF NOT EXISTS wake_word text DEFAULT 'hey_kiyanna',
  ADD COLUMN IF NOT EXISTS firmware text DEFAULT 'voice',
  ADD COLUMN IF NOT EXISTS personality_name text DEFAULT 'Kiyanna',
  ADD COLUMN IF NOT EXISTS system_prompt text,
  ADD COLUMN IF NOT EXISTS ai_model text DEFAULT 'claude-haiku-4-5',
  ADD COLUMN IF NOT EXISTS default_language text DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS config_version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS config_updated_at timestamptz;
