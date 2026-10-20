// Writes a sample season through the same store functions a Yahoo sync uses,
// reads it back, checks the computed board matches, then deletes it. Proves
// the database path before real Yahoo data ever arrives.
import { sampleSeason } from "@/engine/sample";
import { board } from "@/engine/universes";
import { seal, open } from "./crypto";
import { sql } from "./db";
import * as store from "./store";

const KEY = "selftest.l.1";

export async function selfTest() {
  const out: Record<string, unknown> = {};
  const s = sampleSeason("sample-2025")!;
  const rekey = (k: string) => k.replace("sample-2025", KEY);
  try {
    out.crypto = open(seal("round trip")) === "round trip";
    await store.saveLeague({ ...s.league, key: KEY, gameKey: "selftest", renew: null, renewed: null });
    await store.saveTeams(KEY, s.teams.map((t) => ({ ...t, key: rekey(t.key) })));
    const weeks = [...new Set([...s.matchups.map((m) => m.week), ...Object.keys(s.rosters).map(Number)])];
    for (const w of weeks) {
      const ms = s.matchups
        .filter((m) => m.week === w)
        .map((m) => ({ ...m, teams: m.teams.map(rekey) as [string, string], winner: m.winner ? rekey(m.winner) : null }));
      await store.saveScoreboard(KEY, w, ms, true);
      await Promise.all(
        Object.entries(s.rosters[w] ?? {}).map(([team, spots]) =>
          store.saveRoster(KEY, w, rekey(team), spots.map((p) => ({ ...p, playerKey: rekey(p.playerKey) })), true),
        ),
      );
    }
    await store.savePrefs(KEY, { divisionNames: { "1": "Tequila" }, includeReserve: false });
    const back = await store.loadSeason(KEY);
    if (!back) throw new Error("nothing read back");
    const prefs = await store.loadPrefs(KEY);
    const a = board(s);
    const b = board(back, prefs.options);
    const champs = (x: typeof a) => x.universes.map((u) => `${u.id}=${u.champion?.replace(/^.*\.t\./, "t")}`).join(" ");
    const st = await store.syncState(KEY);
    Object.assign(out, {
      teams: back.teams.length,
      matchups: back.matchups.length,
      rosterWeeks: Object.keys(back.rosters).length,
      sameChampions: champs(a) === champs(b),
      sameBench: JSON.stringify(a.stats.map((x) => x.bench)) === JSON.stringify(b.stats.map((x) => x.bench)),
      checks: b.checks,
      prefs: prefs.divisionNames["1"] === "Tequila",
      syncWeeks: st.weeks.size,
      syncRosters: st.rosters.size,
    });
  } catch (e) {
    out.error = (e as Error).message;
  } finally {
    await sql()`delete from fantasy.leagues where league_key = ${KEY}`;
    const [left] = await sql()`select count(*)::int as n from fantasy.roster_spots where league_key = ${KEY}`;
    out.cleanedUp = left.n === 0;
  }
  return out;
}
