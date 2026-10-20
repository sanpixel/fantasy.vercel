// Small helpers for route handlers.
import { NextRequest, NextResponse } from "next/server";
import { appUrl } from "./env";

export const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** State-changing requests must come from the app's own pages. */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("host");
  try {
    const o = new URL(origin);
    return o.host === host || o.origin === new URL(appUrl()).origin;
  } catch {
    return false;
  }
}
