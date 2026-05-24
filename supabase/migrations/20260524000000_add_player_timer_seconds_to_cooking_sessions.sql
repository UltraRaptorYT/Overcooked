alter table overcooked_26_cooking_sessions
add column if not exists player_timer_seconds integer
check (player_timer_seconds is null or player_timer_seconds >= 0);
