// Pulling a league from Yahoo into the database, resumably.
//
// A sync does what is missing or stale, oldest week first, four requests at a
// time, and stops at its deadline. The page calls again until it is done.
// Final weeks are fetched once and never again.
import {
  parseLeagueSettings,
  parseRoster,
  parseScoreboard,
  parseStandings,
  parseUserLeagues,
  parseUserTeams,
} from "@/engine/yahoo-parse";
import * as store from "./store";
import { yget } from "./yahoo";

const LIVE_MS = 10 * 60_000;
const SETTINGS_MS = 6 * 60 * 60_000;

/** Read every NFL league, every season, this Yahoo user is in. */
export async function syncLeagueList(guid: string) {
  const [lx, tx] = await Promise.all([
    yget(guid, "/users;use_login=1/games;game_codes=nfl/leagues"),
    yget(guid, "/users;use_login=1/games;game_codes=nfl/teams"),
  ]);
  const { leagues } = parseUserLeagues(lx);
  const teams = parseUserTeams(tx);
  const me = teams.find((t) => t.nickname);
  await store.upsertUser(guid, me?.nickname ?? null, me?.imageUrl ?? null);
  await store.saveUserLeagues(guid, leagues, teams);
  return leagues.length;
}

export interface SyncResult {
  done: boolean;
  fetched: number;
  remaining: number;
  errors: string[];
}

async function pool<T>(items: T[], size: number, deadline: number, run: (t: T) => Promise<void>) {
  let i = 0;
  let ran = 0;
  async function worker() {
    while (i < items.length && Date.now() < deadline) {
      const t = items[i++];
      await run(t);
      ran++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return ran;
}

export async function syncLeague(leagueKey: string, guid: string, budgetMs = 50_000): Promise<SyncResult> {
  const deadline = Date.now() + budgetMs;
  const errors: string[] = [];
  let state = await store.syncState(leagueKey);
  let fetched = 0;

  // Settings and standings: when missing, every few hours, or while live.
  const settingsAge = state.settingsAt ? Date.now() - state.settingsAt.getTime() : Infinity;
  const live = state.meta && !state.meta.isFinished;
  if (!state.meta || settingsAge > (live ? LIVE_MS : SETTINGS_MS) || state.teams.length === 0) {
    const [sx, tx] = await Promise.all([
      yget(guid, `/league/${leagueKey}/settings`),
      yget(guid, `/league/${leagueKey}/standings`),
    ]);
    await store.saveLeague(parseLeagueSettings(sx));
    await store.saveTeams(leagueKey, parseStandings(tx));
    fetched += 2;
    state = await store.syncState(leagueKey);
  }
  const meta = state.meta!;
  const last = meta.isFinished ? meta.endWeek : Math.min(meta.currentWeek, meta.endWeek);
  const isFinal = (w: number) => meta.isFinished || w < meta.currentWeek - 1;
  const stale = (at: Date | null | undefined) => !at || Date.now() - at.getTime() > LIVE_MS;

  const weeks: number[] = [];
  for (let w = meta.startWeek; w <= last; w++) weeks.push(w);

  // Scoreboards.
  const boards = weeks.filter((w) => {
    const s = state.weeks.get(w);
    return !s || (!s.final && (isFinal(w) || stale(s.scoreboardAt)));
  });
  fetched += await pool(boards, 4, deadline, async (w) => {
    try {
      const ms = parseScoreboard(await yget(guid, `/league/${leagueKey}/scoreboard;week=${w}`));
      await store.saveScoreboard(leagueKey, w, ms, isFinal(w) && ms.every((m) => m.status === "postevent"));
    } catch (e) {
      errors.push(`Week ${w} scoreboard: ${(e as Error).message}`);
    }
  });

  // Rosters, with that week's points.
  const rosters: [number, string][] = [];
  for (const w of weeks) {
    for (const t of state.teams) {
      const r = state.rosters.get(`${w}|${t}`);
      if (!r || (!r.final && (isFinal(w) || stale(r.fetchedAt)))) rosters.push([w, t]);
    }
  }
  fetched += await pool(rosters, 4, deadline, async ([w, t]) => {
    try {
      const xml = await yget(guid, `/team/${t}/roster;week=${w}/players/stats;type=week;week=${w}`);
      const r = parseRoster(xml, w);
      await store.saveRoster(leagueKey, w, t, r.spots, isFinal(w));
    } catch (e) {
      const msg = (e as Error).message;
      errors.push(`Week ${w}, ${t}: ${msg}`);
      await store.rosterFailed(leagueKey, w, t, msg);
    }
  });

  const after = await store.syncState(leagueKey);
  let remaining = weeks.filter((w) => !after.weeks.has(w)).length;
  for (const w of weeks) {
    for (const t of after.teams) {
      const r = after.rosters.get(`${w}|${t}`);
      if (!r || (r.error && Date.now() - r.fetchedAt.getTime() > 60_000)) remaining++;
    }
  }
  const done = remaining === 0 || Date.now() < deadline;
  if (done) await store.markSynced(leagueKey);
  return { done, fetched, remaining: done ? 0 : remaining, errors: errors.slice(0, 20) };
}

/** True when opening the league should start a sync. */
export async function needsSync(leagueKey: string): Promise<boolean> {
  const s = await store.syncState(leagueKey);
  if (!s.meta || s.teams.length === 0) return true;
  const m = s.meta;
  const last = m.isFinished ? m.endWeek : Math.min(m.currentWeek, m.endWeek);
  for (let w = m.startWeek; w <= last; w++) {
    const wk = s.weeks.get(w);
    if (!wk) return true;
    if (!wk.final && (!wk.scoreboardAt || Date.now() - wk.scoreboardAt.getTime() > LIVE_MS)) return true;
    for (const t of s.teams) if (!s.rosters.has(`${w}|${t}`)) return true;
  }
  return false;
}
