-- Tables for the Minecraft stats website.
--
-- Run this ONCE in Supabase: open your project, click "SQL Editor" on the left, paste this whole file,
-- click "Run". Running it again is safe: it never deletes data.
--
-- Who can do what:
--   * The Minecraft plugin writes with the SECRET key (role service_role). Only your server has that key.
--   * The website reads with the PUBLISHABLE key (role anon). It can only read these tables, never change them.
--
-- Times are stored as milliseconds since 1970 (like Java and JavaScript use them).

create table if not exists public.players (
  uuid uuid primary key,
  name text not null,
  first_join bigint not null default 0,
  last_seen bigint not null default 0,
  playtime_seconds bigint not null default 0,
  active_seconds bigint not null default 0,
  blocks_placed bigint not null default 0,
  blocks_broken bigint not null default 0,
  deaths bigint not null default 0,
  mob_kills bigint not null default 0,
  player_kills bigint not null default 0,
  advancements bigint not null default 0,
  updated_at bigint not null default 0
);

-- More stats (plugin version 2.1). Added like this, so running this file again on an older database adds them.
alter table public.players add column if not exists longest_session_seconds bigint not null default 0;
alter table public.players add column if not exists sessions bigint not null default 0;
alter table public.players add column if not exists distance_cm bigint not null default 0;
alter table public.players add column if not exists fish_caught bigint not null default 0;
alter table public.players add column if not exists animals_bred bigint not null default 0;
alter table public.players add column if not exists villager_trades bigint not null default 0;
alter table public.players add column if not exists items_crafted bigint not null default 0;
-- Diamond ores mined (plugin version 2.4, from Minecraft's own statistics).
alter table public.players add column if not exists diamonds_mined bigint not null default 0;

-- Who is online right now.
create table if not exists public.online_players (
  uuid uuid primary key,
  name text not null,
  afk boolean not null default false,
  world text not null default '',
  updated_at bigint not null default 0
);

-- All clans and who is in them (the clan chest contents are not copied).
create table if not exists public.clans (
  id integer primary key,
  name text not null,
  tag text not null,
  color text not null default '#ffaa00',
  owner uuid not null,
  created bigint not null default 0,
  member_count integer not null default 0,
  updated_at bigint not null default 0
);

create table if not exists public.clan_members (
  uuid uuid primary key,
  clan_id integer not null,
  role text not null
);

-- One row (id = 1). updated_at changes every 30 seconds while the server runs,
-- so the website knows the server is online.
create table if not exists public.server_status (
  id integer primary key check (id = 1),
  motd text not null default '',
  version text not null default '',
  max_players integer not null default 0,
  online_count integer not null default 0,
  updated_at bigint not null default 0
);

-- Access rights. New Supabase projects don't open new tables to the API automatically, so this is needed.
grant usage on schema public to anon, authenticated, service_role;
grant select on public.players, public.online_players, public.clans, public.clan_members, public.server_status
  to anon, authenticated;
grant all on public.players, public.online_players, public.clans, public.clan_members, public.server_status
  to service_role;

-- Row Level Security: everyone may read, nobody may write with the publishable key.
-- (The secret key skips these rules, that's how the plugin can write.)
alter table public.players enable row level security;
alter table public.online_players enable row level security;
alter table public.clans enable row level security;
alter table public.clan_members enable row level security;
alter table public.server_status enable row level security;

drop policy if exists "Everyone can read" on public.players;
create policy "Everyone can read" on public.players for select to anon, authenticated using (true);
drop policy if exists "Everyone can read" on public.online_players;
create policy "Everyone can read" on public.online_players for select to anon, authenticated using (true);
drop policy if exists "Everyone can read" on public.clans;
create policy "Everyone can read" on public.clans for select to anon, authenticated using (true);
drop policy if exists "Everyone can read" on public.clan_members;
create policy "Everyone can read" on public.clan_members for select to anon, authenticated using (true);
drop policy if exists "Everyone can read" on public.server_status;
create policy "Everyone can read" on public.server_status for select to anon, authenticated using (true);

-- Tell the API about the new tables right away.
notify pgrst, 'reload schema';
