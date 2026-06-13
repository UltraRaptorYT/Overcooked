-- supabase/migrations/001_initial_schema.sql
-- Enable UUID generation.
create extension if not exists "pgcrypto";
-- DEV RESET ONLY:
-- This project is still in setup, so we intentionally drop the prefixed tables first.
-- This prevents type mismatch errors from older partial table attempts, e.g. bigint id vs uuid id.
drop table if exists overcooked_26_game_events cascade;
drop table if exists overcooked_26_served_orders cascade;
drop table if exists overcooked_26_cooking_sessions cascade;
drop table if exists overcooked_26_group_orders cascade;
drop table if exists overcooked_26_order_template_items cascade;
drop table if exists overcooked_26_order_templates cascade;
drop table if exists overcooked_26_food_items cascade;
drop table if exists overcooked_26_customers cascade;
drop table if exists overcooked_26_groups cascade;
drop table if exists overcooked_26_rounds cascade;
drop table if exists overcooked_26_games cascade;
-- =========================
-- ENUMS
-- =========================
do $$ begin create type game_status as enum (
  'setup',
  'strategising',
  'playing',
  'paused',
  'ended'
);
exception
when duplicate_object then null;
end $$;
do $$ begin create type round_status as enum (
  'locked',
  'ready',
  'strategising',
  'playing',
  'paused',
  'ended'
);
exception
when duplicate_object then null;
end $$;
do $$ begin create type round_mode as enum ('easy', 'hard');
exception
when duplicate_object then null;
end $$;
do $$ begin create type group_order_status as enum (
  'assigned',
  'cooking',
  'cooked',
  'assembling',
  'served',
  'approved',
  'rejected',
  'misserved',
  'cancelled'
);
exception
when duplicate_object then null;
end $$;
do $$ begin create type cook_result as enum (
  'pending',
  'undercooked',
  'correct',
  'overcooked',
  'not_required'
);
exception
when duplicate_object then null;
end $$;
do $$ begin create type served_decision as enum ('approved', 'rejected', 'wrong_customer');
exception
when duplicate_object then null;
end $$;
-- =========================
-- CORE GAME TABLES
-- =========================
create table if not exists overcooked_26_games (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status game_status not null default 'setup',
  current_round_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists overcooked_26_rounds (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references overcooked_26_games(id) on delete cascade,
  name text not null,
  mode round_mode not null,
  status round_status not null default 'locked',
  strategy_seconds integer not null check (strategy_seconds >= 0),
  duration_seconds integer not null check (duration_seconds > 0),
  rush_hour_duration_seconds integer not null default 300 check (rush_hour_duration_seconds >= 0),
  strategy_started_at timestamptz null,
  round_started_at timestamptz null,
  round_ended_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table overcooked_26_games drop constraint if exists games_current_round_id_fkey;
alter table overcooked_26_games
add constraint games_current_round_id_fkey foreign key (current_round_id) references overcooked_26_rounds(id) on delete
set null;
create table if not exists overcooked_26_groups (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references overcooked_26_games(id) on delete cascade,
  name text not null,
  display_order integer not null,
  score integer not null default 0,
  red_tokens integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, display_order),
  unique (game_id, name)
);
create table if not exists overcooked_26_customers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references overcooked_26_games(id) on delete cascade,
  name text not null,
  customer_slot integer not null check (
    customer_slot between 1 and 6
  ),
  physical_position text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, customer_slot),
  unique (game_id, name)
);
-- =========================
-- STATIC / SEEDED GAME DATA
-- =========================
create table if not exists overcooked_26_food_items (
  id text primary key,
  name text not null,
  requires_cooking boolean not null default false,
  cook_time_seconds integer not null default 0 check (cook_time_seconds >= 0),
  image_url text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists overcooked_26_order_templates (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  difficulty round_mode not null,
  customer_slot integer not null check (
    customer_slot between 1 and 6
  ),
  spoken_text text not null,
  audio_path text null,
  required_total_cook_time_seconds integer not null default 0 check (required_total_cook_time_seconds >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists overcooked_26_order_template_items (
  id uuid primary key default gen_random_uuid(),
  order_template_id uuid not null references overcooked_26_order_templates(id) on delete cascade,
  zone text not null check (zone in ('A', 'B', 'C', 'D')),
  food_item_id text not null references overcooked_26_food_items(id),
  colour text not null,
  parent_item text null,
  sequence integer null check (
    sequence is null
    or sequence > 0
  ),
  created_at timestamptz not null default now()
);
create index if not exists order_template_items_order_template_id_idx on overcooked_26_order_template_items(order_template_id);
create index if not exists order_templates_difficulty_customer_slot_idx on overcooked_26_order_templates(difficulty, customer_slot);
-- =========================
-- LIVE GAMEPLAY TABLES
-- =========================
create table if not exists overcooked_26_group_orders (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references overcooked_26_games(id) on delete cascade,
  round_id uuid not null references overcooked_26_rounds(id) on delete cascade,
  group_id uuid not null references overcooked_26_groups(id) on delete cascade,
  order_template_id uuid not null references overcooked_26_order_templates(id),
  status group_order_status not null default 'assigned',
  assigned_at timestamptz not null default now(),
  cooking_started_at timestamptz null,
  cooking_completed_at timestamptz null,
  served_at timestamptz null,
  completed_at timestamptz null,
  completion_seconds integer null check (
    completion_seconds is null
    or completion_seconds >= 0
  ),
  replay_count integer not null default 0 check (replay_count >= 0),
  last_replayed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, group_id, order_template_id)
);
create index if not exists group_orders_game_round_idx on overcooked_26_group_orders(game_id, round_id);
create index if not exists group_orders_group_status_idx on overcooked_26_group_orders(group_id, status);
create index if not exists group_orders_order_template_id_idx on overcooked_26_group_orders(order_template_id);
create table if not exists overcooked_26_cooking_sessions (
  id uuid primary key default gen_random_uuid(),
  group_order_id uuid not null references overcooked_26_group_orders(id) on delete cascade,
  group_id uuid not null references overcooked_26_groups(id) on delete cascade,
  required_seconds integer not null check (required_seconds >= 0),
  buffer_seconds integer not null default 5 check (buffer_seconds >= 0),
  player_timer_seconds integer null check (
    player_timer_seconds is null
    or player_timer_seconds >= 0
  ),
  started_at timestamptz not null default now(),
  removed_at timestamptz null,
  actual_seconds integer null check (
    actual_seconds is null
    or actual_seconds >= 0
  ),
  result cook_result not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists cooking_sessions_group_order_id_idx on overcooked_26_cooking_sessions(group_order_id);
create index if not exists cooking_sessions_result_idx on overcooked_26_cooking_sessions(result);
create table if not exists overcooked_26_served_orders (
  id uuid primary key default gen_random_uuid(),
  group_order_id uuid not null references overcooked_26_group_orders(id) on delete cascade,
  customer_id uuid not null references overcooked_26_customers(id) on delete cascade,
  served_by_group_id uuid not null references overcooked_26_groups(id) on delete cascade,
  decision served_decision not null,
  reason text null,
  points_delta integer not null default 0,
  red_tokens_delta integer not null default 0,
  judged_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (group_order_id)
);
create index if not exists served_orders_customer_id_idx on overcooked_26_served_orders(customer_id);
create table if not exists overcooked_26_game_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references overcooked_26_games(id) on delete cascade,
  round_id uuid null references overcooked_26_rounds(id) on delete cascade,
  group_id uuid null references overcooked_26_groups(id) on delete cascade,
  event_type text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists game_events_game_created_idx on overcooked_26_game_events(game_id, created_at desc);
-- =========================
-- UPDATED_AT TRIGGER
-- =========================
create or replace function set_updated_at() returns trigger as $$ begin new.updated_at = now();
return new;
end;
$$ language plpgsql;
create trigger set_games_updated_at before
update on overcooked_26_games for each row execute function set_updated_at();
create trigger set_rounds_updated_at before
update on overcooked_26_rounds for each row execute function set_updated_at();
create trigger set_groups_updated_at before
update on overcooked_26_groups for each row execute function set_updated_at();
create trigger set_customers_updated_at before
update on overcooked_26_customers for each row execute function set_updated_at();
create trigger set_food_items_updated_at before
update on overcooked_26_food_items for each row execute function set_updated_at();
create trigger set_order_templates_updated_at before
update on overcooked_26_order_templates for each row execute function set_updated_at();
create trigger set_group_orders_updated_at before
update on overcooked_26_group_orders for each row execute function set_updated_at();
create trigger set_cooking_sessions_updated_at before
update on overcooked_26_cooking_sessions for each row execute function set_updated_at();
-- =========================
-- SCORING FUNCTION
-- =========================
create or replace function apply_served_order_score() returns trigger as $$ begin
update overcooked_26_groups
set score = score + new.points_delta,
  red_tokens = red_tokens + new.red_tokens_delta
where id = new.served_by_group_id;
update overcooked_26_group_orders
set status = case
    when new.decision = 'approved' then 'approved'::group_order_status
    when new.decision = 'wrong_customer' then 'misserved'::group_order_status
    else 'rejected'::group_order_status
  end,
  completed_at = new.judged_at,
  completion_seconds = greatest(
    0,
    floor(
      extract(
        epoch
        from (new.judged_at - assigned_at)
      )
    )::integer
  )
where id = new.group_order_id;
return new;
end;
$$ language plpgsql;
create trigger apply_served_order_score_trigger
after
insert on overcooked_26_served_orders for each row execute function apply_served_order_score();
-- =========================
-- REALTIME PUBLICATION
-- =========================
-- Supabase Realtime publication additions can fail if a table is already added.
-- Wrapping each one keeps this migration rerunnable during development.
do $$ begin alter publication supabase_realtime
add table overcooked_26_games;
exception
when duplicate_object then null;
end $$;
do $$ begin alter publication supabase_realtime
add table overcooked_26_rounds;
exception
when duplicate_object then null;
end $$;
do $$ begin alter publication supabase_realtime
add table overcooked_26_groups;
exception
when duplicate_object then null;
end $$;
do $$ begin alter publication supabase_realtime
add table overcooked_26_customers;
exception
when duplicate_object then null;
end $$;
do $$ begin alter publication supabase_realtime
add table overcooked_26_group_orders;
exception
when duplicate_object then null;
end $$;
do $$ begin alter publication supabase_realtime
add table overcooked_26_cooking_sessions;
exception
when duplicate_object then null;
end $$;
do $$ begin alter publication supabase_realtime
add table overcooked_26_served_orders;
exception
when duplicate_object then null;
end $$;
do $$ begin alter publication supabase_realtime
add table overcooked_26_game_events;
exception
when duplicate_object then null;
end $$;

-- =========================
-- READABLE DEBUGGING VIEWS
-- =========================

create or replace view overcooked_26_group_orders_readable as
select
  go.id as group_order_id,
  g.name as game_name,
  r.name as round_name,
  r.mode as round_mode,
  gr.display_order as group_no,
  gr.name as group_name,
  ot.order_no,
  ot.audio_path,
  ot.customer_slot,
  go.status,
  go.assigned_at,
  go.cooking_started_at,
  go.cooking_completed_at,
  go.served_at,
  go.completed_at,
  go.completion_seconds,
  go.replay_count,
  go.last_replayed_at,
  go.created_at,
  go.game_id,
  go.round_id,
  go.group_id,
  go.order_template_id
from overcooked_26_group_orders go
join overcooked_26_games g on g.id = go.game_id
join overcooked_26_rounds r on r.id = go.round_id
join overcooked_26_groups gr on gr.id = go.group_id
join overcooked_26_order_templates ot on ot.id = go.order_template_id;

create or replace view overcooked_26_cooking_sessions_readable as
select
  cs.id as cooking_session_id,
  gr.display_order as group_no,
  gr.name as group_name,
  ot.order_no,
  go.status as group_order_status,
  cs.player_timer_seconds,
  cs.required_seconds,
  cs.buffer_seconds,
  cs.actual_seconds,
  cs.result,
  cs.started_at,
  cs.removed_at,
  cs.created_at,
  cs.group_order_id,
  cs.group_id
from overcooked_26_cooking_sessions cs
join overcooked_26_group_orders go on go.id = cs.group_order_id
join overcooked_26_groups gr on gr.id = cs.group_id
join overcooked_26_order_templates ot on ot.id = go.order_template_id;

create or replace view overcooked_26_served_orders_readable as
select
  so.id as served_order_id,
  ot.order_no,
  served_group.display_order as served_by_group_no,
  served_group.name as served_by_group_name,
  c.customer_slot,
  c.name as customer_name,
  so.decision,
  so.reason,
  so.points_delta,
  so.red_tokens_delta,
  so.judged_at,
  so.group_order_id,
  so.customer_id,
  so.served_by_group_id
from overcooked_26_served_orders so
join overcooked_26_group_orders go on go.id = so.group_order_id
join overcooked_26_order_templates ot on ot.id = go.order_template_id
join overcooked_26_groups served_group on served_group.id = so.served_by_group_id
join overcooked_26_customers c on c.id = so.customer_id;
