alter table overcooked_26_rounds
add column if not exists rush_hour_duration_seconds integer not null default 300
check (rush_hour_duration_seconds >= 0);
