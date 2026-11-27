-- OPTIONAL made-up demo players and clans, only to look at the website without a Minecraft server.
-- Not loaded automatically. Load them (while "docker compose up" is running) with:
--   Get-Content demo-data.sql | docker compose exec -T db psql -U postgres
-- Remove them again with: docker compose down -v   (deletes ALL test data, also from your test server)
-- The demo server shows as "online" for 5 minutes after loading (a real server updates it every 30 s).

create temp table t as select (extract(epoch from now()) * 1000)::bigint as now, 86400000::bigint as day;

insert into players (uuid, name, first_join, last_seen, playtime_seconds, active_seconds, blocks_placed, blocks_broken,
  deaths, mob_kills, player_kills, advancements, updated_at, longest_session_seconds, sessions, distance_cm, fish_caught,
  animals_bred, villager_trades, items_crafted)
select v.* from t, lateral (values
  ('11111111-1111-4111-8111-111111111111'::uuid, 'Baumeisterin', t.now - 30*t.day, t.now,          312000, 268000, 48210, 21004,  41,  930,  3, 61, t.now, 21400, 96, 21400000, 37, 58, 120, 5230),
  ('22222222-2222-4222-8222-222222222222'::uuid, 'Steinbrecher', t.now - 28*t.day, t.now,          254000, 231000,  9120, 88310,  67, 1840,  8, 54, t.now, 18800, 71, 15800000, 4, 12, 31, 2104),
  ('33333333-3333-4333-8333-333333333333'::uuid, 'Farmerin',     t.now - 21*t.day, t.now,          131000, 102000, 15540,  9020,  12,  210,  0, 33, t.now, 9200, 64, 8900000, 212, 431, 77, 3810),
  ('44444444-4444-4444-8444-444444444444'::uuid, 'Nachtwache',   t.now - 14*t.day, t.now - 7200000, 98000,  90100,  3020,  7710,  29, 2210, 14, 40, t.now, 14400, 30, 17300000, 9, 3, 12, 690),
  ('55555555-5555-4555-8555-555555555555'::uuid, 'Entdecker',    t.now - 9*t.day,  t.now - 3*t.day, 45000,  39000,  1210,  5230,  18,  340,  1, 47, t.now, 7700, 22, 24900000, 61, 7, 45, 440),
  ('66666666-6666-4666-8666-666666666666'::uuid, 'Neuling',      t.now - 1*t.day,  t.now - 18000000, 3600,  3100,   140,   420,   4,   12,  0,  6, t.now, 2100, 3, 2400000, 0, 0, 0, 38, 0)
) v on conflict do nothing;

insert into clans select v.* from t, lateral (values
  (1, 'Baumeister', 'BAU', '#ffaa00', '11111111-1111-4111-8111-111111111111'::uuid, t.now - 25*t.day, 3, t.now),
  (2, 'Nachtfalken', 'NF', '#5555ff', '44444444-4444-4444-8444-444444444444'::uuid, t.now - 10*t.day, 2, t.now)
) v on conflict do nothing;

insert into clan_members values
  ('11111111-1111-4111-8111-111111111111', 1, 'owner'),
  ('22222222-2222-4222-8222-222222222222', 1, 'officer'),
  ('33333333-3333-4333-8333-333333333333', 1, 'member'),
  ('44444444-4444-4444-8444-444444444444', 2, 'owner'),
  ('55555555-5555-4555-8555-555555555555', 2, 'member')
on conflict do nothing;

insert into online_players select v.* from t, lateral (values
  ('11111111-1111-4111-8111-111111111111'::uuid, 'Baumeisterin', false, 'world', t.now),
  ('22222222-2222-4222-8222-222222222222'::uuid, 'Steinbrecher', false, 'world_nether', t.now),
  ('33333333-3333-4333-8333-333333333333'::uuid, 'Farmerin', true, 'world', t.now)
) v on conflict do nothing;

insert into server_status select 1, 'Testserver (Docker)', '26.3', 20, 3, t.now from t
on conflict (id) do update set updated_at = excluded.updated_at;
