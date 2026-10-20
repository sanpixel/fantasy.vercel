import Link from "next/link";
import { notFound } from "next/navigation";
import { ShareButton } from "@/components/ShareButton";
import { pts } from "@/components/ui";
import type { TeamWeek } from "@/engine/season";
import { loadLeague, teamName } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Week({ params }: { params: Promise<{ key: string; n: string }> }) {
  const { key, n } = await params;
  const load = await loadLeague(key);
  if (load.kind !== "ok") return null;
  const { season, board, myTeam } = load;
  const f = board.frame;
  const week = Number(n);
  const wk = f.weeks.find((w) => w.week === week);
  if (!wk) notFound();
  const name = (k: string) => teamName(season, k);
  const mgr = (k: string) => season.teams.find((t) => t.key === k)?.managerName ?? "";

  const games = wk.matchups.map((m) => {
    const [a, b] = m.teams;
    const A = f.tw[a]?.[week];
    const B = f.tw[b]?.[week];
    const realW = A?.actual != null && B?.actual != null ? (A.actual > B.actual ? a : A.actual < B.actual ? b : null) : null;
    const bestW = A?.bestBall != null && B?.bestBall != null ? (A.bestBall > B.bestBall ? a : A.bestBall < B.bestBall ? b : null) : null;
    return { m, a, b, A, B, realW, bestW, flip: wk.complete && realW !== bestW };
  });
  const flips = games.filter((g) => g.flip).length;
  const bench = games.reduce((t, g) => t + (g.A?.bench ?? 0) + (g.B?.bench ?? 0), 0);
  // Teams without a matchup this week (knocked out of the playoffs, say).
  const playing = new Set(wk.matchups.flatMap((m) => m.teams));
  const idle = season.teams.filter((t) => !playing.has(t.key) && f.tw[t.key][week]?.hasRoster);

  return (
    <>
      <section className="section">
        <div className="chips">
          {f.weeks.map((w) => (
            <Link key={w.week} href={`/l/${key}/week/${w.week}`} className={`chip ${w.week === week ? "lime on" : ""}`}>
              {w.playoffs ? "P" : ""}
              {w.week}
            </Link>
          ))}
        </div>
      </section>
      <section className="section-head">
        <div>
          <h2>
            Week {week} {wk.playoffs ? <span className="gold">· playoffs</span> : null}
          </h2>
          <p className="muted small">
            {wk.complete ? "Final." : "In progress, not counted yet."} {flips} winner{flips === 1 ? "" : "s"} flip in best ball.{" "}
            <span className="coral">{bench.toFixed(1)}</span> points left on benches.
          </p>
        </div>
        <ShareButton target="week" name={`week-${week}`} />
      </section>
      <div className="grid two" id="week">
        {games.map((g) => (
          <div key={`${g.a}-${g.b}`} className={`panel match ${g.flip ? "flip" : ""}`}>
            {[g.a, g.b].map((t) => {
              const x = t === g.a ? g.A : g.B;
              return (
                <div key={t} className={`side ${g.realW === t ? "won-real" : ""} ${g.bestW === t ? "won-best" : ""}`}>
                  <div style={{ minWidth: 0 }}>
                    <div className="name">
                      <Link href={`/l/${key}/teams/${t}`}>{name(t)}</Link>
                      {t === myTeam ? <span className="lime"> ●</span> : null}
                    </div>
                    <div className="mgr">{mgr(t)}</div>
                  </div>
                  <div className="score real">
                    <small>REAL</small>
                    {pts(x?.actual)}
                  </div>
                  <div className="score best">
                    <small>BEST</small>
                    {pts(x?.bestBall)}
                  </div>
                </div>
              );
            })}
            <div className="foot">
              {g.flip ? <span className="badge flip">Winner flips</span> : <span className="badge same">Same winner</span>}
              {g.m.isPlayoffs ? <span className="badge sample">Playoff</span> : null}
              <span className="coral">−{((g.A?.bench ?? 0) + (g.B?.bench ?? 0)).toFixed(1)} benched</span>
            </div>
            <details>
              <summary className="small" style={{ padding: "8px 14px" }}>Lineups</summary>
              {[g.a, g.b].map((t) => (
                <Lineups key={t} title={name(t)} x={t === g.a ? g.A : g.B} />
              ))}
            </details>
          </div>
        ))}
      </div>
      {idle.length ? (
        <section className="section">
          <h3>No matchup this week</h3>
          <p className="muted small">Their rosters still played. Real here is what their starters scored.</p>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th className="l">Team</th>
                  <th>Real</th>
                  <th>Best ball</th>
                  <th>Bench</th>
                </tr>
              </thead>
              <tbody>
                {idle.map((t) => {
                  const x = f.tw[t.key][week];
                  return (
                    <tr key={t.key}>
                      <td className="l team">{t.name}</td>
                      <td className="lime">{pts(x?.actual)}</td>
                      <td className="ice">{pts(x?.bestBall)}</td>
                      <td className="coral">{pts(x?.bench)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}

function Lineups({ title, x }: { title: string; x: TeamWeek | undefined }) {
  if (!x?.started || !x.best) return <p className="small muted" style={{ padding: "0 14px" }}>{title}: roster not loaded.</p>;
  const best = new Set(x.best.placed.map((p) => p.spot.playerKey));
  const started = new Set(x.started.placed.map((p) => p.spot.playerKey));
  return (
    <div className="lineups">
      <div>
        <h4>{title} · started</h4>
        {x.started.placed.map((p) => (
          <div key={p.spot.playerKey} className={`pl ${best.has(p.spot.playerKey) ? "" : "out"}`}>
            <span className="slot">{p.slot}</span>
            <span className="pn">{p.spot.name}</span>
            <span className="pp">{p.spot.points.toFixed(1)}</span>
          </div>
        ))}
      </div>
      <div>
        <h4>Best possible</h4>
        {x.best.placed.map((p) => (
          <div key={p.spot.playerKey} className={`pl ${started.has(p.spot.playerKey) ? "" : "up"}`}>
            <span className="slot">{p.slot}</span>
            <span className="pn">{p.spot.name}</span>
            <span className="pp">{p.spot.points.toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
