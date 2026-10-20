// A made-up league, so the app can be seen working before any Yahoo key
// exists. Twelve invented teams, invented players, invented scores, three
// seasons linked the way Yahoo links real ones. Deterministic: the same
// numbers every time.
import { optimalLineup, round2, startingSlots } from "./lineup.ts";
import { frame } from "./season.ts";
import { DEFAULT_OPTIONS, type LeagueMeta, type Matchup, type Season, type Spot, type TeamInfo } from "./types.ts";
import { playoffs, standings } from "./universes.ts";

export const SAMPLE_PREFIX = "sample-";
export const SAMPLE_SEASONS = [2024, 2025, 2026];
export const isSample = (key: string) => key.startsWith(SAMPLE_PREFIX);
export const sampleKey = (season: number) => `${SAMPLE_PREFIX}${season}`;
export const SAMPLE_LATEST = sampleKey(2026);

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TEAMS = [
  "Gridiron Goblins", "Fourth & Forever", "Bench Warmers Anonymous", "Waiver Wire Wizards",
  "Hail Mary Hustlers", "Punt Gods", "The Fumble Squad", "Taco Tuesday FC",
  "Two-Point Tyrants", "Red Zone Rejects", "Monday Night Mayhem", "Cheese Curd Crew",
];
const MANAGERS = ["Ace", "Bo", "Cy", "Dee", "Eli", "Flo", "Gus", "Hal", "Ivy", "Jo", "Kit", "Lu"];
const FIRST = [
  "Brock", "Dante", "Tre", "Malik", "Cody", "Jaxon", "Rico", "Deshawn", "Tanner", "Zeke", "Marcus", "Colt",
  "Isaiah", "Bryce", "Devin", "Kade", "Luther", "Omar", "Quincy", "Rashad", "Sly", "Tavon", "Wes", "Xavier",
];
const LAST = [
  "Hammer", "Stone", "Rivers", "Blaze", "Steele", "Fox", "Crane", "Holt", "Marsh", "Booker", "Kingsley",
  "Vance", "Pryor", "Dalton", "Cobb", "Ridge", "Wolfe", "Briggs", "Nash", "Quarles", "Tate", "Yates",
];
const NFL = [
  "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET", "GB", "HOU", "IND", "JAX", "KC",
  "LV", "LAC", "LAR", "MIA", "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SF", "SEA", "TB", "TEN", "WAS",
];
const MEAN: Record<string, [number, number]> = {
  QB: [18, 6], RB: [11, 6.5], WR: [11, 6.5], TE: [8, 5], K: [8, 4], DEF: [7, 6],
};
const BUILD: string[] = ["QB", "QB", "RB", "RB", "RB", "RB", "RB", "WR", "WR", "WR", "WR", "WR", "TE", "TE", "K", "DEF"];

const ROSTER_POSITIONS = [
  { position: "QB", count: 1 },
  { position: "WR", count: 2 },
  { position: "RB", count: 2 },
  { position: "TE", count: 1 },
  { position: "W/R/T", count: 1 },
  { position: "K", count: 1 },
  { position: "DEF", count: 1 },
  { position: "BN", count: 6 },
  { position: "IR", count: 1 },
];

interface Player {
  key: string;
  name: string;
  pos: string;
  nfl: string;
  quality: number;
}

function gauss(r: () => number) {
  return Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
}

function eligible(pos: string): string[] {
  return ["RB", "WR", "TE"].includes(pos) ? [pos, "W/R/T"] : [pos];
}

/** Round robin for an even number of teams: the circle method. */
function roundRobin(n: number, rounds: number): [number, number][][] {
  const ids = Array.from({ length: n }, (_, i) => i);
  const out: [number, number][][] = [];
  for (let r = 0; r < rounds; r++) {
    const pairs: [number, number][] = [];
    for (let i = 0; i < n / 2; i++) pairs.push([ids[i], ids[n - 1 - i]]);
    out.push(pairs);
    ids.splice(1, 0, ids.pop()!);
  }
  return out;
}

function generate(season: number): Season {
  const r = rng(season * 7919);
  const finished = season < 2026;
  const currentWeek = finished ? 17 : 7;
  const key = sampleKey(season);

  const league: LeagueMeta = {
    key,
    gameKey: "sample",
    season,
    name: "Sample League",
    numTeams: 12,
    scoringType: "head",
    startWeek: 1,
    endWeek: 17,
    currentWeek,
    isFinished: finished,
    usesPlayoff: true,
    playoffStartWeek: 15,
    numPlayoffTeams: 6,
    reseed: false,
    rosterPositions: ROSTER_POSITIONS,
    divisions: { "1": "North", "2": "South" },
    renew: SAMPLE_SEASONS.includes(season - 1) ? sampleKey(season - 1) : null,
    renewed: SAMPLE_SEASONS.includes(season + 1) ? sampleKey(season + 1) : null,
    logoUrl: null,
    url: null,
  };

  // Team names drift a little season to season; managers stay.
  const teams: TeamInfo[] = TEAMS.map((name, i) => ({
    key: `${key}.t.${i + 1}`,
    name: season === 2024 && i % 4 === 1 ? `${name} (old)` : name,
    logoUrl: null,
    divisionId: i < 6 ? "1" : "2",
    managerGuid: `SAMPLE-${i + 1}`,
    managerName: MANAGERS[i],
    yahooRank: null,
    yahooSeed: null,
    wins: null,
    losses: null,
    ties: null,
    pointsFor: null,
  }));

  // Rosters.
  const used = new Set<string>();
  let pid = 1;
  const byes = new Map(NFL.map((t) => [t, 5 + Math.floor(r() * 10)]));
  const squads: Player[][] = teams.map(() =>
    BUILD.map((pos) => {
      let name = "";
      do name = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
      while (used.has(name));
      used.add(name);
      return {
        key: `${key}.p.${pid++}`,
        name: pos === "DEF" ? `${NFL[Math.floor(r() * NFL.length)]} Defense` : name,
        pos,
        nfl: NFL[Math.floor(r() * NFL.length)],
        quality: 0.55 + r() * 0.9,
      };
    }),
  );
  const sloppiness = teams.map(() => 0.15 + r() * 0.5);
  const slots = startingSlots(ROSTER_POSITIONS);

  const lastWeek = finished ? 17 : currentWeek;
  const rosters: Season["rosters"] = {};
  const projectedTeam: Record<number, Record<string, number>> = {};
  for (let w = 1; w <= lastWeek; w++) {
    rosters[w] = {};
    projectedTeam[w] = {};
    teams.forEach((t, ti) => {
      const injured = Math.floor(r() * squads[ti].length);
      const raw = squads[ti].map((p, pi) => {
        const [m, sd] = MEAN[p.pos];
        const bye = byes.get(p.nfl) === w;
        const hurt = r() < 0.05;
        let pts = bye || hurt ? 0 : m * p.quality + gauss(r) * sd;
        if (p.pos === "K") pts = Math.max(pts, -2);
        else if (p.pos === "DEF") pts = Math.max(pts, -5);
        else pts = Math.max(pts, 0);
        // The week in progress: games still being played.
        if (!finished && w === currentWeek) pts *= 0.55;
        const proj = bye ? 0 : m * p.quality * (1 + gauss(r) * sloppiness[ti] * 0.6);
        return { p, pts: round2(pts), proj: round2(Math.max(proj, 0)), ir: pi === injured && w % 5 === 0 };
      });
      // The manager starts the best lineup by his own projections.
      const asProjected: Spot[] = raw
        .filter((x) => !x.ir)
        .map((x) => ({
          playerKey: x.p.key, name: x.p.name, nflTeam: x.p.nfl, position: x.p.pos,
          eligible: eligible(x.p.pos), slot: "BN", points: x.proj,
        }));
      const chosen = optimalLineup(slots, asProjected);
      const slotOf = new Map(chosen.placed.map((pl) => [pl.spot.playerKey, pl.slot]));
      projectedTeam[w][t.key] = chosen.points;
      rosters[w][t.key] = raw.map((x) => ({
        playerKey: x.p.key,
        name: x.p.name,
        nflTeam: x.p.nfl,
        position: x.p.pos,
        eligible: eligible(x.p.pos),
        slot: x.ir ? "IR" : slotOf.get(x.p.key) ?? "BN",
        points: x.pts,
      }));
    });
  }

  const starters = (w: number, k: string) =>
    round2(rosters[w][k].filter((s) => !["BN", "IR"].includes(s.slot)).reduce((a, s) => a + s.points, 0));

  // Regular season: weeks 1 to 14, round robin.
  const schedule = roundRobin(12, 11);
  const matchups: Matchup[] = [];
  for (let w = 1; w <= Math.min(14, lastWeek); w++) {
    for (const [a, b] of schedule[(w - 1) % 11]) {
      const ka = teams[a].key;
      const kb = teams[b].key;
      const live = !finished && w === currentWeek;
      const sa = starters(w, ka);
      const sb = starters(w, kb);
      matchups.push({
        week: w,
        teams: [ka, kb],
        points: [sa, sb],
        projected: [projectedTeam[w][ka], projectedTeam[w][kb]],
        isPlayoffs: false,
        isConsolation: false,
        winner: live || sa === sb ? null : sa > sb ? ka : kb,
        status: live ? "midevent" : "postevent",
      });
    }
  }

  const out: Season = { league, teams, matchups, rosters };
  if (!finished) return out;

  // Play the real playoffs, then record them the way Yahoo would.
  const f = frame(out, DEFAULT_OPTIONS);
  const table = standings(f, "actual");
  const bracket = playoffs(f, "actual", table);
  for (const round of bracket.rounds) {
    for (const g of round) {
      if (!g.b) continue;
      matchups.push({
        week: g.week,
        teams: [g.a, g.b],
        points: [g.sa ?? 0, g.sb ?? 0],
        projected: [projectedTeam[g.week][g.a], projectedTeam[g.week][g.b]],
        isPlayoffs: true,
        isConsolation: false,
        winner: g.winner,
        status: "postevent",
      });
    }
  }
  const final = bracket.rounds.at(-1)?.[0];
  const runner = final ? (final.winner === final.a ? final.b : final.a) : null;
  const order = [bracket.champion, runner, ...table.map((x) => x.team)].filter(
    (t, i, a): t is string => !!t && a.indexOf(t) === i,
  );
  for (const t of teams) {
    const row = table.find((x) => x.team === t.key)!;
    t.yahooSeed = row.seed;
    t.yahooRank = order.indexOf(t.key) + 1;
    t.wins = row.rec.w;
    t.losses = row.rec.l;
    t.ties = row.rec.t;
    t.pointsFor = row.pf;
  }
  return out;
}

const cache = new Map<number, Season>();

export function sampleSeason(key: string): Season | null {
  const season = Number(key.slice(SAMPLE_PREFIX.length));
  if (!SAMPLE_SEASONS.includes(season)) return null;
  if (!cache.has(season)) cache.set(season, generate(season));
  return cache.get(season)!;
}
