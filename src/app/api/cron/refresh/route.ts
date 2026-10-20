// Daily: refresh the live week and the stat-correction week of every
// current-season league, as its most recently active member.
import { NextRequest } from "next/server";
import { json } from "@/lib/http";
import { activeMember, currentSeasonLeagues } from "@/lib/store";
import { syncLeague } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "no" }, 401);
  const started = Date.now();
  const out: Record<string, string> = {};
  for (const key of await currentSeasonLeagues()) {
    if (Date.now() - started > 240_000) {
      out[key] = "skipped: out of time";
      continue;
    }
    const guid = await activeMember(key);
    if (!guid) {
      out[key] = "skipped: no member with Yahoo connected";
      continue;
    }
    try {
      const r = await syncLeague(key, guid, 40_000);
      out[key] = `fetched ${r.fetched}${r.errors.length ? `, ${r.errors.length} errors` : ""}`;
    } catch (e) {
      out[key] = `failed: ${(e as Error).message}`;
    }
  }
  return json({ ok: true, leagues: out });
}
