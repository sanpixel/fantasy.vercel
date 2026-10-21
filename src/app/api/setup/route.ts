// The setup page posts the Yahoo app's client ID and secret here, with the
// code from the setup link. The code is checked against a stored hash, the
// pair is checked with Yahoo, then sealed and saved. Nothing is echoed back.
import { NextRequest } from "next/server";
import { tokenKeyOk } from "@/lib/crypto";
import { dbReady } from "@/lib/env";
import { json, sameOrigin } from "@/lib/http";
import { checkYahooApp } from "@/lib/yahoo";
import { saveYahooApp, setupCodeOk } from "@/lib/yahoo-app";

export const dynamic = "force-dynamic";

const tries = new Map<string, number[]>();
function tooMany(ip: string) {
  const now = Date.now();
  const t = (tries.get(ip) ?? []).filter((x) => now - x < 10 * 60_000);
  tries.set(ip, t);
  return t.length >= 5;
}

const clean = (v: unknown) => String(v ?? "").trim();
const plausible = (v: string) => v.length >= 8 && v.length <= 400 && !/\s/.test(v);

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return json({ error: "bad origin" }, 403);
  if (!process.env.SETUP_CODE_HASH) return json({ error: "Setup is not switched on for this site." }, 503);
  if (!dbReady() || !tokenKeyOk()) return json({ error: "The site's storage is not ready." }, 503);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (tooMany(ip)) return json({ error: "Too many wrong tries. Wait ten minutes." }, 429);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (!setupCodeOk(clean(body.code))) {
    tries.get(ip)!.push(Date.now());
    return json({ error: "That setup link is not valid." }, 403);
  }
  const id = clean(body.clientId);
  const secret = clean(body.clientSecret);
  if (!plausible(id) || !plausible(secret)) {
    return json({ error: "Paste the Client ID and Client Secret exactly as Yahoo shows them." }, 400);
  }

  const check = await checkYahooApp(id, secret);
  if (check === "bad") {
    return json({ error: "Yahoo did not recognise that ID and secret. Nothing was saved." }, 400);
  }
  await saveYahooApp(id, secret);
  return json({ ok: true, check, hint: `…${id.slice(-4)}` });
}
