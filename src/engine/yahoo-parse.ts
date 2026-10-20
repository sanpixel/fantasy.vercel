// Yahoo Fantasy XML to the engine's shapes. XML because Yahoo's JSON nests
// lists under numeric keys. Every list element is forced to an array so a
// one-item list reads the same as a ten-item one.
import { XMLParser } from "fast-xml-parser";
import type { LeagueMeta, Matchup, Spot, TeamInfo } from "./types.ts";

const LISTS = new Set([
  "users.user",
  "games.game",
  "leagues.league",
  "teams.team",
  "matchups.matchup",
  "players.player",
  "eligible_positions.position",
  "roster_positions.roster_position",
  "divisions.division",
  "managers.manager",
  "stats.stat",
  "bye_weeks.week",
  "team_logos.team_logo",
]);

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (_name: string, jpath: unknown) => LISTS.has(String(jpath).split(".").slice(-2).join(".")),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type X = any;

export class YahooShapeError extends Error {}

function root(xml: string): X {
  const doc = parser.parse(xml);
  const fc = doc?.fantasy_content;
  if (!fc) {
    const msg = doc?.error?.description ?? "not a fantasy_content document";
    throw new YahooShapeError(`Yahoo answered with something unexpected: ${msg}`);
  }
  return fc;
}

const str = (v: unknown): string | null => (v === undefined || v === null || v === "" ? null : String(v));
const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const bool = (v: unknown) => String(v) === "1";
const list = (v: unknown): X[] => (Array.isArray(v) ? v : v === undefined || v === null || v === "" ? [] : [v]);

export function leagueKeyOf(teamKey: string): string {
  return teamKey.split(".t.")[0];
}

/** "449_340889" -> "449.l.340889" */
export function renewToKey(renew: string | null): string | null {
  if (!renew) return null;
  const m = /^(\d+)_(\d+)$/.exec(renew);
  return m ? `${m[1]}.l.${m[2]}` : null;
}

// ---------------------------------------------------------------- league

function leagueMeta(L: X): LeagueMeta {
  const s = L.settings ?? {};
  const divisions: Record<string, string> = {};
  for (const d of list(s.divisions?.division)) {
    const id = str(d.division_id);
    if (id) divisions[id] = str(d.name) ?? `Division ${id}`;
  }
  const key = String(L.league_key);
  return {
    key,
    gameKey: key.split(".l.")[0],
    season: num(L.season) ?? 0,
    name: str(L.name) ?? key,
    numTeams: num(L.num_teams) ?? 0,
    scoringType: str(L.scoring_type) ?? str(s.scoring_type) ?? "head",
    startWeek: num(L.start_week) ?? 1,
    endWeek: num(L.end_week) ?? 17,
    currentWeek: num(L.current_week) ?? 1,
    isFinished: bool(L.is_finished),
    usesPlayoff: s.uses_playoff === undefined ? true : bool(s.uses_playoff),
    playoffStartWeek: num(s.playoff_start_week),
    numPlayoffTeams: num(s.num_playoff_teams) ?? 0,
    reseed: bool(s.uses_playoff_reseeding),
    rosterPositions: list(s.roster_positions?.roster_position).map((rp: X) => ({
      position: String(rp.position),
      count: num(rp.count) ?? 0,
    })),
    divisions,
    renew: str(L.renew),
    renewed: str(L.renewed),
    logoUrl: str(L.logo_url),
    url: str(L.url),
  };
}

/** /league/{key}/settings */
export function parseLeagueSettings(xml: string): LeagueMeta {
  const L = root(xml).league;
  if (!L?.league_key) throw new YahooShapeError("No league in Yahoo's answer.");
  return leagueMeta(L);
}

/** /league/{key}/standings */
export function parseStandings(xml: string): TeamInfo[] {
  const L = root(xml).league;
  return list(L?.standings?.teams?.team).map((t: X) => {
    const st = t.team_standings ?? {};
    const mgr = list(t.managers?.manager)[0] ?? {};
    const logo = list(t.team_logos?.team_logo)[0];
    return {
      key: String(t.team_key),
      name: str(t.name) ?? String(t.team_key),
      logoUrl: str(logo?.url),
      divisionId: str(t.division_id),
      managerGuid: str(mgr.guid),
      managerName: str(mgr.nickname),
      yahooRank: num(st.rank),
      yahooSeed: num(st.playoff_seed),
      wins: num(st.outcome_totals?.wins),
      losses: num(st.outcome_totals?.losses),
      ties: num(st.outcome_totals?.ties),
      pointsFor: num(st.points_for),
    };
  });
}

/** /league/{key}/scoreboard;week=N */
export function parseScoreboard(xml: string): Matchup[] {
  const L = root(xml).league;
  return list(L?.scoreboard?.matchups?.matchup)
    .map((m: X): Matchup | null => {
      const teams = list(m.teams?.team);
      if (teams.length !== 2) return null;
      return {
        week: num(m.week) ?? num(L.scoreboard.week) ?? 0,
        teams: [String(teams[0].team_key), String(teams[1].team_key)],
        points: [num(teams[0].team_points?.total) ?? 0, num(teams[1].team_points?.total) ?? 0],
        projected: [num(teams[0].team_projected_points?.total), num(teams[1].team_projected_points?.total)],
        isPlayoffs: bool(m.is_playoffs),
        isConsolation: bool(m.is_consolation),
        winner: bool(m.is_tied) ? null : str(m.winner_team_key),
        status: str(m.status) ?? "preevent",
      };
    })
    .filter((m): m is Matchup => m !== null);
}

export interface ParsedRoster {
  teamKey: string;
  teamName: string;
  week: number;
  spots: Spot[];
  /** players Yahoo sent without player_points */
  missingPoints: string[];
}

/**
 * /team/{key}/roster;week=N/players/stats;type=week;week=N
 *
 * Yahoo only returns the roster as it stood in week N when roster;week=N is in
 * the path. Without it, it returns today's lineup with week N's points, which
 * is the bug the old app chased. The week is checked, not trusted.
 */
export function parseRoster(xml: string, expectedWeek?: number): ParsedRoster {
  const T = root(xml).team;
  if (!T?.team_key) throw new YahooShapeError("No team in Yahoo's answer.");
  const R = T.roster ?? {};
  const week = num(R.week) ?? 0;
  if (expectedWeek !== undefined && week !== expectedWeek) {
    throw new YahooShapeError(
      `Yahoo sent the week ${week} lineup when week ${expectedWeek} was asked for.`,
    );
  }
  const missingPoints: string[] = [];
  const spots = list(R.players?.player).map((p: X): Spot => {
    const pp = p.player_points;
    const ptsWeek = num(pp?.week);
    if (expectedWeek !== undefined && ptsWeek !== null && ptsWeek !== expectedWeek) {
      throw new YahooShapeError(`Points for week ${ptsWeek} arrived for week ${expectedWeek}.`);
    }
    const total = num(pp?.total);
    if (total === null) missingPoints.push(str(p.name?.full) ?? String(p.player_key));
    return {
      playerKey: String(p.player_key),
      name: str(p.name?.full) ?? String(p.player_key),
      nflTeam: str(p.editorial_team_abbr) ?? "",
      position: str(p.display_position) ?? str(p.primary_position) ?? "",
      eligible: list(p.eligible_positions?.position).map(String),
      slot: str(p.selected_position?.position) ?? "BN",
      points: total ?? 0,
    };
  });
  return { teamKey: String(T.team_key), teamName: str(T.name) ?? "", week, spots, missingPoints };
}

// ---------------------------------------------------------------- the user

export interface LeagueSummary {
  key: string;
  gameKey: string;
  season: number;
  name: string;
  numTeams: number;
  logoUrl: string | null;
  url: string | null;
  renew: string | null;
  renewed: string | null;
  isFinished: boolean;
  currentWeek: number | null;
  scoringType: string | null;
}

/** /users;use_login=1/games;game_codes=nfl/leagues */
export function parseUserLeagues(xml: string): { guid: string; leagues: LeagueSummary[] } {
  const U = list(root(xml).users?.user)[0];
  if (!U?.guid) throw new YahooShapeError("Yahoo did not say who is signed in.");
  const leagues: LeagueSummary[] = [];
  for (const g of list(U.games?.game)) {
    for (const L of list(g.leagues?.league)) {
      const key = String(L.league_key);
      leagues.push({
        key,
        gameKey: key.split(".l.")[0],
        season: num(L.season) ?? num(g.season) ?? 0,
        name: str(L.name) ?? key,
        numTeams: num(L.num_teams) ?? 0,
        logoUrl: str(L.logo_url),
        url: str(L.url),
        renew: str(L.renew),
        renewed: str(L.renewed),
        isFinished: bool(L.is_finished),
        currentWeek: num(L.current_week),
        scoringType: str(L.scoring_type),
      });
    }
  }
  return { guid: String(U.guid), leagues };
}

export interface UserTeam {
  teamKey: string;
  leagueKey: string;
  name: string;
  nickname: string | null;
  imageUrl: string | null;
}

/** /users;use_login=1/games;game_codes=nfl/teams */
export function parseUserTeams(xml: string): UserTeam[] {
  const U = list(root(xml).users?.user)[0];
  const out: UserTeam[] = [];
  for (const g of list(U?.games?.game)) {
    for (const t of list(g.teams?.team)) {
      const mgrs = list(t.managers?.manager);
      const me = mgrs.find((m: X) => bool(m.is_current_login)) ?? mgrs[0] ?? {};
      const key = String(t.team_key);
      out.push({
        teamKey: key,
        leagueKey: leagueKeyOf(key),
        name: str(t.name) ?? key,
        nickname: str(me.nickname),
        imageUrl: str(me.image_url),
      });
    }
  }
  return out;
}
