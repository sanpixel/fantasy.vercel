// Tier game: check a guess on the server and update the initials' line.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, sameOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: "bad origin" }, 403);
  const s = db();
  if (!s) return json({ error: "The tier game needs the database." }, 503);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const initials = String(body.initials ?? "").toUpperCase();
  const id = Math.floor(Number(body.id));
  const guess = Math.floor(Number(body.tier));
  if (!/^[A-Z]{3}$/.test(initials)) return json({ error: "Three letters, A to Z." }, 400);
  if (!Number.isFinite(id) || !Number.isFinite(guess)) return json({ error: "bad guess" }, 400);

  const [p] = await s`select tier, name from fantasy.tier_players where id = ${id}`;
  if (!p) return json({ error: "No such player." }, 404);
  const correct = p.tier === guess;
  const [row] = await s`
    insert into fantasy.tier_board (initials, correct, total, streak, best_streak, last_played)
    values (${initials}, ${correct ? 1 : 0}, 1, ${correct ? 1 : 0}, ${correct ? 1 : 0}, now())
    on conflict (initials) do update set
      correct = fantasy.tier_board.correct + ${correct ? 1 : 0},
      total = fantasy.tier_board.total + 1,
      streak = case when ${correct} then fantasy.tier_board.streak + 1 else 0 end,
      best_streak = greatest(fantasy.tier_board.best_streak,
        case when ${correct} then fantasy.tier_board.streak + 1 else 0 end),
      last_played = now()
    returning correct, total, streak, best_streak`;
  return json({ correct, tier: p.tier, stats: row });
}
