// What a league page loads: the season, the viewer's right to see it, the
// computed board, and the other seasons of the same league.
import { cache } from "react";
import { careers } from "@/engine/alltime";
import { isSample, SAMPLE_SEASONS, sampleKey, sampleSeason } from "@/engine/sample";
import { DEFAULT_OPTIONS, type Season } from "@/engine/types";
import { board, type Board } from "@/engine/universes";
import { renewToKey } from "@/engine/yahoo-parse";
import { dbReady } from "./env";
import { currentViewer, type Viewer } from "./session";
import * as store from "./store";

export type LeagueLoad =
  | { kind: "ok"; season: Season; board: Board; viewer: Viewer | null; sample: boolean; divisionNames: Record<string, string>; chain: ChainLink[]; myTeam: string | null }
  | { kind: "signin" }
  | { kind: "forbidden" }
  | { kind: "syncing"; viewer: Viewer }
  | { kind: "missing" };

export interface ChainLink {
  key: string;
  season: number;
}

const prevKey = (renew: string | null) => (renew?.startsWith("sample-") ? renew : renewToKey(renew));

export const loadLeague = cache(async (key: string): Promise<LeagueLoad> => {
  if (isSample(key)) {
    const season = sampleSeason(key);
    if (!season) return { kind: "missing" };
    return {
      kind: "ok",
      season,
      board: board(season, DEFAULT_OPTIONS),
      viewer: null,
      sample: true,
      divisionNames: {},
      chain: SAMPLE_SEASONS.map((y) => ({ key: sampleKey(y), season: y })),
      myTeam: null,
    };
  }
  if (!dbReady()) return { kind: "signin" };
  const viewer = await currentViewer();
  if (!viewer) return { kind: "signin" };
  if (!(await store.isMember(viewer.guid, key))) return { kind: "forbidden" };
  const season = await store.loadSeason(key);
  if (!season) return { kind: "syncing", viewer };
  const prefs = await store.loadPrefs(key);
  const mine = await store.leaguesFor(viewer.guid);
  return {
    kind: "ok",
    season,
    board: board(season, prefs.options),
    viewer,
    sample: false,
    divisionNames: prefs.divisionNames,
    chain: chainOf(season.league.key, mine),
    myTeam: mine.find((m) => m.league_key === key)?.team_key ?? null,
  };
});

/** The seasons of this league the viewer can open, oldest first. */
function chainOf(key: string, mine: store.LeagueRow[]): ChainLink[] {
  const byKey = new Map(mine.map((m) => [m.league_key, m]));
  const out: ChainLink[] = [];
  const seen = new Set<string>();
  // Walk back.
  let k: string | null = key;
  while (k && byKey.has(k) && !seen.has(k)) {
    seen.add(k);
    out.unshift({ key: k, season: byKey.get(k)!.season });
    k = prevKey(byKey.get(k)!.renew);
  }
  // Walk forward.
  k = prevKey(byKey.get(key)?.renewed ?? null);
  while (k && byKey.has(k) && !seen.has(k)) {
    seen.add(k);
    out.push({ key: k, season: byKey.get(k)!.season });
    k = prevKey(byKey.get(k)!.renewed);
  }
  return out;
}

/** Every season's board, for the all-time page. */
export async function loadCareers(chain: ChainLink[]) {
  const boards: Board[] = [];
  for (const c of chain) {
    const l = await loadLeague(c.key);
    if (l.kind === "ok") boards.push(l.board);
  }
  return { boards, careers: careers(boards) };
}

export function teamName(season: Season, key: string | null | undefined): string {
  return season.teams.find((t) => t.key === key)?.name ?? "—";
}

export function divisionName(load: Extract<LeagueLoad, { kind: "ok" }>, id: string | null): string | null {
  if (!id) return null;
  return load.divisionNames[id] ?? load.season.league.divisions[id] ?? `Division ${id}`;
}
