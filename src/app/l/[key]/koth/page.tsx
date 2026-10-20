import Link from "next/link";
import { ShareButton } from "@/components/ShareButton";
import { pts } from "@/components/ui";
import type { Lens } from "@/engine/universes";
import { loadLeague, teamName } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Koth({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ lens?: string }> }) {
  const { key } = await params;
  const lens: Lens = (await searchParams).lens === "bestBall" ? "bestBall" : "actual";
  const load = await loadLeague(key);
  if (load.kind !== "ok") return null;
  const { season, board, myTeam } = load;
  const u = board.universes.find((x) => x.id === `koth-${lens}`)!;
  const k = u.koth!;
  const weeks = board.frame.weeks.filter((w) => w.complete).map((w) => w.week);
  const strikesBy = (team: string, w: number) =>
    Object.entries(k.rows.find((r) => r.team === team)!.struck).filter(([wk]) => Number(wk) <= w).length;

  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>
            King of the hill{" "}
            {k.king ? (
              <span className="glow-gold">· {teamName(season, k.king)}</span>
            ) : (
              <span className="muted">· {k.standing} standing</span>
            )}
          </h2>
          <p className="muted small">
            Each week the lowest scores take a strike ({k.weeks.length ? "schedule set per league" : "no strike weeks yet"}). Three strikes and you are out. Ties at the line go to fewer season points.
          </p>
        </div>
        <div className="row">
          <Link href={`/l/${key}/koth`} className={`chip lime ${lens === "actual" ? "on" : ""}`}>Real scores</Link>
          <Link href={`/l/${key}/koth?lens=bestBall`} className={`chip ice ${lens === "bestBall" ? "on" : ""}`}>Best ball</Link>
          <ShareButton target="koth" name={`king-of-the-hill-${lens}`} />
        </div>
      </div>
      <div className="scroll" id="koth">
        <table>
          <thead>
            <tr>
              <th className="l">Team</th>
              {weeks.map((w) => (
                <th key={w}>{w}</th>
              ))}
              <th>Strikes</th>
              <th className="l">Status</th>
            </tr>
          </thead>
          <tbody>
            {k.rows.map((r) => (
              <tr key={r.team} className={`${r.team === k.king ? "crown" : ""} ${r.team === myTeam ? "me" : ""}`}>
                <td className="l team">{teamName(season, r.team)}</td>
                {weeks.map((w) => {
                  const out = r.out !== null && w > r.out;
                  const s = strikesBy(r.team, w);
                  return (
                    <td key={w} className={out ? "kx" : r.struck[w] ? `k${Math.min(s, 3)}` : "k0"}>
                      {out ? "" : pts(r.scores[w])}
                    </td>
                  );
                })}
                <td>{r.strikes}</td>
                <td className="l">
                  {r.team === k.king ? <b className="gold">KING</b> : r.out !== null ? <span className="coral">Out wk {r.out}</span> : <span className="lime">Alive</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
