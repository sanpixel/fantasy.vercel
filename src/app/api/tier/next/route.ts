// Tier game: a random QB, RB, WR or TE, without the answer.
import { db } from "@/lib/db";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

const TIERS: Record<string, number> = { QB: 3, RB: 4, WR: 6, TE: 3 };

export async function GET() {
  const s = db();
  if (!s) return json({ error: "The tier game needs the database." }, 503);
  const [p] = await s`
    select id, name, position, price from fantasy.tier_players
    where position in ('QB', 'RB', 'WR', 'TE') order by random() limit 1`;
  if (!p) return json({ error: "No players loaded." }, 404);
  return json({ id: p.id, name: p.name, position: p.position, price: p.price, tiers: TIERS[p.position] ?? 3 });
}
