// The shapes everything else agrees on. Parsed from Yahoo, stored in the
// database, rebuilt from it, and fed to the engine. Nothing here is computed.

export interface RosterPosition {
  position: string;
  count: number;
}

export interface LeagueMeta {
  key: string;
  gameKey: string;
  season: number;
  name: string;
  numTeams: number;
  scoringType: string;
  startWeek: number;
  endWeek: number;
  currentWeek: number;
  isFinished: boolean;
  usesPlayoff: boolean;
  playoffStartWeek: number | null;
  numPlayoffTeams: number;
  reseed: boolean;
  rosterPositions: RosterPosition[];
  /** division id to name */
  divisions: Record<string, string>;
  /** previous season, as Yahoo writes it: "{game_id}_{league_id}" */
  renew: string | null;
  /** next season, same format */
  renewed: string | null;
  logoUrl: string | null;
  url: string | null;
}

export interface TeamInfo {
  key: string;
  name: string;
  logoUrl: string | null;
  divisionId: string | null;
  managerGuid: string | null;
  managerName: string | null;
  /** Yahoo's own standings, for checking the replay against. */
  yahooRank: number | null;
  yahooSeed: number | null;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  pointsFor: number | null;
}

export interface Matchup {
  week: number;
  teams: [string, string];
  points: [number, number];
  projected: [number | null, number | null];
  isPlayoffs: boolean;
  isConsolation: boolean;
  /** Yahoo's winner, or null for a tie or an unfinished game. */
  winner: string | null;
  /** preevent, midevent or postevent */
  status: string;
}

export interface Spot {
  playerKey: string;
  name: string;
  nflTeam: string;
  position: string;
  eligible: string[];
  /** Where the manager put him that week: QB, W/R/T, BN, IR... */
  slot: string;
  points: number;
}

/** One league, one season, everything the engine needs. */
export interface Season {
  league: LeagueMeta;
  teams: TeamInfo[];
  matchups: Matchup[];
  /** week -> team key -> that week's roster */
  rosters: Record<number, Record<string, Spot[]>>;
}

export interface EngineOptions {
  /** Count players Yahoo had in IR, IR+ or NA as available. Off by default. */
  includeReserve: boolean;
  /** King of the Hill strikes per week, by week number. */
  kothSchedule: Record<number, number>;
}

export const DEFAULT_KOTH: Record<number, number> = {
  1: 8, 2: 7, 3: 6, 4: 6, 5: 4, 6: 4, 7: 3, 8: 3, 9: 2, 10: 1, 11: 1, 12: 1, 13: 1,
};

export const DEFAULT_OPTIONS: EngineOptions = {
  includeReserve: false,
  kothSchedule: DEFAULT_KOTH,
};
