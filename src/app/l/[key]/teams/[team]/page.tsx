import Link from "next/link";
import { notFound } from "next/navigation";
import { Kicker, Place, pct, pts, signed } from "@/components/ui";
import { NOT_STARTING, RESERVE } from "@/engine/lineup";
import { fmtRec, regret, score, scheduleSwap, type Lens } from "@/engine/universes";
import { divisionName, loadLeague, teamName } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Team({ params }: { params: Promise<{ key: string; team: string }> }) {
  const { key, team } = await params;
  const load = await loadLeague(key);
  if (load.kind !== "ok") return null;
  const { season, board } = load;
  const f = board.frame;
  const t = season.teams.find((x) => x.key === decodeURIComponent(team));
  if (!t) notFound();
  const name = (k: string | null | undefined) => teamName(season, k);
  const s = board.stats.find((x) => x.team === t.key)!;
  const r = regret(f).find((x) => x.team === t.key)!;
  const real = board.universes.find((u) => u.id === "h2h-actual")!;
  const bb = board.universes.find((u) => u.id === "h2h-bestBall")!;
  const n = season.teams.length;

  const opp = new Map<number, string>();
  for (const m of season.matchups) {
    if (m.teams[0] === t.key) opp.set(m.week, m.teams[1]);
    if (m.teams[1] === t.key) opp.set(m.week, m.teams[0]);
  }
  const result = (lens: Lens, w: number) => {
    const o = opp.get(w);
    const wk = f.weeks.find((x) => x.week === w);
    if (!o || !wk?.complete) return "";
    const a = score(f, lens, t.key, w);
    const b = score(f, lens, o, w);
    if (a === null || b === null) return "";
    return a > b ? "W" : a < b ? "L" : "T";
  };

  // Every player who was on the roster, every week.
  const players = new Map<string, { name: string; pos: string; weeks: Record<number, { pts: number; slot: string; best: boolean }> }>();
  for (const w of f.weeks) {
    const x = f.tw[t.key][w.week];
    const best = new Set(x?.best?.placed.map((p) => p.spot.playerKey) ?? []);
    for (const sp of season.rosters[w.week]?.[t.key] ?? []) {
      if (!players.has(sp.playerKey)) players.set(sp.playerKey, { name: sp.name, pos: sp.position, weeks: {} });
      players.get(sp.playerKey)!.weeks[w.week] = { pts: sp.points, slot: sp.slot, best: best.has(sp.playerKey) };
    }
  }
  const POS = ["QB", "RB", "WR", "TE", "K", "DEF"];
  const plist = [...players.entries()].sort(
    (a, b) =>
      (POS.indexOf(a[1].pos.split(",")[0]) + 1 || 9) - (POS.indexOf(b[1].pos.split(",")[0]) + 1 || 9) ||
      Object.values(b[1].weeks).reduce((s, x) => s + x.pts, 0) - Object.values(a[1].weeks).reduce((s, x) => s + x.pts, 0),
  );
  const swapReal = scheduleSwap(f, "actual")[t.key];
  const swapBB = scheduleSwap(f, "bestBall")[t.key];

  return (
    <>
      <section className="section">
        <Kicker tone="ghost">
          {t.managerName ?? "Team"} {divisionName(load, t.divisionId) ? `· ${divisionName(load, t.divisionId)}` : ""}
        </Kicker>
        <h1 style={{ marginTop: 12, fontSize: "clamp(36px,7vw,76px)" }}>{t.name}</h1>
        <div className="grid cards" style={{ marginTop: 18 }}>
          <Stat label="Real" value={fmtRec(real.table!.find((x) => x.team === t.key)!.rec)} cls="glow-lime" sub={`Finished ${real.place[t.key] ?? "—"}`} />
          <Stat label="Best ball" value={fmtRec(bb.table!.find((x) => x.team === t.key)!.rec)} cls="glow-ice" sub={`Finished ${bb.place[t.key] ?? "—"}`} />
          <Stat label="Bench" value={pts(s.bench)} cls="coral" sub={`${pts(s.benchAvg)} a week · lineup IQ ${pct(s.iq)}`} />
          <Stat label="Luck" value={signed(s.luck)} cls={s.luck >= 0 ? "lime" : "coral"} sub={`If you'd set it right: ${fmtRec(r.youPerfect)}. If they had: ${fmtRec(r.theyPerfect)}.`} />
        </div>
      </section>

      <section className="section">
        <h2>Week by week</h2>
        <div className="scroll" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Wk</th>
                <th className="l">Opponent</th>
                <th>Real</th>
                <th>Best ball</th>
                <th>Floor</th>
                <th>Projected</th>
                <th>Bench</th>
                <th>Real</th>
                <th>Best ball</th>
              </tr>
            </thead>
            <tbody>
              {f.weeks.map((w) => {
                const x = f.tw[t.key][w.week];
                const o = opp.get(w.week);
                return (
                  <tr key={w.week}>
                    <td>
                      <Link href={`/l/${key}/week/${w.week}`}>{w.week}</Link>
                    </td>
                    <td className="l">{o ? <Link href={`/l/${key}/teams/${o}`}>{name(o)}</Link> : <span className="dim">—</span>}</td>
                    <td className="lime">{pts(x?.actual)}</td>
                    <td className="ice">{pts(x?.bestBall)}</td>
                    <td className="dim">{pts(x?.floor)}</td>
                    <td className="dim">{pts(x?.projected)}</td>
                    <td className="coral">{pts(x?.bench)}</td>
                    <td>{result("actual", w.week)}</td>
                    <td className={result("actual", w.week) !== result("bestBall", w.week) ? "coral" : ""}>{result("bestBall", w.week)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <h2>Every player, every week</h2>
        <p className="muted small">
          <span className="lime">Outlined</span>: started. <span className="ice">Blue</span>: benched but belonged in the best lineup.{" "}
          <span className="coral">Red</span>: started but did not.
        </p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th className="l">Player</th>
                <th>Pos</th>
                {f.weeks.map((w) => (
                  <th key={w.week}>{w.week}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plist.map(([pk, p]) => (
                <tr key={pk}>
                  <td className="l team">{p.name}</td>
                  <td className="dim">{p.pos}</td>
                  {f.weeks.map((w) => {
                    const c = p.weeks[w.week];
                    if (!c) return <td key={w.week} />;
                    const started = !NOT_STARTING.has(c.slot);
                    const cls = RESERVE.has(c.slot) ? "cell-ir" : started && c.best ? "cell-start" : !started && c.best ? "cell-miss" : started ? "cell-bust" : "dim";
                    return (
                      <td key={w.week} className={cls} title={c.slot}>
                        {c.pts.toFixed(1)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section grid two">
        <div>
          <h3>Every universe</h3>
          <div className="scroll" style={{ marginTop: 10 }}>
            <table>
              <tbody>
                {board.universes.map((u) => (
                  <tr key={u.id}>
                    <td className="l">{u.title}</td>
                    <td>
                      <Place n={u.place[t.key]} of={n} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h3>Their schedule, your scores</h3>
          <div className="scroll" style={{ marginTop: 10 }}>
            <table>
              <thead>
                <tr>
                  <th className="l">Schedule of</th>
                  <th>Real</th>
                  <th>Best ball</th>
                </tr>
              </thead>
              <tbody>
                {season.teams.map((c) => (
                  <tr key={c.key} className={c.key === t.key ? "me" : ""}>
                    <td className="l team">{c.name}</td>
                    <td className="lime">{fmtRec(swapReal[c.key])}</td>
                    <td className="ice">{fmtRec(swapBB[c.key])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}

function Stat({ label, value, sub, cls }: { label: string; value: string; sub: string; cls: string }) {
  return (
    <div className="panel notch">
      <div className="small dim" style={{ fontFamily: "var(--mono)", letterSpacing: "0.12em", textTransform: "uppercase" }}>{label}</div>
      <div className={`big-num ${cls}`} style={{ fontSize: "clamp(32px,5vw,48px)" }}>{value}</div>
      <div className="small muted">{sub}</div>
    </div>
  );
}
