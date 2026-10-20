// League display settings: division names, King of the Hill schedule, and
// whether players in IR count for best ball. Members only.
import { NextRequest } from "next/server";
import { DEFAULT_KOTH } from "@/engine/types";
import { json, sameOrigin } from "@/lib/http";
import { currentViewer } from "@/lib/session";
import { isMember, savePrefs } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  if (!sameOrigin(req)) return json({ error: "bad origin" }, 403);
  const { key } = await params;
  const v = await currentViewer();
  if (!v) return json({ error: "sign in first" }, 401);
  if (!(await isMember(v.guid, key))) return json({ error: "not your league" }, 403);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const out: Parameters<typeof savePrefs>[1] = {};
  if (body.divisionNames && typeof body.divisionNames === "object") {
    out.divisionNames = Object.fromEntries(
      Object.entries(body.divisionNames as Record<string, unknown>)
        .filter(([k]) => /^\d{1,3}$/.test(k))
        .map(([k, v]) => [k, String(v ?? "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 40)])
        .filter(([, v]) => v),
    );
  }
  if (body.kothSchedule === "default") out.kothSchedule = DEFAULT_KOTH;
  else if (body.kothSchedule && typeof body.kothSchedule === "object") {
    out.kothSchedule = Object.fromEntries(
      Object.entries(body.kothSchedule as Record<string, unknown>)
        .map(([k, v]) => [Number(k), Math.floor(Number(v))] as [number, number])
        .filter(([k, v]) => k >= 1 && k <= 18 && v >= 0 && v <= 30),
    );
  }
  if (typeof body.includeReserve === "boolean") out.includeReserve = body.includeReserve;
  await savePrefs(key, out);
  return json({ ok: true });
}
