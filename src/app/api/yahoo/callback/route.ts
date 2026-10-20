// Yahoo sends the visitor back here with a code. Check the state, trade the
// code for tokens, remember the user, start a session, read their leagues.
import { NextRequest, NextResponse } from "next/server";
import { parseUserLeagues } from "@/engine/yahoo-parse";
import { appUrl } from "@/lib/env";
import { startSession } from "@/lib/session";
import { upsertUser } from "@/lib/store";
import { syncLeagueList } from "@/lib/sync";
import { API, exchangeCode, storeTokens } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const back = (why: string) => NextResponse.redirect(`${appUrl()}/?error=${encodeURIComponent(why)}`);

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  if (q.get("error")) return back("Yahoo sign-in was cancelled.");
  const state = req.cookies.get("fx_oauth_state")?.value;
  if (!state || state !== q.get("state")) return back("That sign-in link expired. Try again.");
  const code = q.get("code");
  if (!code) return back("Yahoo did not send a sign-in code.");

  try {
    const t = await exchangeCode(code);
    let guid = t.xoauth_yahoo_guid ?? null;
    if (!guid) {
      const res = await fetch(`${API}/users;use_login=1/games;game_codes=nfl/leagues`, {
        headers: { Authorization: `Bearer ${t.access_token}` },
        cache: "no-store",
      });
      guid = parseUserLeagues(await res.text()).guid;
    }
    await upsertUser(guid, null, null);
    await storeTokens(guid, t);
    await startSession(guid);
    try {
      await syncLeagueList(guid);
    } catch (e) {
      console.error("league list after sign-in failed", (e as Error).message);
    }
  } catch (e) {
    console.error("yahoo callback failed", (e as Error).message);
    return back("Yahoo sign-in failed. Try again.");
  }
  const res = NextResponse.redirect(`${appUrl()}/leagues`);
  res.cookies.delete({ name: "fx_oauth_state", path: "/api/yahoo" });
  return res;
}
