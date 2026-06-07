alter table overcooked_26_order_templates
add column if not exists audio_path text null;

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
