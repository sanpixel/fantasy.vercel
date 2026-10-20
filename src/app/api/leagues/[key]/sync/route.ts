// Fetch what this league is missing, within a time budget. The page calls
// again while done is false.
import { NextRequest } from "next/server";
import { json, sameOrigin } from "@/lib/http";
import { currentViewer } from "@/lib/session";
import { isMember } from "@/lib/store";
import { syncLeague } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  if (!sameOrigin(req)) return json({ error: "bad origin" }, 403);
  const { key } = await params;
  const v = await currentViewer();
  if (!v) return json({ error: "sign in first" }, 401);
  if (!(await isMember(v.guid, key))) return json({ error: "not your league" }, 403);
  try {
    return json(await syncLeague(key, v.guid, 45_000));
  } catch (e) {
    console.error("sync failed", key, (e as Error).message);
    return json({ error: "Yahoo did not answer. Try again in a minute." }, 502);
  }
}
