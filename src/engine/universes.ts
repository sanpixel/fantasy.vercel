// Re-imagined winners. A universe is a scoring lens (what each team scored)
// played through a format (how scores turn into a table and a champion).
import { round2 } from "./lineup.ts";
import { frame, type SeasonFrame } from "./season.ts";
import { DEFAULT_OPTIONS, type EngineOptions, type Season } from "./types.ts";

export type Lens = "actual" | "bestBall" | "projected" | "floor";
export type Format = "h2h" | "median" | "allplay" | "points" | "koth";

export const LENS_LABEL: Record<Lens, string> = {
  actual: "Real",
  bestBall: "Best ball",
  projected: "Projected",
  floor: "Floor",
};

export interface Rec {
  w: number;
  l: number;
  t: number;
}

export const games = (r: Rec) => r.w + r.l + r.t;
export const pct = (r: Rec) => (games(r) ? (r.w + r.t / 2) / games(r) : 0);
export const fmtRec = (r: Rec) => `${r.w}-${r.l}${r.t ? `-${r.t}` : ""}`;
const zero = (): Rec => ({ w: 0, l: 0, t: 0 });

/** +1 if a beats b, -1 if b beats a, 0 for a tie, at two decimals. */
function cmp(a: number, b: number): number {
  const d = Math.round(a * 100) - Math.round(b * 100);
  return d > 0 ? 1 : d < 0 ? -1 : 0;
}

function add(r: Rec, c: number) {
  if (c > 0) r.w++;
  else if (c < 0) r.l++;
  else r.t++;
}

export function score(f: SeasonFrame, lens: Lens, team: string, week: number): number | null {
  const v = f.tw[team]?.[week]?.[lens];
  return v === undefined ? null : v;
}

export interface Row {
  team: string;
  rec: Rec;
  /** Versus-median games only, for the median format. */
  median: Rec;
  div: Rec;
  allPlay: Rec;
  pf: number;
  pa: number;
  place: number;
  seed: number | null;
}

function emptyRows(f: SeasonFrame): Map<string, Row> {
  return new Map(
    f.season.teams.map((t) => [
      t.key,
      { team: t.key, rec: zero(), median: zero(), div: zero(), allPlay: zero(), pf: 0, pa: 0, place: 0, seed: null },
    ]),
  );
}

function allPlayInto(f: SeasonFrame, lens: Lens, rows: Map<string, Row>) {
  for (const w of f.regularWeeks) {
    const s = f.season.teams
      .map((t) => ({ k: t.key, v: score(f, lens, t.key, w) }))
      .filter((x): x is { k: string; v: number } => x.v !== null);
    for (const a of s) for (const b of s) if (a.k !== b.k) add(rows.get(a.k)!.allPlay, cmp(a.v, b.v));
  }
}

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function order(f: SeasonFrame, rows: Map<string, Row>, by: "rec" | "points" | "allplay"): Row[] {
  const name = (k: string) => f.season.teams.find((t) => t.key === k)?.name ?? k;
  const list = [...rows.values()].sort((a, b) => {
    if (by === "rec" && pct(b.rec) !== pct(a.rec)) return pct(b.rec) - pct(a.rec);
    if (by === "allplay" && pct(b.allPlay) !== pct(a.allPlay)) return pct(b.allPlay) - pct(a.allPlay);
    return b.pf - a.pf || b.allPlay.w - a.allPlay.w || name(a.team).localeCompare(name(b.team));
  });
  list.forEach((r, i) => (r.place = i + 1));
  return list;
}

/** Regular-season table for a lens, head to head, optionally plus the median game. */
export function standings(f: SeasonFrame, lens: Lens, withMedian = false): Row[] {
  const rows = emptyRows(f);
  const div = new Map(f.season.teams.map((t) => [t.key, t.divisionId]));
  allPlayInto(f, lens, rows);
  for (const w of f.regularWeeks) {
    const wk = f.weeks.find((x) => x.week === w)!;
    for (const t of f.season.teams) {
      const v = score(f, lens, t.key, w);
      if (v !== null) rows.get(t.key)!.pf += v;
    }
    for (const m of wk.matchups) {
      if (m.isPlayoffs) continue;
      const [a, b] = m.teams;
      const sa = score(f, lens, a, w);
      const sb = score(f, lens, b, w);
      if (sa === null || sb === null || !rows.has(a) || !rows.has(b)) continue;
      const c = cmp(sa, sb);
      add(rows.get(a)!.rec, c);
      add(rows.get(b)!.rec, -c);
      rows.get(a)!.pa += sb;
      rows.get(b)!.pa += sa;
      if (div.get(a) && div.get(a) === div.get(b)) {
        add(rows.get(a)!.div, c);
        add(rows.get(b)!.div, -c);
      }
    }
    if (withMedian) {
      const vals = f.season.teams
        .map((t) => ({ k: t.key, v: score(f, lens, t.key, w) }))
        .filter((x): x is { k: string; v: number } => x.v !== null);
      if (vals.length > 1) {
        const m = median(vals.map((x) => x.v));
        for (const x of vals) {
          const c = cmp(x.v, m);
          add(rows.get(x.k)!.median, c);
          add(rows.get(x.k)!.rec, c);
        }
      }
    }
  }
  for (const r of rows.values()) {
    r.pf = round2(r.pf);
    r.pa = round2(r.pa);
  }
  const list = order(f, rows, "rec");
  const n = playoffSize(f);
  list.forEach((r, i) => (r.seed = i < n ? i + 1 : null));
  return list;
}

export function pointsTable(f: SeasonFrame, lens: Lens): Row[] {
  const rows = standings(f, lens);
  rows.sort((a, b) => b.pf - a.pf);
  rows.forEach((r, i) => {
    r.place = i + 1;
    r.seed = null;
  });
  return rows;
}

export function allPlayTable(f: SeasonFrame, lens: Lens): Row[] {
  const rows = new Map(standings(f, lens).map((r) => [r.team, r]));
  const list = order(f, rows, "allplay");
  list.forEach((r) => (r.seed = null));
  return list;
}

function playoffSize(f: SeasonFrame): number {
  const l = f.season.league;
  if (!l.usesPlayoff || !l.playoffStartWeek) return 0;
  return Math.min(l.numPlayoffTeams || 0, f.season.teams.length);
}

// ---------------------------------------------------------------- playoffs

export interface Game {
  round: number;
  week: number;
  a: string;
  b: string | null;
  seedA: number;
  seedB: number | null;
  sa: number | null;
  sb: number | null;
  winner: string | null;
}

export interface Bracket {
  rounds: Game[][];
  champion: string | null;
  complete: boolean;
}

/** Seed order for a bracket of size n: 1 v n, then the next pair down. */
export function bracketOrder(size: number): number[] {
  let o = [1];
  while (o.length < size) {
    const n = o.length * 2;
    o = o.flatMap((s) => [s, n + 1 - s]);
  }
  return o;
}

export function playoffs(f: SeasonFrame, lens: Lens, table: Row[]): Bracket {
  const l = f.season.league;
  const n = playoffSize(f);
  const regularDone =
    f.weeks.filter((w) => !w.playoffs).every((w) => w.complete) && f.regularWeeks.length > 0;
  if (n < 2 || !l.playoffStartWeek) {
    return { rounds: [], champion: regularDone ? table[0]?.team ?? null : null, complete: regularDone };
  }
  const seeds = table.slice(0, n).map((r) => r.team);
  const seedOf = new Map(seeds.map((t, i) => [t, i + 1]));
  let size = 1;
  while (size < n) size *= 2;

  // Round one: the fixed bracket, byes to the top seeds.
  let alive: (string | null)[] = bracketOrder(size).map((s) => (s <= n ? seeds[s - 1] : null));
  const rounds: Game[][] = [];
  let round = 1;
  while (alive.length > 1) {
    const week = l.playoffStartWeek + round - 1;
    const wk = f.weeks.find((w) => w.week === week);
    const done = !!wk?.complete;
    const games: Game[] = [];
    const next: (string | null)[] = [];
    for (let i = 0; i < alive.length; i += 2) {
      let a = alive[i];
      let b = alive[i + 1];
      if (!a) [a, b] = [b, a];
      if (!a) {
        next.push(null);
        continue;
      }
      if (!b) {
        // A bye: no game, straight through.
        next.push(a);
        continue;
      }
      const sa = done ? score(f, lens, a, week) : null;
      const sb = done ? score(f, lens, b, week) : null;
      let winner: string | null = null;
      if (sa !== null && sb !== null) {
        const c = cmp(sa, sb);
        // A tied playoff game goes to the higher seed.
        winner = c > 0 ? a : c < 0 ? b : seedOf.get(a)! < seedOf.get(b)! ? a : b;
      }
      games.push({ round, week, a, b, seedA: seedOf.get(a)!, seedB: seedOf.get(b)!, sa, sb, winner });
      next.push(winner);
    }
    rounds.push(games);
    // A round not played yet, or past the last week: the bracket stops here.
    if (games.some((g) => g.winner === null) || week > l.endWeek) {
      return { rounds, champion: null, complete: false };
    }
    alive = next;
    if (l.reseed && alive.length > 1 && alive.every(Boolean)) {
      const s = [...(alive as string[])].sort((x, y) => seedOf.get(x)! - seedOf.get(y)!);
      alive = [];
      for (let i = 0; i < s.length / 2; i++) alive.push(s[i], s[s.length - 1 - i]);
    }
    round++;
  }
  return { rounds, champion: alive[0] ?? null, complete: alive[0] !== null };
}

// ---------------------------------------------------------------- swap, regret

/** grid[row][col]: the row team's record playing the column team's schedule. */
export function scheduleSwap(f: SeasonFrame, lens: Lens): Record<string, Record<string, Rec>> {
  const opp = new Map<string, Map<number, string>>();
  for (const w of f.regularWeeks) {
    for (const m of f.weeks.find((x) => x.week === w)!.matchups) {
      if (m.isPlayoffs) continue;
      const [a, b] = m.teams;
      if (!opp.has(a)) opp.set(a, new Map());
      if (!opp.has(b)) opp.set(b, new Map());
      opp.get(a)!.set(w, b);
      opp.get(b)!.set(w, a);
    }
  }
  const grid: Record<string, Record<string, Rec>> = {};
  for (const r of f.season.teams) {
    grid[r.key] = {};
    for (const c of f.season.teams) {
      const rec = zero();
      for (const w of f.regularWeeks) {
        const o = opp.get(c.key)?.get(w);
        if (!o) continue;
        const vs = o === r.key ? c.key : o;
        const a = score(f, lens, r.key, w);
        const b = score(f, lens, vs, w);
        if (a !== null && b !== null) add(rec, cmp(a, b));
      }
      grid[r.key][c.key] = rec;
    }
  }
  return grid;
}

export interface Regret {
  team: string;
  actual: Rec;
  /** Your best lineup against their real one. */
  youPerfect: Rec;
  /** Your real lineup against their best one. */
  theyPerfect: Rec;
}

export function regret(f: SeasonFrame): Regret[] {
  const out = new Map(
    f.season.teams.map((t) => [t.key, { team: t.key, actual: zero(), youPerfect: zero(), theyPerfect: zero() }]),
  );
  for (const w of f.regularWeeks) {
    for (const m of f.weeks.find((x) => x.week === w)!.matchups) {
      if (m.isPlayoffs) continue;
      for (const [me, them] of [m.teams, [m.teams[1], m.teams[0]]] as [string, string][]) {
        const r = out.get(me);
        const a = score(f, "actual", me, w);
        const b = score(f, "actual", them, w);
        const A = score(f, "bestBall", me, w);
        const B = score(f, "bestBall", them, w);
        if (!r || a === null || b === null || A === null || B === null) continue;
        add(r.actual, cmp(a, b));
        add(r.youPerfect, cmp(A, b));
        add(r.theyPerfect, cmp(a, B));
      }
    }
  }
  return [...out.values()];
}

// ---------------------------------------------------------------- king of the hill

export interface KothRow {
  team: string;
  strikes: number;
  /** week -> took a strike */
  struck: Record<number, boolean>;
  out: number | null;
  scores: Record<number, number | null>;
}

export interface Koth {
  rows: KothRow[];
  weeks: number[];
  king: string | null;
  standing: number;
}

export function kingOfTheHill(f: SeasonFrame, lens: Lens, schedule: Record<number, number>): Koth {
  const rows = new Map<string, KothRow>(
    f.season.teams.map((t) => [t.key, { team: t.key, strikes: 0, struck: {}, out: null, scores: {} }]),
  );
  const toDate = new Map(f.season.teams.map((t) => [t.key, 0]));
  const weeks = f.weeks.filter((w) => w.complete && (schedule[w.week] ?? 0) > 0).map((w) => w.week);
  for (const w of f.weeks.filter((x) => x.complete).map((x) => x.week)) {
    for (const t of f.season.teams) {
      const v = score(f, lens, t.key, w);
      rows.get(t.key)!.scores[w] = v;
      toDate.set(t.key, toDate.get(t.key)! + (v ?? 0));
    }
    const n = schedule[w] ?? 0;
    if (!n) continue;
    const active = [...rows.values()]
      .filter((r) => r.out === null && r.scores[w] !== null)
      .map((r) => ({ r, v: r.scores[w] as number, pts: toDate.get(r.team)! }))
      .sort((a, b) => cmp(a.v, b.v) || a.pts - b.pts);
    if (active.length <= 1) continue;
    const take = Math.min(n, active.length - 1);
    const line = active[take - 1];
    const struck = active.filter(
      (x, i) => i < take || (cmp(x.v, line.v) === 0 && Math.round(x.pts * 100) === Math.round(line.pts * 100)),
    );
    for (const x of struck) {
      x.r.strikes++;
      x.r.struck[w] = true;
      if (x.r.strikes >= 3) x.r.out = w;
    }
  }
  const alive = [...rows.values()].filter((r) => r.out === null);
  // Still standing first, fewest strikes first; then the longest survivors.
  const list = [...rows.values()].sort(
    (a, b) =>
      (b.out ?? 99) - (a.out ?? 99) ||
      a.strikes - b.strikes ||
      (toDate.get(b.team) ?? 0) - (toDate.get(a.team) ?? 0),
  );
  return { rows: list, weeks, king: alive.length === 1 ? alive[0].team : null, standing: alive.length };
}

// ---------------------------------------------------------------- the board

export interface Universe {
  id: string;
  lens: Lens;
  format: Format;
  title: string;
  rule: string;
  champion: string | null;
  complete: boolean;
  /** The champion, or while undecided, whoever is on top right now. */
  leader: string | null;
  /** team -> finishing place in this universe */
  place: Record<string, number>;
  table?: Row[];
  bracket?: Bracket;
  koth?: Koth;
}

export interface TeamStats {
  team: string;
  bench: number;
  benchAvg: number;
  iq: number | null;
  luck: number;
  highs: number;
  universesWon: number;
  bestBallPoints: number;
  actualPoints: number;
}

export interface Board {
  frame: SeasonFrame;
  universes: Universe[];
  stats: TeamStats[];
  realChampion: string | null;
  checks: string[];
}

const FORMAT_RULE: Record<Format, string> = {
  h2h: "Real schedule, then the playoffs replayed",
  median: "Real schedule plus a game against the weekly median, then the playoffs",
  allplay: "Every team plays every team, every week",
  points: "Most points wins",
  koth: "Lowest scores take strikes; three and out",
};

function placeFromBracket(table: Row[], b: Bracket): Record<string, number> {
  const place: Record<string, number> = {};
  table.forEach((r) => (place[r.team] = r.place));
  if (b.champion && b.rounds.length) {
    const final = b.rounds[b.rounds.length - 1][0];
    const runner = final && final.winner ? (final.winner === final.a ? final.b : final.a) : null;
    // Champion first, runner-up second, everyone else by regular season.
    const order = [b.champion, runner, ...table.map((r) => r.team)].filter(
      (t, i, a): t is string => !!t && a.indexOf(t) === i,
    );
    order.forEach((t, i) => (place[t] = i + 1));
  }
  return place;
}

export function board(season: Season, opts: EngineOptions = DEFAULT_OPTIONS): Board {
  const f = frame(season, opts);
  const universes: Universe[] = [];
  const hasProjections = f.regularWeeks.some((w) =>
    f.season.teams.some((t) => score(f, "projected", t.key, w) !== null),
  );

  const h2hLenses: Lens[] = ["actual", "bestBall", ...(hasProjections ? (["projected"] as Lens[]) : []), "floor"];
  const regularDone = f.weeks.filter((w) => !w.playoffs).every((w) => w.complete) && f.regularWeeks.length > 0;
  for (const lens of h2hLenses) {
    const table = standings(f, lens);
    if (lens === "projected") {
      // Yahoo only projects teams that have a matchup, so teams knocked out
      // have no playoff projection to replay. The regular season decides it.
      universes.push({
        id: `h2h-${lens}`,
        lens,
        format: "h2h",
        title: `${LENS_LABEL[lens]} · head to head`,
        rule: "Real schedule, Yahoo's projections; first place after the regular season",
        champion: table[0]?.team ?? null,
        complete: regularDone,
        leader: null,
        place: Object.fromEntries(table.map((r) => [r.team, r.place])),
        table,
      });
      continue;
    }
    const bracket = playoffs(f, lens, table);
    universes.push({
      id: `h2h-${lens}`,
      lens,
      format: "h2h",
      title: `${LENS_LABEL[lens]} · head to head`,
      rule: FORMAT_RULE.h2h,
      champion: bracket.champion,
      complete: bracket.complete,
      leader: null,
      place: placeFromBracket(table, bracket),
      table,
      bracket,
    });
  }
  for (const lens of ["actual", "bestBall"] as Lens[]) {
    const table = standings(f, lens, true);
    const bracket = playoffs(f, lens, table);
    universes.push({
      id: `median-${lens}`,
      lens,
      format: "median",
      title: `${LENS_LABEL[lens]} · versus median`,
      rule: FORMAT_RULE.median,
      champion: bracket.champion,
      complete: bracket.complete,
      leader: null,
      place: placeFromBracket(table, bracket),
      table,
      bracket,
    });
  }
  for (const lens of ["actual", "bestBall"] as Lens[]) {
    const table = allPlayTable(f, lens);
    universes.push({
      id: `allplay-${lens}`,
      lens,
      format: "allplay",
      title: `${LENS_LABEL[lens]} · all-play`,
      rule: FORMAT_RULE.allplay,
      champion: table[0]?.team ?? null,
      complete: regularDone,
      leader: null,
      place: Object.fromEntries(table.map((r) => [r.team, r.place])),
      table,
    });
  }
  for (const lens of ["actual", "bestBall"] as Lens[]) {
    const table = pointsTable(f, lens);
    universes.push({
      id: `points-${lens}`,
      lens,
      format: "points",
      title: `${LENS_LABEL[lens]} · points only`,
      rule: FORMAT_RULE.points,
      champion: table[0]?.team ?? null,
      complete: regularDone,
      leader: null,
      place: Object.fromEntries(table.map((r) => [r.team, r.place])),
      table,
    });
  }
  for (const lens of ["actual", "bestBall"] as Lens[]) {
    const koth = kingOfTheHill(f, lens, opts.kothSchedule);
    const place: Record<string, number> = {};
    koth.rows.forEach((r, i) => (place[r.team] = i + 1));
    universes.push({
      id: `koth-${lens}`,
      lens,
      format: "koth",
      title: `${LENS_LABEL[lens]} · king of the hill`,
      rule: FORMAT_RULE.koth,
      champion: koth.king,
      complete: koth.king !== null,
      leader: null,
      place,
      koth,
    });
  }

  for (const u of universes) {
    u.leader = u.champion ?? u.table?.[0]?.team ?? u.koth?.rows[0]?.team ?? null;
  }

  // Season stats per team.
  const realAllPlay = new Map(standings(f, "actual").map((r) => [r.team, r]));
  const highs = new Map<string, number>();
  for (const w of f.regularWeeks) {
    let top: string | null = null;
    let topV = -Infinity;
    for (const t of f.season.teams) {
      const v = score(f, "actual", t.key, w);
      if (v !== null && v > topV) {
        topV = v;
        top = t.key;
      }
    }
    if (top) highs.set(top, (highs.get(top) ?? 0) + 1);
  }
  const stats: TeamStats[] = f.season.teams.map((t) => {
    let bench = 0;
    let n = 0;
    let act = 0;
    let bb = 0;
    for (const w of f.regularWeeks) {
      const x = f.tw[t.key][w];
      if (x?.bench != null && x.actual != null && x.bestBall != null) {
        bench += x.bench;
        act += x.actual;
        bb += x.bestBall;
        n++;
      }
    }
    const row = realAllPlay.get(t.key)!;
    const expected = pct(row.allPlay) * games(row.rec);
    return {
      team: t.key,
      bench: round2(bench),
      benchAvg: n ? round2(bench / n) : 0,
      iq: bb ? act / bb : null,
      luck: round2(row.rec.w + row.rec.t / 2 - expected),
      highs: highs.get(t.key) ?? 0,
      universesWon: universes.filter((u) => u.champion === t.key).length,
      bestBallPoints: round2(bb),
      actualPoints: round2(act),
    };
  });

  // Does the real universe reproduce what Yahoo says happened?
  const checks: string[] = [...f.warnings];
  const realChampion = season.league.isFinished
    ? season.teams.find((t) => t.yahooRank === 1)?.key ?? null
    : null;
  const real = universes.find((u) => u.id === "h2h-actual")!;
  const name = (k: string | null) => season.teams.find((t) => t.key === k)?.name ?? "nobody";
  if (realChampion && real.complete && real.champion !== realChampion) {
    checks.push(`The replay crowns ${name(real.champion)}, but Yahoo's champion is ${name(realChampion)}.`);
  }
  const seedMismatch = (real.table ?? []).filter((r) => {
    const y = season.teams.find((t) => t.key === r.team)?.yahooSeed;
    return r.seed !== null && y != null && y !== r.seed && regularDone;
  });
  if (seedMismatch.length) {
    checks.push(
      `Playoff seeds differ from Yahoo for ${seedMismatch.map((r) => name(r.team)).join(", ")}.`,
    );
  }
  for (const t of season.teams) {
    const m = f.weeks
      .map((w) => f.tw[t.key][w.week])
      .find((x) => x?.mismatch);
    if (m) checks.push(`${name(t.key)}, week ${m.week}: ${m.mismatch}`);
  }

  return { frame: f, universes, stats, realChampion, checks };
}
