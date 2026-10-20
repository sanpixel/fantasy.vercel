// Lineups: which slots a league starts, who may fill them, and the best and
// worst lineups a roster could have set.
//
// The old app filled fixed slots first and FLEX last. That is right for a
// plain QB/RB/WR/TE/FLEX league and wrong as soon as a player fits more than
// one slot that matters (superflex, two flex types, IDP), because he can be
// spent on the wrong one. Here the lineup is a transversal matroid: a set of
// players is legal when every one of them can be given a distinct slot. On a
// matroid, taking players best-first and keeping each one that still fits is
// provably optimal, and "still fits" is one augmenting-path search.
import type { RosterPosition, Spot } from "./types.ts";

/** Slots that are not part of the starting lineup. */
export const NOT_STARTING = new Set(["BN", "IR", "IR+", "NA"]);
/** Slots Yahoo would not let a manager start from without a roster move. */
export const RESERVE = new Set(["IR", "IR+", "NA"]);

const LETTERS: Record<string, string> = { Q: "QB", W: "WR", R: "RB", T: "TE", K: "K" };

/** One entry per starting slot: QB, RB, WR, WR, TE, W/R/T, ... */
export function startingSlots(positions: RosterPosition[]): string[] {
  const out: string[] = [];
  for (const p of positions) {
    if (NOT_STARTING.has(p.position)) continue;
    for (let i = 0; i < p.count; i++) out.push(p.position);
  }
  return out;
}

/** Whether a player may fill a slot. */
export function canFill(slot: string, spot: Pick<Spot, "eligible" | "position">): boolean {
  if (spot.eligible.includes(slot)) return true;
  if (spot.eligible.length === 0 && spot.position === slot) return true;
  if (!slot.includes("/")) return false;
  // A combined slot such as W/R/T or Q/W/R/T, in case Yahoo left it off the
  // player's eligible list.
  const own = spot.eligible.length ? spot.eligible : [spot.position];
  return slot.split("/").some((l) => own.includes(LETTERS[l] ?? l));
}

export interface Placed {
  slot: string;
  spot: Spot;
}

export interface Lineup {
  placed: Placed[];
  points: number;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Slot indices a player can fill, his own position's slots first. */
function adjacency(slots: string[], spot: Spot): number[] {
  const exact: number[] = [];
  const other: number[] = [];
  slots.forEach((s, i) => {
    if (!canFill(s, spot)) return;
    if (s === spot.position || (!s.includes("/") && spot.eligible[0] === s)) exact.push(i);
    else other.push(i);
  });
  return [...exact, ...other];
}

/** Kuhn's augmenting path. Moves earlier players between slots, never drops one. */
function augment(
  p: number,
  adj: number[][],
  slotOf: number[],
  seen: Uint8Array,
): boolean {
  for (const s of adj[p]) {
    if (seen[s]) continue;
    seen[s] = 1;
    if (slotOf[s] === -1 || augment(slotOf[s], adj, slotOf, seen)) {
      slotOf[s] = p;
      return true;
    }
  }
  return false;
}

/**
 * The matroid greedy.
 * best: highest points first, stop at zero, because an empty slot scores 0.
 * worst: lowest points first, fill every slot that can be filled.
 */
function greedy(slots: string[], pool: Spot[], mode: "best" | "worst"): Lineup {
  const sorted = [...pool].sort((a, b) =>
    mode === "best"
      ? b.points - a.points || a.playerKey.localeCompare(b.playerKey)
      : a.points - b.points || a.playerKey.localeCompare(b.playerKey),
  );
  const adj = sorted.map((s) => adjacency(slots, s));
  const slotOf = new Array<number>(slots.length).fill(-1);
  const kept: number[] = [];
  for (let p = 0; p < sorted.length && kept.length < slots.length; p++) {
    if (mode === "best" && sorted[p].points <= 0) break;
    if (adj[p].length === 0) continue;
    if (augment(p, adj, slotOf, new Uint8Array(slots.length))) kept.push(p);
  }
  return place(slots, kept.map((p) => sorted[p]));
}

/**
 * Seat a legal set of players, the least flexible first and each in his own
 * position's slot where possible, so the display reads naturally.
 */
function place(slots: string[], chosen: Spot[]): Lineup {
  const order = [...chosen].sort(
    (a, b) =>
      adjacency(slots, a).length - adjacency(slots, b).length ||
      b.points - a.points ||
      a.playerKey.localeCompare(b.playerKey),
  );
  const adj = order.map((s) => adjacency(slots, s));
  const slotOf = new Array<number>(slots.length).fill(-1);
  order.forEach((_, p) => augment(p, adj, slotOf, new Uint8Array(slots.length)));
  const placed: Placed[] = [];
  slotOf.forEach((p, s) => {
    if (p !== -1) placed.push({ slot: slots[s], spot: order[p] });
  });
  placed.sort((a, b) => slots.indexOf(a.slot) - slots.indexOf(b.slot));
  return { placed, points: round2(chosen.reduce((t, s) => t + s.points, 0)) };
}

/** Players who could have been started that week. */
export function pool(roster: Spot[], includeReserve: boolean): Spot[] {
  return includeReserve ? roster : roster.filter((s) => !RESERVE.has(s.slot));
}

export function optimalLineup(slots: string[], roster: Spot[], includeReserve = false): Lineup {
  return greedy(slots, pool(roster, includeReserve), "best");
}

export function floorLineup(slots: string[], roster: Spot[], includeReserve = false): Lineup {
  return greedy(slots, pool(roster, includeReserve), "worst");
}

/** The lineup the manager actually set. */
export function startedLineup(roster: Spot[]): Lineup {
  const placed = roster
    .filter((s) => !NOT_STARTING.has(s.slot))
    .map((spot) => ({ slot: spot.slot, spot }));
  return { placed, points: round2(placed.reduce((t, p) => t + p.spot.points, 0)) };
}

export interface Blunder {
  /** Sat on the bench and belonged in the best lineup. */
  benched: Spot;
  /** Started in his place, or null for a slot left empty. */
  started: Spot | null;
  gap: number;
}

/**
 * Pair each player the best lineup started from the bench with the starter he
 * should have replaced: the lowest-scoring starter not in the best lineup whose
 * slot he could have filled.
 */
export function blunders(roster: Spot[], best: Lineup): Blunder[] {
  const inBest = new Set(best.placed.map((p) => p.spot.playerKey));
  const started = roster.filter((s) => !NOT_STARTING.has(s.slot));
  const startedKeys = new Set(started.map((s) => s.playerKey));
  const comingIn = best.placed
    .map((p) => p.spot)
    .filter((s) => !startedKeys.has(s.playerKey))
    .sort((a, b) => b.points - a.points);
  const goingOut = started.filter((s) => !inBest.has(s.playerKey)).sort((a, b) => a.points - b.points);

  const out: Blunder[] = [];
  for (const b of comingIn) {
    let i = goingOut.findIndex((s) => canFill(s.slot, b));
    if (i === -1 && goingOut.length) i = 0;
    const s = i === -1 ? null : goingOut.splice(i, 1)[0];
    out.push({ benched: b, started: s, gap: round2(b.points - (s?.points ?? 0)) });
  }
  return out.filter((b) => b.gap > 0).sort((a, b) => b.gap - a.gap);
}
