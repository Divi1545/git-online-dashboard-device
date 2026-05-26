-- hardware_devices
create table if not exists hardware_devices (
  id uuid primary key default gen_random_uuid(),
  device_id text unique not null,
  secret_hash text not null,
  owner_id uuid references auth.users,
  product_type text default 'AiDesk S1',
  status text default 'offline' check (status in ('online', 'offline', 'lapsed')),
  location text,
  deployed_at timestamptz default now(),
  last_seen timestamptz
);

-- hardware_subscriptions
create table if not exists hardware_subscriptions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references hardware_devices on delete cascade,
  plan text not null check (plan in ('starter', 'pro', 'enterprise')),
  region text not null,
  price_usd numeric not null,
  status text default 'active' check (status in ('active', 'lapsed', 'cancelled')),
  stripe_sub_id text,
  next_billing timestamptz,
  created_at timestamptz default now()
);

-- hardware_conversations
create table if not exists hardware_conversations (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references hardware_devices on delete cascade,
  session_id text not null,
  language text default 'en',
  duration_s integer default 0,
  message_count integer default 0,
  created_at timestamptz default now()
);

-- hardware_inquiries
create table if not exists hardware_inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business text not null,
  business_type text,
  city text,
  product_interest text,
  message text,
  contacted boolean default false,
  created_at timestamptz default now()
);

-- RLS
alter table hardware_devices enable row level security;
alter table hardware_conversations enable row level security;
alter table hardware_subscriptions enable row level security;
alter table hardware_inquiries enable row level security;

-- Policies
create policy "operators_own_devices" on hardware_devices
  for all using (owner_id = auth.uid());

create policy "operators_own_conversations" on hardware_conversations
  for all using (
    device_id in (select id from hardware_devices where owner_id = auth.uid())
  );

create policy "operators_own_subscriptions" on hardware_subscriptions
  for all using (
    device_id in (select id from hardware_devices where owner_id = auth.uid())
  );

create policy "no_public_access" on hardware_inquiries for all using (false);

-- Enable realtime for hardware_devices
alter publication supabase_realtime add table hardware_devices;
