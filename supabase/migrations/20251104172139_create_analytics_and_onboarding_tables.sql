-- Create tables for event tracking, onboarding state, and product tours

begin;

-- ============================================================================
-- 1. user_event_log - Central event stream for all analytics (AARRR framework)
-- ============================================================================
create table if not exists user_event_log (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null,
  payload jsonb,
  created_at timestamptz default now()
);

-- Indexes for efficient querying
create index if not exists idx_user_event_log_user_id on user_event_log(user_id);
create index if not exists idx_user_event_log_event_name on user_event_log(event_name);
create index if not exists idx_user_event_log_created_at on user_event_log(created_at);
-- Composite index for common time-range queries per user
create index if not exists idx_user_event_log_user_created on user_event_log(user_id, created_at);

-- Enable RLS
alter table user_event_log enable row level security;

-- RLS Policy: Users can insert their own events
drop policy if exists "Users can insert their own events" on user_event_log;
create policy "Users can insert their own events"
  on user_event_log
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- RLS Policy: Users can read their own events
drop policy if exists "Users can read their own events" on user_event_log;
create policy "Users can read their own events"
  on user_event_log
  for select
  to authenticated
  using (auth.uid() = user_id);

-- ============================================================================
-- 2. user_onboarding_state - Track user progress through onboarding
-- ============================================================================
create table if not exists user_onboarding_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  seen_welcome boolean default false,
  tour_connect_calendar_done boolean default false,
  tour_upcoming_done boolean default false,
  checklist jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- Enable RLS
alter table user_onboarding_state enable row level security;

-- RLS Policy: Users can read their own onboarding state
drop policy if exists "Users can read their own onboarding state" on user_onboarding_state;
create policy "Users can read their own onboarding state"
  on user_onboarding_state
  for select
  to authenticated
  using (auth.uid() = user_id);

-- RLS Policy: Users can insert their own onboarding state
drop policy if exists "Users can insert their own onboarding state" on user_onboarding_state;
create policy "Users can insert their own onboarding state"
  on user_onboarding_state
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- RLS Policy: Users can update their own onboarding state
drop policy if exists "Users can update their own onboarding state" on user_onboarding_state;
create policy "Users can update their own onboarding state"
  on user_onboarding_state
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================================
-- 3. product_tours - Store tour definitions for easy editing
-- ============================================================================
create table if not exists product_tours (
  id uuid primary key default gen_random_uuid(),
  tour_id text unique not null,
  name text not null,
  description text,
  steps jsonb not null,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS
alter table product_tours enable row level security;

-- RLS Policy: All authenticated users can read active tours
drop policy if exists "Authenticated users can read active tours" on product_tours;
create policy "Authenticated users can read active tours"
  on product_tours
  for select
  to authenticated
  using (is_active = true);

-- RLS Policy: Service role can manage tours (for admin/backend operations)
drop policy if exists "Service role can manage all tours" on product_tours;
create policy "Service role can manage all tours"
  on product_tours
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================================================
-- Helper function to update updated_at timestamp
-- ============================================================================
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger to automatically update updated_at for user_onboarding_state
drop trigger if exists update_user_onboarding_state_updated_at on user_onboarding_state;
create trigger update_user_onboarding_state_updated_at
  before update on user_onboarding_state
  for each row
  execute function update_updated_at_column();

-- Trigger to automatically update updated_at for product_tours
drop trigger if exists update_product_tours_updated_at on product_tours;
create trigger update_product_tours_updated_at
  before update on product_tours
  for each row
  execute function update_updated_at_column();

commit;
