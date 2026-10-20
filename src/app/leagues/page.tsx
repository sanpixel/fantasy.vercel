import Link from "next/link";
import { redirect } from "next/navigation";
import { RefreshLeagues } from "@/components/RefreshLeagues";
import { Kicker } from "@/components/ui";
import { renewToKey } from "@/engine/yahoo-parse";
import { dbReady } from "@/lib/env";
import { currentViewer } from "@/lib/session";
import { leaguesFor, type LeagueRow } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "My leagues" };

/** Group seasons of the same league by following renew links. */
function chains(rows: LeagueRow[]): LeagueRow[][] {
  const byKey = new Map(rows.map((r) => [r.league_key, r]));
  const seen = new Set<string>();
  const out: LeagueRow[][] = [];
  for (const r of rows) {
    if (seen.has(r.league_key)) continue;
    let head = r;
    for (let k = renewToKey(head.renewed); k && byKey.has(k); k = renewToKey(byKey.get(k)!.renewed)) head = byKey.get(k)!;
    const chain: LeagueRow[] = [];
    for (let c: LeagueRow | undefined = head; c && !seen.has(c.league_key); c = byKey.get(renewToKey(c.renew) ?? "")) {
      seen.add(c.league_key);
      chain.push(c);
    }
    out.push(chain);
  }
  return out;
}

export default async function Leagues() {
  if (!dbReady()) redirect("/status");
  const viewer = await currentViewer();
  if (!viewer) redirect("/");
  const rows = await leaguesFor(viewer.guid);
  const groups = chains(rows);

  return (
    <main className="wrap">
      <section className="league-head">
        <Kicker>{viewer.nickname ?? "Signed in"}</Kicker>
        <div className="row" style={{ marginTop: 12 }}>
          <h1 style={{ fontSize: "clamp(40px,7vw,80px)" }}>My leagues</h1>
          <span className="spacer" />
          <RefreshLeagues />
        </div>
      </section>

      {groups.length === 0 ? (
        <p className="notice">Yahoo did not list any NFL leagues for this account. Refresh to ask again.</p>
      ) : (
        <div className="grid two section">
          {groups.map((g) => {
            const latest = g[0];
            return (
              <div key={latest.league_key} className="panel notch">
                <div className="row">
                  <h3>{latest.name}</h3>
                  <span className="spacer" />
                  <span className="muted small">{latest.num_teams} teams</span>
                </div>
                <p className="muted small" style={{ margin: "6px 0 12px" }}>
                  {latest.team_name ? <>You: <b className="lime">{latest.team_name}</b> · </> : null}
                  {g.length} season{g.length > 1 ? "s" : ""}
                </p>
                <div className="chips">
                  {g.map((s) => (
                    <Link key={s.league_key} href={`/l/${s.league_key}`} className={`chip ${s === latest ? "lime on" : ""}`}>
                      {s.season}
                      {!s.is_finished ? " · live" : ""}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <section className="section row">
        <form action="/api/yahoo/logout" method="post">
          <button className="btn ghost small">Sign out</button>
        </form>
        <form action="/api/yahoo/logout?disconnect=1" method="post">
          <button className="btn ghost small">Sign out and forget my Yahoo connection</button>
        </form>
      </section>
    </main>
  );
}
