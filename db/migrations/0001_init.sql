-- fantasy: everything the app stores, in its own schema on the clocknumbers
-- Supabase project. The schema is not exposed through the Supabase REST API;
-- only the app's server reaches it, over DATABASE_URL. RLS is on with no
-- policies, so the anon and authenticated roles can read nothing even if the
-- schema were ever exposed.

create schema if not exists fantasy;
revoke all on schema fantasy from anon, authenticated;

create table if not exists fantasy.users (
  guid        text primary key,
  nickname    text,
  image_url   text,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);

-- Yahoo tokens, AES-256-GCM under TOKEN_KEY. Never stored in the clear.
create table if not exists fantasy.yahoo_tokens (
  guid         text primary key references fantasy.users(guid) on delete cascade,
  access_enc   text not null,
  refresh_enc  text not null,
  expires_at   timestamptz not null,
  updated_at   timestamptz not null default now()
);

-- The cookie holds a random id; only its SHA-256 is stored.
create table if not exists fantasy.sessions (
  id_hash     text primary key,
  guid        text not null references fantasy.users(guid) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index if not exists sessions_guid on fantasy.sessions(guid);

create table if not exists fantasy.leagues (
  league_key          text primary key,
  game_key            text not null,
  season              int  not null,
  name                text not null,
  num_teams           int,
  scoring_type        text,
  start_week          int,
  end_week            int,
  current_week        int,
  is_finished         boolean not null default false,
  uses_playoff        boolean not null default true,
  playoff_start_week  int,
  num_playoff_teams   int not null default 0,
  reseed              boolean not null default false,
  roster_positions    jsonb not null default '[]',
  divisions           jsonb not null default '{}',
  renew               text,
  renewed             text,
  logo_url            text,
  url                 text,
  settings_at         timestamptz,
  synced_at           timestamptz
);

create table if not exists fantasy.league_members (
  guid        text not null references fantasy.users(guid) on delete cascade,
  league_key  text not null references fantasy.leagues(league_key) on delete cascade,
  team_key    text,
  primary key (guid, league_key)
);
create index if not exists league_members_league on fantasy.league_members(league_key);

create table if not exists fantasy.teams (
  team_key      text primary key,
  league_key    text not null references fantasy.leagues(league_key) on delete cascade,
  name          text not null,
  logo_url      text,
  division_id   text,
  manager_guid  text,
  manager_name  text,
  yahoo_rank    int,
  yahoo_seed    int,
  wins          int,
  losses        int,
  ties          int,
  points_for    numeric
);
create index if not exists teams_league on fantasy.teams(league_key);

create table if not exists fantasy.weeks (
  league_key     text not null references fantasy.leagues(league_key) on delete cascade,
  week           int  not null,
  scoreboard_at  timestamptz,
  final          boolean not null default false,
  primary key (league_key, week)
);

create table if not exists fantasy.matchups (
  league_key      text not null references fantasy.leagues(league_key) on delete cascade,
  week            int  not null,
  idx             int  not null,
  team_a          text not null,
  team_b          text not null,
  points_a        numeric not null,
  points_b        numeric not null,
  proj_a          numeric,
  proj_b          numeric,
  is_playoffs     boolean not null default false,
  is_consolation  boolean not null default false,
  winner          text,
  status          text not null,
  primary key (league_key, week, idx)
);

create table if not exists fantasy.roster_spots (
  league_key  text not null references fantasy.leagues(league_key) on delete cascade,
  week        int  not null,
  team_key    text not null,
  player_key  text not null,
  name        text not null,
  nfl_team    text,
  position    text,
  eligible    text[] not null default '{}',
  slot        text not null,
  points      numeric not null,
  primary key (league_key, week, team_key, player_key)
);

-- One row per team-week roster fetched, so a sync can resume where it stopped
-- and knows which rosters are final.
create table if not exists fantasy.roster_fetches (
  league_key  text not null references fantasy.leagues(league_key) on delete cascade,
  week        int  not null,
  team_key    text not null,
  fetched_at  timestamptz not null default now(),
  final       boolean not null default false,
  error       text,
  primary key (league_key, week, team_key)
);

create table if not exists fantasy.league_prefs (
  league_key       text primary key references fantasy.leagues(league_key) on delete cascade,
  division_names   jsonb not null default '{}',
  koth_schedule    jsonb,
  include_reserve  boolean not null default false,
  updated_at       timestamptz not null default now()
);

create table if not exists fantasy.tier_players (
  id        serial primary key,
  name      text not null,
  position  text not null,
  price     int  not null,
  tier      int  not null
);

create table if not exists fantasy.tier_board (
  initials     text primary key check (initials ~ '^[A-Z]{3}$'),
  correct      int not null default 0,
  total        int not null default 0,
  streak       int not null default 0,
  best_streak  int not null default 0,
  last_played  timestamptz not null default now()
);

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'fantasy' loop
    execute format('alter table fantasy.%I enable row level security', t);
    execute format('revoke all on fantasy.%I from anon, authenticated', t);
  end loop;
end $$;
