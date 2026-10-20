// Database self-test. Inert unless SELFTEST_TOKEN is set, and then only for
// a caller who sends it. Leaves nothing behind.
import { NextRequest } from "next/server";
import { json } from "@/lib/http";
import { selfTest } from "@/lib/selftest";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const token = process.env.SELFTEST_TOKEN;
  if (!token || req.headers.get("authorization") !== `Bearer ${token}`) return json({ error: "not found" }, 404);
  return json(await selfTest());
}
