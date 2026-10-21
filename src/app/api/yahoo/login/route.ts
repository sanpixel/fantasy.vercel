// Start Yahoo sign-in. The state is random, kept in a short-lived cookie, and
// compared on the way back.
import { NextResponse } from "next/server";
import { randomId } from "@/lib/crypto";
import { appUrl, signInReady } from "@/lib/env";
import { authorizeUrl } from "@/lib/yahoo";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await signInReady())) return NextResponse.redirect(`${appUrl()}/status`);
  const state = randomId(16);
  const res = NextResponse.redirect(await authorizeUrl(state));
  res.cookies.set("fx_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/yahoo",
    maxAge: 600,
  });
  return res;
}
