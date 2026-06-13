create unique index if not exists group_orders_active_game_order_template_unique
on overcooked_26_group_orders(game_id, order_template_id)
where status in ('assigned', 'cooking', 'cooked', 'assembling', 'served');
