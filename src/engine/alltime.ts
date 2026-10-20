// Every season of a league, combined by manager. Team keys change every
// season; the Yahoo manager guid does not.
import { round2 } from "./lineup.ts";
import type { Board } from "./universes.ts";

export interface Career {
  manager: string;
  name: string;
  seasons: number[];
  realTitles: number[];
  bestBallTitles: number[];
  universesWon: number;
  actual: number;
  bestBall: number;
  bench: number;
  iq: number | null;
  luck: number;
  /** season -> team name that year */
  teams: Record<number, string>;
}

export function careers(boards: Board[]): Career[] {
  const out = new Map<string, Career>();
  for (const b of boards) {
    const season = b.frame.season.league.season;
    const bestBall = b.universes.find((u) => u.id === "h2h-bestBall");
    const real = b.realChampion ?? b.universes.find((u) => u.id === "h2h-actual")?.champion ?? null;
    for (const t of b.frame.season.teams) {
      const id = t.managerGuid && t.managerGuid !== "--" ? t.managerGuid : `name:${(t.managerName ?? t.name).toLowerCase()}`;
      if (!out.has(id)) {
        out.set(id, {
          manager: id,
          name: t.managerName ?? t.name,
          seasons: [],
          realTitles: [],
          bestBallTitles: [],
          universesWon: 0,
          actual: 0,
          bestBall: 0,
          bench: 0,
          iq: null,
          luck: 0,
          teams: {},
        });
      }
      const c = out.get(id)!;
      const s = b.stats.find((x) => x.team === t.key);
      c.seasons.push(season);
      c.teams[season] = t.name;
      if (t.managerName) c.name = t.managerName;
      if (real === t.key) c.realTitles.push(season);
      if (bestBall?.champion === t.key) c.bestBallTitles.push(season);
      if (s) {
        c.universesWon += s.universesWon;
        c.actual += s.actualPoints;
        c.bestBall += s.bestBallPoints;
        c.bench += s.bench;
        c.luck += s.luck;
      }
    }
  }
  return [...out.values()]
    .map((c) => ({
      ...c,
      seasons: c.seasons.sort(),
      actual: round2(c.actual),
      bestBall: round2(c.bestBall),
      bench: round2(c.bench),
      luck: round2(c.luck),
      iq: c.bestBall ? c.actual / c.bestBall : null,
    }))
    .sort(
      (a, b) =>
        b.realTitles.length - a.realTitles.length ||
        b.universesWon - a.universesWon ||
        b.bestBall - a.bestBall,
    );
}
