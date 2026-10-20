// Reads and writes for leagues, teams, matchups and rosters.
import type { LeagueSummary, UserTeam } from "@/engine/yahoo-parse";
import { DEFAULT_KOTH, type EngineOptions, type LeagueMeta, type Matchup, type Season, type Spot, type TeamInfo } from "@/engine/types";
import { sql } from "./db";

const n = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

// ---------------------------------------------------------------- users

export async function upsertUser(guid: string, nickname: string | null, imageUrl: string | null) {
  await sql()`
    insert into fantasy.users (guid, nickname, image_url) values (${guid}, ${nickname}, ${imageUrl})
    on conflict (guid) do update set
      nickname = coalesce(excluded.nickname, fantasy.users.nickname),
      image_url = coalesce(excluded.image_url, fantasy.users.image_url),
      last_seen = now()`;
}

/** Record the leagues a user is in, every season, and drop ones they left. */
export async function saveUserLeagues(guid: string, leagues: LeagueSummary[], teams: UserTeam[]) {
  const s = sql();
  const teamOf = new Map(teams.map((t) => [t.leagueKey, t.teamKey]));
  await s.begin(async (tx) => {
    for (const l of leagues) {
      await tx`
        insert into fantasy.leagues (league_key, game_key, season, name, num_teams, scoring_type,
          current_week, is_finished, renew, renewed, logo_url, url)
        values (${l.key}, ${l.gameKey}, ${l.season}, ${l.name}, ${l.numTeams}, ${l.scoringType},
          ${l.currentWeek}, ${l.isFinished}, ${l.renew}, ${l.renewed}, ${l.logoUrl}, ${l.url})
        on conflict (league_key) do update set
          name = excluded.name, num_teams = excluded.num_teams,
          current_week = coalesce(excluded.current_week, fantasy.leagues.current_week),
          is_finished = excluded.is_finished, renew = excluded.renew, renewed = excluded.renewed,
          logo_url = excluded.logo_url, url = excluded.url`;
      await tx`
        insert into fantasy.league_members (guid, league_key, team_key)
        values (${guid}, ${l.key}, ${teamOf.get(l.key) ?? null})
        on conflict (guid, league_key) do update set team_key = excluded.team_key`;
    }
    const keys = leagues.map((l) => l.key);
    await tx`delete from fantasy.league_members where guid = ${guid} and not (league_key = any(${keys}))`;
  });
}

export interface LeagueRow {
  league_key: string;
  season: number;
  name: string;
  num_teams: number | null;
  logo_url: string | null;
  renew: string | null;
  renewed: string | null;
  is_finished: boolean;
  current_week: number | null;
  team_key: string | null;
  team_name: string | null;
  synced_at: Date | null;
}

export async function leaguesFor(guid: string): Promise<LeagueRow[]> {
  return sql()<LeagueRow[]>`
    select l.league_key, l.season, l.name, l.num_teams, l.logo_url, l.renew, l.renewed, l.is_finished,
           l.current_week, m.team_key, t.name as team_name, l.synced_at
    from fantasy.league_members m
    join fantasy.leagues l on l.league_key = m.league_key
    left join fantasy.teams t on t.team_key = m.team_key
    where m.guid = ${guid}
    order by l.season desc, l.name`;
}

export async function isMember(guid: string, leagueKey: string): Promise<boolean> {
  const r = await sql()`select 1 from fantasy.league_members where guid = ${guid} and league_key = ${leagueKey}`;
  return r.length > 0;
}

// ---------------------------------------------------------------- league settings and teams

export async function saveLeague(meta: LeagueMeta) {
  await sql()`
    insert into fantasy.leagues (league_key, game_key, season, name, num_teams, scoring_type, start_week, end_week,
      current_week, is_finished, uses_playoff, playoff_start_week, num_playoff_teams, reseed, roster_positions,
      divisions, renew, renewed, logo_url, url, settings_at)
    values (${meta.key}, ${meta.gameKey}, ${meta.season}, ${meta.name}, ${meta.numTeams}, ${meta.scoringType},
      ${meta.startWeek}, ${meta.endWeek}, ${meta.currentWeek}, ${meta.isFinished}, ${meta.usesPlayoff},
      ${meta.playoffStartWeek}, ${meta.numPlayoffTeams}, ${meta.reseed}, ${sql().json(meta.rosterPositions as never)},
      ${sql().json(meta.divisions)}, ${meta.renew}, ${meta.renewed}, ${meta.logoUrl}, ${meta.url}, now())
    on conflict (league_key) do update set
      name = excluded.name, num_teams = excluded.num_teams, scoring_type = excluded.scoring_type,
      start_week = excluded.start_week, end_week = excluded.end_week, current_week = excluded.current_week,
      is_finished = excluded.is_finished, uses_playoff = excluded.uses_playoff,
      playoff_start_week = excluded.playoff_start_week, num_playoff_teams = excluded.num_playoff_teams,
      reseed = excluded.reseed, roster_positions = excluded.roster_positions, divisions = excluded.divisions,
      renew = excluded.renew, renewed = excluded.renewed, logo_url = coalesce(excluded.logo_url, fantasy.leagues.logo_url),
      url = coalesce(excluded.url, fantasy.leagues.url), settings_at = now()`;
}

export async function saveTeams(leagueKey: string, teams: TeamInfo[]) {
  // One statement for the whole league: the database may be far away.
  const rows = teams.map((t) => ({
    team_key: t.key, name: t.name, logo_url: t.logoUrl, division_id: t.divisionId,
    manager_guid: t.managerGuid, manager_name: t.managerName, yahoo_rank: t.yahooRank,
    yahoo_seed: t.yahooSeed, wins: t.wins, losses: t.losses, ties: t.ties, points_for: t.pointsFor,
  }));
  await sql()`
    insert into fantasy.teams (team_key, league_key, name, logo_url, division_id, manager_guid, manager_name,
      yahoo_rank, yahoo_seed, wins, losses, ties, points_for)
    select x.team_key, ${leagueKey}, x.name, x.logo_url, x.division_id, x.manager_guid, x.manager_name,
      x.yahoo_rank, x.yahoo_seed, x.wins, x.losses, x.ties, x.points_for
    from jsonb_to_recordset(${sql().json(rows)}) as x(team_key text, name text, logo_url text, division_id text,
      manager_guid text, manager_name text, yahoo_rank int, yahoo_seed int, wins int, losses int, ties int,
      points_for numeric)
    on conflict (team_key) do update set
      name = excluded.name, logo_url = excluded.logo_url, division_id = excluded.division_id,
      manager_guid = excluded.manager_guid, manager_name = excluded.manager_name,
      yahoo_rank = excluded.yahoo_rank, yahoo_seed = excluded.yahoo_seed, wins = excluded.wins,
      losses = excluded.losses, ties = excluded.ties, points_for = excluded.points_for`;
}

// ---------------------------------------------------------------- weeks

export interface SyncState {
  settingsAt: Date | null;
  meta: LeagueMeta | null;
  teams: string[];
  weeks: Map<number, { scoreboardAt: Date | null; final: boolean }>;
  rosters: Map<string, { fetchedAt: Date; final: boolean; error: string | null }>;
}

export async function syncState(leagueKey: string): Promise<SyncState> {
  const s = sql();
  const [l] = await s`select * from fantasy.leagues where league_key = ${leagueKey}`;
  const teams = await s<{ team_key: string }[]>`select team_key from fantasy.teams where league_key = ${leagueKey}`;
  const weeks = await s<{ week: number; scoreboard_at: Date | null; final: boolean }[]>`
    select week, scoreboard_at, final from fantasy.weeks where league_key = ${leagueKey}`;
  const rf = await s<{ week: number; team_key: string; fetched_at: Date; final: boolean; error: string | null }[]>`
    select week, team_key, fetched_at, final, error from fantasy.roster_fetches where league_key = ${leagueKey}`;
  return {
    settingsAt: l?.settings_at ?? null,
    meta: l?.settings_at ? rowToMeta(l) : null,
    teams: teams.map((t) => t.team_key),
    weeks: new Map(weeks.map((w) => [w.week, { scoreboardAt: w.scoreboard_at, final: w.final }])),
    rosters: new Map(rf.map((r) => [`${r.week}|${r.team_key}`, { fetchedAt: r.fetched_at, final: r.final, error: r.error }])),
  };
}

export async function saveScoreboard(leagueKey: string, week: number, matchups: Matchup[], final: boolean) {
  const rows = matchups.map((m, idx) => ({
    idx, team_a: m.teams[0], team_b: m.teams[1], points_a: m.points[0], points_b: m.points[1],
    proj_a: m.projected[0], proj_b: m.projected[1], is_playoffs: m.isPlayoffs,
    is_consolation: m.isConsolation, winner: m.winner, status: m.status,
  }));
  await sql().begin(async (tx) => {
    await tx`delete from fantasy.matchups where league_key = ${leagueKey} and week = ${week}`;
    await tx`
      insert into fantasy.matchups (league_key, week, idx, team_a, team_b, points_a, points_b, proj_a, proj_b,
        is_playoffs, is_consolation, winner, status)
      select ${leagueKey}, ${week}, x.idx, x.team_a, x.team_b, x.points_a, x.points_b, x.proj_a, x.proj_b,
        x.is_playoffs, x.is_consolation, x.winner, x.status
      from jsonb_to_recordset(${tx.json(rows)}) as x(idx int, team_a text, team_b text, points_a numeric,
        points_b numeric, proj_a numeric, proj_b numeric, is_playoffs boolean, is_consolation boolean,
        winner text, status text)`;
    await tx`
      insert into fantasy.weeks (league_key, week, scoreboard_at, final) values (${leagueKey}, ${week}, now(), ${final})
      on conflict (league_key, week) do update set scoreboard_at = now(), final = excluded.final`;
  });
}

export async function saveRoster(leagueKey: string, week: number, teamKey: string, spots: Spot[], final: boolean) {
  const rows = spots.map((p) => ({
    player_key: p.playerKey, name: p.name, nfl_team: p.nflTeam, position: p.position,
    eligible: p.eligible, slot: p.slot, points: p.points,
  }));
  await sql().begin(async (tx) => {
    await tx`delete from fantasy.roster_spots where league_key = ${leagueKey} and week = ${week} and team_key = ${teamKey}`;
    await tx`
      insert into fantasy.roster_spots (league_key, week, team_key, player_key, name, nfl_team, position, eligible, slot, points)
      select ${leagueKey}, ${week}, ${teamKey}, x.player_key, x.name, x.nfl_team, x.position,
        coalesce(x.eligible, '{}'), x.slot, x.points
      from jsonb_to_recordset(${tx.json(rows)}) as x(player_key text, name text, nfl_team text, position text,
        eligible text[], slot text, points numeric)
      on conflict do nothing`;
    await tx`
      insert into fantasy.roster_fetches (league_key, week, team_key, fetched_at, final, error)
      values (${leagueKey}, ${week}, ${teamKey}, now(), ${final}, null)
      on conflict (league_key, week, team_key) do update set fetched_at = now(), final = excluded.final, error = null`;
  });
}

export async function rosterFailed(leagueKey: string, week: number, teamKey: string, error: string) {
  await sql()`
    insert into fantasy.roster_fetches (league_key, week, team_key, fetched_at, final, error)
    values (${leagueKey}, ${week}, ${teamKey}, now(), false, ${error.slice(0, 300)})
    on conflict (league_key, week, team_key) do update set fetched_at = now(), error = excluded.error`;
}

export async function markSynced(leagueKey: string) {
  await sql()`update fantasy.leagues set synced_at = now() where league_key = ${leagueKey}`;
}

// ---------------------------------------------------------------- loading a season

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToMeta(l: any): LeagueMeta {
  return {
    key: l.league_key,
    gameKey: l.game_key,
    season: l.season,
    name: l.name,
    numTeams: l.num_teams ?? 0,
    scoringType: l.scoring_type ?? "head",
    startWeek: l.start_week ?? 1,
    endWeek: l.end_week ?? 17,
    currentWeek: l.current_week ?? 1,
    isFinished: l.is_finished,
    usesPlayoff: l.uses_playoff,
    playoffStartWeek: l.playoff_start_week,
    numPlayoffTeams: l.num_playoff_teams ?? 0,
    reseed: l.reseed,
    rosterPositions: l.roster_positions ?? [],
    divisions: l.divisions ?? {},
    renew: l.renew,
    renewed: l.renewed,
    logoUrl: l.logo_url,
    url: l.url,
  };
}

export async function loadSeason(leagueKey: string): Promise<Season | null> {
  const s = sql();
  const [l] = await s`select * from fantasy.leagues where league_key = ${leagueKey}`;
  if (!l || !l.settings_at) return null;
  const teams = await s`select * from fantasy.teams where league_key = ${leagueKey} order by team_key`;
  const ms = await s`select * from fantasy.matchups where league_key = ${leagueKey} order by week, idx`;
  const spots = await s`
    select week, team_key, player_key, name, nfl_team, position, eligible, slot, points
    from fantasy.roster_spots where league_key = ${leagueKey}`;
  const rosters: Season["rosters"] = {};
  for (const r of spots) {
    ((rosters[r.week] ??= {})[r.team_key] ??= []).push({
      playerKey: r.player_key,
      name: r.name,
      nflTeam: r.nfl_team ?? "",
      position: r.position ?? "",
      eligible: r.eligible ?? [],
      slot: r.slot,
      points: Number(r.points),
    });
  }
  return {
    league: rowToMeta(l),
    teams: teams.map(
      (t): TeamInfo => ({
        key: t.team_key,
        name: t.name,
        logoUrl: t.logo_url,
        divisionId: t.division_id,
        managerGuid: t.manager_guid,
        managerName: t.manager_name,
        yahooRank: t.yahoo_rank,
        yahooSeed: t.yahoo_seed,
        wins: t.wins,
        losses: t.losses,
        ties: t.ties,
        pointsFor: n(t.points_for),
      }),
    ),
    matchups: ms.map(
      (m): Matchup => ({
        week: m.week,
        teams: [m.team_a, m.team_b],
        points: [Number(m.points_a), Number(m.points_b)],
        projected: [n(m.proj_a), n(m.proj_b)],
        isPlayoffs: m.is_playoffs,
        isConsolation: m.is_consolation,
        winner: m.winner,
        status: m.status,
      }),
    ),
    rosters,
  };
}

// ---------------------------------------------------------------- prefs

export interface Prefs {
  divisionNames: Record<string, string>;
  options: EngineOptions;
}

export async function loadPrefs(leagueKey: string): Promise<Prefs> {
  const [p] = await sql()`select * from fantasy.league_prefs where league_key = ${leagueKey}`;
  return {
    divisionNames: p?.division_names ?? {},
    options: {
      includeReserve: p?.include_reserve ?? false,
      kothSchedule: p?.koth_schedule ?? DEFAULT_KOTH,
    },
  };
}

export async function savePrefs(
  leagueKey: string,
  p: { divisionNames?: Record<string, string>; kothSchedule?: Record<number, number> | null; includeReserve?: boolean },
) {
  const cur = await loadPrefs(leagueKey);
  await sql()`
    insert into fantasy.league_prefs (league_key, division_names, koth_schedule, include_reserve, updated_at)
    values (${leagueKey}, ${sql().json(p.divisionNames ?? cur.divisionNames)},
      ${p.kothSchedule === undefined ? sql().json(cur.options.kothSchedule) : p.kothSchedule === null ? null : sql().json(p.kothSchedule)},
      ${p.includeReserve ?? cur.options.includeReserve}, now())
    on conflict (league_key) do update set
      division_names = excluded.division_names, koth_schedule = excluded.koth_schedule,
      include_reserve = excluded.include_reserve, updated_at = now()`;
}

/** The member to act as for a league: whoever was here most recently. */
export async function activeMember(leagueKey: string): Promise<string | null> {
  const [r] = await sql()<{ guid: string }[]>`
    select m.guid from fantasy.league_members m
    join fantasy.users u on u.guid = m.guid
    join fantasy.yahoo_tokens t on t.guid = m.guid
    where m.league_key = ${leagueKey}
    order by u.last_seen desc limit 1`;
  return r?.guid ?? null;
}

export async function currentSeasonLeagues(): Promise<string[]> {
  const rows = await sql()<{ league_key: string }[]>`
    select league_key from fantasy.leagues
    where not is_finished and settings_at is not null
      and season >= extract(year from now())::int - 1`;
  return rows.map((r) => r.league_key);
}
