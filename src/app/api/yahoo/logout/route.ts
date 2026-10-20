// Sign out. ?disconnect=1 also forgets the Yahoo tokens.
import { NextRequest, NextResponse } from "next/server";
import { appUrl } from "@/lib/env";
import { sameOrigin } from "@/lib/http";
import { endSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  await endSession(req.nextUrl.searchParams.get("disconnect") === "1");
  return NextResponse.redirect(`${appUrl()}/`, 303);
}
