// node --test --experimental-strip-types test/*.test.ts
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { careers } from "../src/engine/alltime.ts";
import { blunders, canFill, floorLineup, optimalLineup, startedLineup, startingSlots } from "../src/engine/lineup.ts";
import { SAMPLE_SEASONS, sampleKey, sampleSeason } from "../src/engine/sample.ts";
import type { Spot } from "../src/engine/types.ts";
import { board, bracketOrder, kingOfTheHill } from "../src/engine/universes.ts";
import { frame } from "../src/engine/season.ts";
import { DEFAULT_OPTIONS } from "../src/engine/types.ts";
import {
  parseLeagueSettings,
  parseRoster,
  parseScoreboard,
  parseUserLeagues,
  renewToKey,
  YahooShapeError,
} from "../src/engine/yahoo-parse.ts";

const fx = (f: string) => readFileSync(join(import.meta.dirname, "fixtures", f), "utf8");

function spot(key: string, pos: string, points: number, slot = "BN", eligible?: string[]): Spot {
  const flex = ["RB", "WR", "TE"].includes(pos) ? [pos, "W/R/T"] : [pos];
  return { playerKey: key, name: key, nflTeam: "", position: pos, eligible: eligible ?? flex, slot, points };
}

// ---------------------------------------------------------------- lineups

test("slots come from the league settings, not from who started", () => {
  const slots = startingSlots([
    { position: "QB", count: 1 },
    { position: "WR", count: 2 },
    { position: "BN", count: 6 },
    { position: "IR", count: 1 },
  ]);
  assert.deepEqual(slots, ["QB", "WR", "WR"]);
});

test("a player spent on the wrong flex slot: fill-in-order gets 25, the best is 35", () => {
  const slots = ["W/R", "W/T"];
  const roster = [
    spot("wr", "WR", 20, "BN", ["WR", "W/R", "W/T"]),
    spot("rb", "RB", 15, "BN", ["RB", "W/R"]),
    spot("te", "TE", 5, "BN", ["TE", "W/T"]),
  ];
  const best = optimalLineup(slots, roster);
  assert.equal(best.points, 35);
  assert.deepEqual(
    best.placed.map((p) => `${p.slot}:${p.spot.playerKey}`).sort(),
    ["W/R:rb", "W/T:wr"],
  );
});

test("superflex takes a second quarterback when he outscores everyone", () => {
  const slots = ["QB", "Q/W/R/T", "WR"];
  const roster = [
    spot("qb1", "QB", 25, "QB", ["QB", "Q/W/R/T"]),
    spot("qb2", "QB", 22, "BN", ["QB", "Q/W/R/T"]),
    spot("wr1", "WR", 14, "WR", ["WR", "W/R/T", "Q/W/R/T"]),
    spot("wr2", "WR", 9, "Q/W/R/T", ["WR", "W/R/T", "Q/W/R/T"]),
  ];
  assert.equal(optimalLineup(slots, roster).points, 61);
});

test("a combined slot accepts a player even if Yahoo left it off his list", () => {
  assert.equal(canFill("W/R/T", { eligible: ["TE"], position: "TE" }), true);
  assert.equal(canFill("W/R/T", { eligible: ["QB"], position: "QB" }), false);
});

test("a negative kicker is left out: an empty slot scores 0", () => {
  const roster = [spot("k", "K", -2, "K"), spot("qb", "QB", 10, "QB")];
  const best = optimalLineup(["QB", "K"], roster);
  assert.equal(best.points, 10);
  assert.equal(floorLineup(["QB", "K"], roster).points, 8);
});

test("a player in the IR slot is out of the pool unless the league says otherwise", () => {
  const roster = [spot("rb1", "RB", 5, "RB"), spot("rb2", "RB", 30, "IR")];
  assert.equal(optimalLineup(["RB"], roster).points, 5);
  assert.equal(optimalLineup(["RB"], roster, true).points, 30);
});

test("an empty starting slot lowers the real score, not the best one", () => {
  const roster = [spot("qb", "QB", 20, "QB"), spot("wr", "WR", 12, "BN")];
  assert.equal(startedLineup(roster).points, 20);
  assert.equal(optimalLineup(["QB", "WR"], roster).points, 32);
  const b = blunders(roster, optimalLineup(["QB", "WR"], roster));
  assert.equal(b.length, 1);
  assert.equal(b[0].started, null);
  assert.equal(b[0].gap, 12);
});

test("ties between players resolve the same way every time", () => {
  const roster = [spot("b", "WR", 10), spot("a", "WR", 10), spot("c", "WR", 10)];
  const one = optimalLineup(["WR"], roster);
  const two = optimalLineup(["WR"], [...roster].reverse());
  assert.equal(one.placed[0].spot.playerKey, "a");
  assert.equal(two.placed[0].spot.playerKey, "a");
});

// ---------------------------------------------------------------- Yahoo XML

test("league settings parse", () => {
  const l = parseLeagueSettings(fx("settings.xml"));
  assert.equal(l.key, "461.l.1234");
  assert.equal(l.gameKey, "461");
  assert.equal(l.playoffStartWeek, 15);
  assert.equal(l.reseed, true);
  assert.equal(l.renew, "449_999");
  assert.equal(l.renewed, null);
  assert.deepEqual(startingSlots(l.rosterPositions), ["QB", "WR", "WR", "W/R/T"]);
  assert.deepEqual(l.divisions, { "1": "Tequila" });
  assert.equal(renewToKey(l.renew), "449.l.999");
});

test("scoreboard parses with points, projections and the winner", () => {
  const [m] = parseScoreboard(fx("scoreboard.xml"));
  assert.deepEqual(m.points, [101.2, 120.04]);
  assert.deepEqual(m.projected, [110, 99.5]);
  assert.equal(m.winner, "461.l.1234.t.2");
  assert.equal(m.status, "postevent");
});

test("roster parses, and a lineup from the wrong week is refused", () => {
  const r = parseRoster(fx("roster-week3.xml"), 3);
  assert.equal(r.spots.length, 2);
  assert.deepEqual(r.spots[1].eligible, ["RB", "W/R/T"]);
  assert.equal(r.spots[1].slot, "BN");
  assert.equal(r.spots[1].points, 17.25);
  assert.throws(() => parseRoster(fx("roster-week3.xml"), 4), YahooShapeError);
});

test("the user's leagues parse across seasons", () => {
  const u = parseUserLeagues(fx("user-leagues.xml"));
  assert.equal(u.guid, "ABCDEF123");
  assert.deepEqual(u.leagues.map((l) => [l.key, l.season]), [["449.l.999", 2024], ["461.l.1234", 2025]]);
});

// The old repo kept real responses from the 2025 league. They are private, so
// they are read from a local clone of sanpixel/fantasy.ai when one is present.
const OLD = process.env.OLD_FIXTURES ?? "/home/user/fantasy.ai/.kiro/debug";
test("captured 2025 responses", { skip: !existsSync(join(OLD, "roster")) && "no local fantasy.ai clone" }, () => {
  const xml = readFileSync(join(OLD, "roster"), "utf8");
  // This capture asked for week 1 stats without roster;week=1, so Yahoo sent
  // the week 5 lineup. That is the old bug, and it must be refused.
  assert.throws(() => parseRoster(xml, 1), /week 5 lineup/);
  const r = parseRoster(xml);
  assert.equal(r.spots.length, 14);
  const l = startingSlots([
    { position: "QB", count: 1 }, { position: "WR", count: 2 }, { position: "RB", count: 1 },
    { position: "TE", count: 1 }, { position: "W/R/T", count: 2 }, { position: "DEF", count: 1 },
    { position: "BN", count: 6 },
  ]);
  const best = optimalLineup(l, r.spots);
  // The defense scored 0, so its slot is better left empty: 7 of 8 filled.
  assert.equal(best.placed.length, 7);
  assert.equal(best.points, 70.88);
  assert.equal(startedLineup(r.spots).points, 45.72);
  const sb = parseScoreboard(readFileSync(join(OLD, "scoreboard"), "utf8"));
  assert.equal(sb.length, 8);
  assert.ok(sb.every((m) => m.status === "postevent" && m.week === 1));
});

// ---------------------------------------------------------------- universes

test("bracket order puts 1 against the lowest seed", () => {
  assert.deepEqual(bracketOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
});

for (const season of SAMPLE_SEASONS) {
  test(`sample ${season}: best ball never below real, bench never negative`, () => {
    const b = board(sampleSeason(sampleKey(season))!);
    for (const team of Object.values(b.frame.tw)) {
      for (const x of Object.values(team)) {
        if (x.actual === null || x.bestBall === null) continue;
        assert.ok(x.bestBall >= x.actual, `${x.team} week ${x.week}`);
        assert.ok(x.bench! >= 0);
        assert.equal(x.mismatch, null, `${x.team} week ${x.week}: ${x.mismatch}`);
      }
    }
  });
}

test("finished sample seasons: the real universe reproduces Yahoo's seeds and champion", () => {
  for (const season of [2024, 2025]) {
    const b = board(sampleSeason(sampleKey(season))!);
    const real = b.universes.find((u) => u.id === "h2h-actual")!;
    assert.ok(b.realChampion);
    assert.equal(real.champion, b.realChampion);
    assert.deepEqual(b.checks, []);
    // King of the Hill can end with several still standing, and then has no king.
    const crowned = b.universes.filter((u) => u.format !== "koth");
    assert.ok(crowned.every((u) => u.champion), crowned.filter((u) => !u.champion).map((u) => u.id).join());
  }
});

test("the season in progress counts finished weeks only", () => {
  const b = board(sampleSeason(sampleKey(2026))!);
  assert.deepEqual(b.frame.regularWeeks, [1, 2, 3, 4, 5, 6]);
  assert.equal(b.universes.find((u) => u.id === "h2h-actual")!.champion, null);
});

test("king of the hill: ties at the strike line go to fewer season points, then both", () => {
  const s = sampleSeason(sampleKey(2025))!;
  const f = frame(s, DEFAULT_OPTIONS);
  // Force a three-way tie at the bottom of week 1.
  const [a, b, c] = s.teams.map((t) => t.key);
  for (const k of [a, b, c]) f.tw[k][1].actual = 50;
  const k = kingOfTheHill(f, "actual", { 1: 2 });
  const struck = k.rows.filter((r) => r.struck[1]).map((r) => r.team);
  assert.equal(struck.length >= 2, true);
  assert.ok(struck.every((t) => [a, b, c].includes(t)));
});

test("careers follow managers across seasons", () => {
  const boards = SAMPLE_SEASONS.map((y) => board(sampleSeason(sampleKey(y))!));
  const c = careers(boards);
  assert.equal(c.length, 12);
  assert.ok(c.every((x) => x.seasons.length === 3));
  assert.equal(c.reduce((t, x) => t + x.realTitles.length, 0), 2);
});
