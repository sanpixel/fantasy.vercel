// Every team, every week: what they scored, what they could have scored, and
// what they left on the bench.
import {
  blunders,
  floorLineup,
  optimalLineup,
  round2,
  startedLineup,
  startingSlots,
  type Blunder,
  type Lineup,
} from "./lineup.ts";
import type { EngineOptions, Matchup, Season } from "./types.ts";

export interface TeamWeek {
  team: string;
  week: number;
  /** Yahoo's score, or the starters' sum when the team had no matchup. */
  actual: number | null;
  startersSum: number | null;
  /** The best lineup the roster allowed. Never below actual. */
  bestBall: number | null;
  floor: number | null;
  projected: number | null;
  bench: number | null;
  /** actual as a share of best ball, 0 to 1 */
  iq: number | null;
  best: Lineup | null;
  worst: Lineup | null;
  started: Lineup | null;
  blunders: Blunder[];
  hasRoster: boolean;
  /** Yahoo's score and the starters' sum disagree, or Yahoo beat our best. */
  mismatch: string | null;
}

export interface WeekInfo {
  week: number;
  /** All matchups final and the week is behind the league's current week. */
  complete: boolean;
  playoffs: boolean;
  matchups: Matchup[];
}

export interface SeasonFrame {
  season: Season;
  slots: string[];
  weeks: WeekInfo[];
  /** team key -> week -> TeamWeek */
  tw: Record<string, Record<number, TeamWeek>>;
  regularWeeks: number[];
  playoffWeeks: number[];
  /** Data problems worth showing, in plain words. */
  warnings: string[];
}

export function lastRegularWeek(season: Season): number {
  const l = season.league;
  return l.usesPlayoff && l.playoffStartWeek ? l.playoffStartWeek - 1 : l.endWeek;
}

export function frame(season: Season, opts: EngineOptions): SeasonFrame {
  const l = season.league;
  const slots = startingSlots(l.rosterPositions);
  const warnings: string[] = [];
  if (!slots.length) warnings.push("The league's lineup settings are missing, so no best lineup can be built.");

  const byWeek = new Map<number, Matchup[]>();
  for (const m of season.matchups) {
    if (!byWeek.has(m.week)) byWeek.set(m.week, []);
    byWeek.get(m.week)!.push(m);
  }

  const lastWeek = l.isFinished ? l.endWeek : Math.min(l.currentWeek, l.endWeek);
  const weeks: WeekInfo[] = [];
  for (let w = l.startWeek; w <= lastWeek; w++) {
    const ms = byWeek.get(w) ?? [];
    const behind = l.isFinished || w < l.currentWeek;
    // A past week with no matchups (a playoff week for a league without a
    // consolation bracket, say) is still over once its rosters are in.
    const hasData = ms.length > 0 || Object.keys(season.rosters[w] ?? {}).length > 0;
    const complete = behind && hasData && ms.every((m) => m.status === "postevent");
    const playoffs = !!(l.usesPlayoff && l.playoffStartWeek && w >= l.playoffStartWeek);
    weeks.push({ week: w, complete, playoffs, matchups: ms });
  }

  const tw: SeasonFrame["tw"] = {};
  for (const t of season.teams) tw[t.key] = {};

  for (const wk of weeks) {
    const rosters = season.rosters[wk.week] ?? {};
    const yahoo = new Map<string, { points: number; projected: number | null }>();
    for (const m of wk.matchups) {
      m.teams.forEach((k, i) => yahoo.set(k, { points: m.points[i], projected: m.projected[i] }));
    }
    let missing = 0;
    for (const t of season.teams) {
      const roster = rosters[t.key];
      const y = yahoo.get(t.key);
      const started = roster ? startedLineup(roster) : null;
      const best = roster && slots.length ? optimalLineup(slots, roster, opts.includeReserve) : null;
      const worst = roster && slots.length ? floorLineup(slots, roster, opts.includeReserve) : null;
      const actual = y ? y.points : started ? started.points : null;
      if (!roster && (y || wk.complete)) missing++;

      let mismatch: string | null = null;
      let bestBall = best ? best.points : null;
      if (y && started && Math.abs(y.points - started.points) > 0.011) {
        mismatch = `Yahoo scored ${y.points}, the starters add up to ${started.points}.`;
      }
      if (bestBall !== null && actual !== null && actual > bestBall + 0.001) {
        mismatch = `Yahoo scored ${actual}, above the best lineup found (${bestBall}).`;
        bestBall = actual;
      }

      tw[t.key][wk.week] = {
        team: t.key,
        week: wk.week,
        actual,
        startersSum: started ? started.points : null,
        bestBall,
        floor: worst ? worst.points : null,
        projected: y ? y.projected : null,
        bench: bestBall !== null && actual !== null ? round2(bestBall - actual) : null,
        iq: bestBall && actual !== null ? actual / bestBall : null,
        best,
        worst,
        started,
        blunders: roster && best ? blunders(roster, best) : [],
        hasRoster: !!roster,
        mismatch,
      };
    }
    if (missing) warnings.push(`Week ${wk.week}: ${missing} roster${missing > 1 ? "s" : ""} not loaded yet.`);
  }

  const lastRegular = lastRegularWeek(season);
  return {
    season,
    slots,
    weeks,
    tw,
    regularWeeks: weeks.filter((w) => w.complete && w.week <= lastRegular).map((w) => w.week),
    playoffWeeks: weeks.filter((w) => w.playoffs).map((w) => w.week),
    warnings,
  };
}
