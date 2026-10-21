// Setup checklist as JSON. Names and yes/no only, never values.
import { db } from "@/lib/db";
import { checks, redirectUri } from "@/lib/env";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  let database = "not configured";
  const s = db();
  if (s) {
    try {
      await s`select 1 from fantasy.leagues limit 1`;
      database = "reachable";
    } catch {
      database = "unreachable";
    }
  }
  return json({ checks: await checks(), database, redirectUri: redirectUri() });
}
