-- Note: Replace 'YOUR_ADMIN_USER_ID' with the actual Supabase auth user ID for divindu@aicodeagency.org

-- Demo devices (owner_id set to admin for testing — update to real operator IDs in production)
insert into hardware_devices (device_id, secret_hash, product_type, status, location, deployed_at, last_seen)
values
  ('KIYANNA-001', '$2b$10$placeholder_hash_001', 'AiDesk S1', 'online', 'Galle Fort Hotel Lobby', now() - interval '30 days', now() - interval '5 minutes'),
  ('KIYANNA-002', '$2b$10$placeholder_hash_002', 'AiDesk S1', 'lapsed', 'Colombo Clinic Reception', now() - interval '60 days', now() - interval '7 days')
on conflict (device_id) do nothing;

-- Subscriptions
insert into hardware_subscriptions (device_id, plan, region, price_usd, status, next_billing)
select id, 'starter', 'sri_lanka', 100.00, 'active', now() + interval '30 days'
from hardware_devices where device_id = 'KIYANNA-001'
on conflict do nothing;

insert into hardware_subscriptions (device_id, plan, region, price_usd, status, next_billing)
select id, 'pro', 'sri_lanka', 150.00, 'lapsed', now() - interval '5 days'
from hardware_devices where device_id = 'KIYANNA-002'
on conflict do nothing;

-- Demo conversations for KIYANNA-001
insert into hardware_conversations (device_id, session_id, language, duration_s, message_count, created_at)
select id, 'sess-' || gen_random_uuid(), 'en', 120, 8, now() - interval '1 day' from hardware_devices where device_id = 'KIYANNA-001'
union all
select id, 'sess-' || gen_random_uuid(), 'si', 95, 6, now() - interval '2 days' from hardware_devices where device_id = 'KIYANNA-001'
union all
select id, 'sess-' || gen_random_uuid(), 'ta', 180, 12, now() - interval '3 days' from hardware_devices where device_id = 'KIYANNA-001'
union all
select id, 'sess-' || gen_random_uuid(), 'en', 45, 3, now() - interval '4 days' from hardware_devices where device_id = 'KIYANNA-001'
union all
select id, 'sess-' || gen_random_uuid(), 'si', 200, 15, now() - interval '5 days' from hardware_devices where device_id = 'KIYANNA-001';

-- Demo inquiries
insert into hardware_inquiries (name, business, business_type, city, product_interest, message, contacted)
values
  ('Chamara Perera', 'Galle Heritage Hotel', 'hotel', 'Galle', 'AiDesk S1', 'We are interested in deploying AI kiosks in our lobby and restaurant areas. Please contact us.', false),
  ('Dr. Nimali Fernando', 'MedPlus Clinic Kandy', 'clinic', 'Kandy', 'AiDesk S1', 'Looking for a reception AI assistant for patient check-in. How does the multilingual support work?', true);
