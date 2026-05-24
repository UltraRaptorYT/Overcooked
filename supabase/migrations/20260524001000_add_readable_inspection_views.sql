create or replace view overcooked_26_group_orders_readable as
select
  go.id as group_order_id,
  g.name as game_name,
  r.name as round_name,
  r.mode as round_mode,
  gr.display_order as group_no,
  gr.name as group_name,
  ot.order_no,
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
