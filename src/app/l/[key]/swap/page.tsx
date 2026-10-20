import Link from "next/link";
import { ShareButton } from "@/components/ShareButton";
import { fmtRec, pct as recPct, scheduleSwap, type Lens } from "@/engine/universes";
import { loadLeague } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Swap({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ lens?: string }> }) {
  const { key } = await params;
  const lens: Lens = (await searchParams).lens === "bestBall" ? "bestBall" : "actual";
  const load = await loadLeague(key);
  if (load.kind !== "ok") return null;
  const { season, board, myTeam } = load;
  const grid = scheduleSwap(board.frame, lens);
  const teams = season.teams;
  const best = (row: string) => Math.max(...teams.map((c) => recPct(grid[row][c.key])));
  const worst = (row: string) => Math.min(...teams.map((c) => recPct(grid[row][c.key])));

  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>Schedule swap</h2>
          <p className="muted small">
            Each row is a team&apos;s {lens === "bestBall" ? "best-ball" : "real"} scores played against the schedule of the column team. The outlined cell is the schedule it really had.
          </p>
        </div>
        <div className="row">
          <Link href={`/l/${key}/swap`} className={`chip lime ${lens === "actual" ? "on" : ""}`}>Real</Link>
          <Link href={`/l/${key}/swap?lens=bestBall`} className={`chip ice ${lens === "bestBall" ? "on" : ""}`}>Best ball</Link>
          <ShareButton target="swap" name={`schedule-swap-${lens}`} />
        </div>
      </div>
      <div className="scroll" id="swap">
        <table className="swap">
          <thead>
            <tr>
              <th className="l">Scores of ↓ / schedule of →</th>
              {teams.map((c) => (
                <th key={c.key} title={c.name}>{c.name.slice(0, 10)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((r) => (
              <tr key={r.key} className={r.key === myTeam ? "me" : ""}>
                <td className="l team">{r.name}</td>
                {teams.map((c) => {
                  const rec = grid[r.key][c.key];
                  const p = recPct(rec);
                  const cls = r.key === c.key ? "diag" : p === best(r.key) ? "lime" : p === worst(r.key) ? "coral" : "";
                  return (
                    <td key={c.key} className={cls}>
                      {fmtRec(rec)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
