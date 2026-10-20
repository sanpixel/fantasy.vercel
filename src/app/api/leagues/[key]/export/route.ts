// Every team-week as CSV, or the whole computed season as JSON.
import { NextRequest, NextResponse } from "next/server";
import { LENS_LABEL, score, type Lens } from "@/engine/universes";
import { loadLeague, teamName } from "@/lib/data";

export const dynamic = "force-dynamic";

const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const load = await loadLeague(key);
  if (load.kind === "signin") return NextResponse.json({ error: "sign in first" }, { status: 401 });
  if (load.kind !== "ok") return NextResponse.json({ error: "not available" }, { status: 403 });
  const { board, season } = load;
  const f = board.frame;
  const file = `${season.league.name}-${season.league.season}`.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  if (req.nextUrl.searchParams.get("format") === "json") {
    const { frame, ...rest } = board;
    return new NextResponse(JSON.stringify({ league: season.league, teams: season.teams, weeks: frame.tw, ...rest }), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${file}.json"`,
      },
    });
  }

  const lenses: Lens[] = ["actual", "bestBall", "floor", "projected"];
  const opp = new Map<string, string>();
  for (const m of season.matchups) {
    opp.set(`${m.week}|${m.teams[0]}`, m.teams[1]);
    opp.set(`${m.week}|${m.teams[1]}`, m.teams[0]);
  }
  const head = ["Week", "Team", "Manager", ...lenses.map((l) => LENS_LABEL[l]), "Bench points", "Opponent", ...lenses.slice(0, 2).map((l) => `${LENS_LABEL[l]} result`)];
  const rows = [head.map(cell).join(",")];
  for (const w of f.weeks) {
    for (const t of season.teams) {
      const x = f.tw[t.key][w.week];
      const o = opp.get(`${w.week}|${t.key}`);
      const res = (l: Lens) => {
        if (!o) return "";
        const a = score(f, l, t.key, w.week);
        const b = score(f, l, o, w.week);
        if (a === null || b === null || !w.complete) return "";
        return a > b ? "W" : a < b ? "L" : "T";
      };
      rows.push(
        [w.week, t.name, t.managerName, ...lenses.map((l) => x?.[l] ?? ""), x?.bench ?? "", o ? teamName(season, o) : "", res("actual"), res("bestBall")]
          .map(cell)
          .join(","),
      );
    }
  }
  return new NextResponse(rows.join("\n"), {
    headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="${file}.csv"` },
  });
}
