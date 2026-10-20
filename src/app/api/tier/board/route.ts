// Tier game leaderboard: five guesses to qualify, then accuracy, then streak.
import { db } from "@/lib/db";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = db();
  if (!s) return json({ rows: [] });
  const rows = await s`
    select initials, correct, total, best_streak, round(100.0 * correct / total, 1)::float as accuracy
    from fantasy.tier_board where total >= 5
    order by correct::float / total desc, best_streak desc, correct desc
    limit 20`;
  return json({ rows });
}
