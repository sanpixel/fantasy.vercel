import Link from "next/link";
import { pct, pts } from "@/components/ui";
import { fmtRec } from "@/engine/universes";
import { divisionName, loadLeague } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Teams({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const load = await loadLeague(key);
  if (load.kind !== "ok") return null;
  const { season, board, myTeam } = load;
  const real = board.universes.find((u) => u.id === "h2h-actual")!;
  const bb = board.universes.find((u) => u.id === "h2h-bestBall")!;
  const stat = new Map(board.stats.map((s) => [s.team, s]));
  const teams = [...season.teams].sort((a, b) => (real.place[a.key] ?? 99) - (real.place[b.key] ?? 99));

  return (
    <section className="section">
      <div className="grid cards">
        {teams.map((t) => {
          const s = stat.get(t.key)!;
          const rr = real.table!.find((r) => r.team === t.key)!;
          const br = bb.table!.find((r) => r.team === t.key)!;
          return (
            <Link key={t.key} href={`/l/${key}/teams/${t.key}`} className="uni lens-actual" style={t.key === myTeam ? { borderColor: "var(--lime)" } : undefined}>
              <div className="title">
                {t.managerName ?? ""} {divisionName(load, t.divisionId) ? `· ${divisionName(load, t.divisionId)}` : ""}
              </div>
              <div className="who">{t.name}</div>
              <div className="row small">
                <span className="lime num">{fmtRec(rr.rec)}</span>
                <span className="dim">real</span>
                <span className="ice num">{fmtRec(br.rec)}</span>
                <span className="dim">best ball</span>
              </div>
              <div className="rule">
                <span className="coral">{pts(s.bench)}</span> benched · IQ {pct(s.iq)} · {s.universesWon} universe{s.universesWon === 1 ? "" : "s"} won
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
