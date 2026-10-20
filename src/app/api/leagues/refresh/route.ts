// Re-read the visitor's leagues from Yahoo.
import { NextRequest } from "next/server";
import { json, sameOrigin } from "@/lib/http";
import { currentViewer } from "@/lib/session";
import { syncLeagueList } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: "bad origin" }, 403);
  const v = await currentViewer();
  if (!v) return json({ error: "sign in first" }, 401);
  try {
    return json({ leagues: await syncLeagueList(v.guid) });
  } catch (e) {
    console.error("league list refresh failed", (e as Error).message);
    return json({ error: "Yahoo did not answer. Try again." }, 502);
  }
}
