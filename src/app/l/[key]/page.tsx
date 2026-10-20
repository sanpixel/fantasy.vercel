import Link from "next/link";
import { PrefsForm } from "@/components/PrefsForm";
import { ShareButton } from "@/components/ShareButton";
import { Kicker, Place, pct, pts, signed } from "@/components/ui";
import { fmtRec, regret, type Bracket, type Universe } from "@/engine/universes";
import { loadLeague, teamName } from "@/lib/data";
import { loadPrefs } from "@/lib/store";

export const dynamic = "force-dynamic";

const SHORT_LENS: Record<string, string> = { actual: "Real", bestBall: "BB", projected: "Proj", floor: "Floor" };
const SHORT_FMT: Record<string, string> = { h2h: "H2H", median: "Med", allplay: "All-play", points: "Pts", koth: "KotH" };

export default async function Board({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ u?: string }>;
}) {
  const { key } = await params;
  const { u } = await searchParams;
  const load = await loadLeague(key);
  if (load.kind !== "ok") return null;
  const { season, board, sample, myTeam } = load;
  const l = season.league;
  const name = (k: string | null | undefined) => teamName(season, k);
  const real = board.universes.find((x) => x.id === "h2h-actual")!;
  const realChamp = board.realChampion ?? (real.complete ? real.champion : null);
  const n = season.teams.length;

  // Teams ordered by universes won, then real finish.
  const statOf = new Map(board.stats.map((s) => [s.team, s]));
  const order = [...season.teams].sort(
    (a, b) =>
      (statOf.get(b.key)?.universesWon ?? 0) - (statOf.get(a.key)?.universesWon ?? 0) ||
      (real.place[a.key] ?? 99) - (real.place[b.key] ?? 99),
  );
  const pick = board.universes.find((x) => x.id === u) ?? board.universes.find((x) => x.id === "h2h-bestBall")!;
  const regrets = new Map(regret(board.frame).map((r) => [r.team, r]));
  const prefs = sample ? null : await loadPrefs(key);

  return (
    <>
      <section className="section">
        <Kicker tone="ghost">{l.isFinished ? `The ${l.season} verdicts` : `Through week ${board.frame.regularWeeks.at(-1) ?? 0}`}</Kicker>
        <h1 style={{ marginTop: 14, fontSize: "clamp(40px,8vw,92px)" }}>
          {realChamp ? (
            <>
              Yahoo crowned <span className="glow-lime">{name(realChamp)}</span>.
            </>
          ) : (
            <>Who&apos;s winning what</>
          )}
        </h1>
        <p className="lede" style={{ marginTop: 14 }}>
          {realChamp ? (
            <>
              {board.universes.length} universes, {new Set(board.universes.map((x) => x.leader).filter(Boolean)).size} different winners.{" "}
              {board.universes.filter((x) => x.champion === realChamp).length} of them agree with Yahoo.
            </>
          ) : (
            <>
              {board.universes.length} universes, {new Set(board.universes.map((x) => x.leader).filter(Boolean)).size} different
              leaders so far. Only finished weeks count.
            </>
          )}
        </p>
      </section>

      {board.checks.length ? (
        <section className="notice">
          <b>Data checks</b>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {board.checks.slice(0, 8).map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="section">
        <div className="section-head">
          <h2>Every universe</h2>
          <ShareButton target="universes" name={`${l.name}-${l.season}-universes`} />
        </div>
        <div className="grid cards" id="universes">
          {board.universes.map((x) => (
            <UniverseCard key={x.id} u={x} name={name} realChamp={realChamp} hrefBase={`/l/${key}`} />
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <h2>The multiverse table</h2>
            <p className="muted small">Where every team finished in every universe. Gold is a title.</p>
          </div>
          <ShareButton target="multiverse" name={`${l.name}-${l.season}-multiverse`} />
        </div>
        <div className="scroll" id="multiverse">
          <table>
            <thead>
              <tr>
                <th className="l">Team</th>
                <th>Titles</th>
                {board.universes.map((x) => (
                  <th key={x.id} title={x.title}>
                    {SHORT_LENS[x.lens]} {SHORT_FMT[x.format]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {order.map((t) => (
                <tr key={t.key} className={t.key === myTeam ? "me" : ""}>
                  <td className="l team">
                    <Link href={`/l/${key}/teams/${t.key}`}>{t.name}</Link>
                  </td>
                  <td className="gold">{statOf.get(t.key)?.universesWon || ""}</td>
                  {board.universes.map((x) => (
                    <td key={x.id}>
                      <Place n={x.place[t.key]} of={n} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <h2>Standings</h2>
            <p className="muted small">{pick.rule}.</p>
          </div>
        </div>
        <div className="chips" style={{ marginBottom: 12 }}>
          {board.universes
            .filter((x) => x.table)
            .map((x) => (
              <Link key={x.id} href={`/l/${key}?u=${x.id}#standings`} className={`chip ${x.lens === "bestBall" ? "ice" : "lime"} ${x.id === pick.id ? "on" : ""}`}>
                {SHORT_LENS[x.lens]} {SHORT_FMT[x.format]}
              </Link>
            ))}
        </div>
        <div className="scroll" id="standings">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th className="l">Team</th>
                <th>{pick.format === "median" ? "Record + median" : "Record"}</th>
                <th>Points for</th>
                <th>Against</th>
                <th>All-play</th>
                <th>Seed</th>
                <th>Real record</th>
              </tr>
            </thead>
            <tbody>
              {(pick.table ?? []).map((r) => (
                <tr key={r.team} className={`${r.team === pick.champion ? "crown" : ""} ${r.team === myTeam ? "me" : ""}`}>
                  <td>
                    <Place n={pick.place[r.team]} of={n} />
                  </td>
                  <td className="l team">
                    <Link href={`/l/${key}/teams/${r.team}`}>{name(r.team)}</Link>
                    {r.team === pick.champion ? <span className="gold"> ★</span> : null}
                  </td>
                  <td>{fmtRec(r.rec)}</td>
                  <td className={pick.lens === "bestBall" ? "ice" : ""}>{pts(r.pf)}</td>
                  <td className="dim">{pts(r.pa)}</td>
                  <td>{fmtRec(r.allPlay)}</td>
                  <td className="dim">{r.seed ?? ""}</td>
                  <td className="dim">{fmtRec(real.table!.find((x) => x.team === r.team)!.rec)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pick.bracket && pick.bracket.rounds.length ? <BracketView b={pick.bracket} name={name} /> : null}
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <h2>
              Points left on the <span className="coral">bench</span>
            </h2>
            <p className="muted small">Regular season. Luck is real wins minus what an average schedule would have given.</p>
          </div>
        </div>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th className="l">Team</th>
                <th>Real pts</th>
                <th>Best ball</th>
                <th>Bench</th>
                <th>Per week</th>
                <th>Lineup IQ</th>
                <th>Luck</th>
                <th>High scores</th>
                <th title="Your best lineup against their real one">You perfect</th>
                <th title="Your real lineup against their best one">They perfect</th>
              </tr>
            </thead>
            <tbody>
              {[...board.stats]
                .sort((a, b) => b.bench - a.bench)
                .map((s) => {
                  const r = regrets.get(s.team)!;
                  return (
                    <tr key={s.team} className={s.team === myTeam ? "me" : ""}>
                      <td className="l team">
                        <Link href={`/l/${key}/teams/${s.team}`}>{name(s.team)}</Link>
                      </td>
                      <td className="lime">{pts(s.actualPoints)}</td>
                      <td className="ice">{pts(s.bestBallPoints)}</td>
                      <td className="coral">{pts(s.bench)}</td>
                      <td>{pts(s.benchAvg)}</td>
                      <td>{pct(s.iq)}</td>
                      <td className={s.luck > 0 ? "lime" : s.luck < 0 ? "coral" : ""}>{signed(s.luck)}</td>
                      <td>{s.highs || ""}</td>
                      <td>
                        {fmtRec(r.youPerfect)} <span className="dim">({fmtRec(r.actual)})</span>
                      </td>
                      <td>{fmtRec(r.theyPerfect)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      {prefs ? (
        <section className="section">
          <PrefsForm
            leagueKey={key}
            divisions={Object.keys(l.divisions).map((id) => ({ id, name: prefs.divisionNames[id] ?? l.divisions[id] }))}
            includeReserve={prefs.options.includeReserve}
            koth={prefs.options.kothSchedule}
          />
        </section>
      ) : null}
    </>
  );
}

function UniverseCard({
  u,
  name,
  realChamp,
  hrefBase,
}: {
  u: Universe;
  name: (k: string | null) => string;
  realChamp: string | null;
  hrefBase: string;
}) {
  const href = u.format === "koth" ? `${hrefBase}/koth?lens=${u.lens}` : `${hrefBase}?u=${u.id}#standings`;
  const isReal = u.id === "h2h-actual";
  return (
    <Link href={href} className={`uni lens-${u.lens} ${isReal ? "real" : ""}`}>
      <div className="title">{u.title}</div>
      <div className="who">
        {u.champion && u.complete ? (
          <span>{name(u.champion)}</span>
        ) : u.leader ? (
          <span className="muted">{name(u.leader)}</span>
        ) : (
          <span className="muted">Not started</span>
        )}
      </div>
      <div className="row small">
        {!u.complete && u.leader ? <span className="badge live">{u.koth ? `Leading · ${u.koth.standing} alive` : "Leading"}</span> : null}
        {u.complete && realChamp && u.champion && !isReal ? (
          u.champion === realChamp ? <span className="badge same">Same as Yahoo</span> : <span className="badge flip">Different champ</span>
        ) : null}
      </div>
      <div className="rule">{u.rule}</div>
    </Link>
  );
}

function BracketView({ b, name }: { b: Bracket; name: (k: string | null) => string }) {
  return (
    <div className="bracket section">
      {b.rounds.map((games, i) => (
        <div className="round" key={i}>
          <h4>
            {i === b.rounds.length - 1 && b.complete ? "Final" : `Round ${i + 1}`} · week {games[0]?.week}
          </h4>
          {games.map((g) => (
            <div className="bgame" key={`${g.a}-${g.b}`}>
              {[
                [g.a, g.seedA, g.sa],
                [g.b, g.seedB, g.sb],
              ].map(([t, s, p]) => (
                <div key={String(t)} className={g.winner ? (g.winner === t ? "w" : "lose") : ""}>
                  <span className="sd">{s}</span>
                  <span>{name(t as string)}</span>
                  <span className="pt">{pts(p as number | null)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
