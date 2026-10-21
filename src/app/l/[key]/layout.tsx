import Link from "next/link";
import { notFound } from "next/navigation";
import { Chat } from "@/components/Chat";
import { SyncRunner } from "@/components/SyncRunner";
import { Tabs } from "@/components/Tabs";
import { Ticker } from "@/components/Ticker";
import { Kicker } from "@/components/ui";
import { loadLeague } from "@/lib/data";
import { chatReady, signInReady } from "@/lib/env";
import { needsSync } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const load = await loadLeague(key);
  return { title: load.kind === "ok" ? `${load.season.league.name} ${load.season.league.season}` : "League" };
}

export default async function LeagueLayout({ children, params }: { children: React.ReactNode; params: Promise<{ key: string }> }) {
  const { key } = await params;
  const load = await loadLeague(key);
  if (load.kind === "missing") notFound();
  if (load.kind === "signin") {
    return (
      <main className="wrap section">
        <h2>Sign in to see this league</h2>
        <p className="muted">League pages are for the league&apos;s own members, checked against your Yahoo account.</p>
        {(await signInReady()) ? <a href="/api/yahoo/login" className="btn">Connect Yahoo</a> : <Link href="/status" className="btn off">Yahoo key coming</Link>}
      </main>
    );
  }
  if (load.kind === "forbidden") {
    return (
      <main className="wrap section">
        <h2>Not your league</h2>
        <p className="muted">Yahoo does not list this league for your account. If you just joined it, refresh your leagues.</p>
        <Link href="/leagues" className="btn ghost">My leagues</Link>
      </main>
    );
  }
  if (load.kind === "syncing") {
    return (
      <main className="wrap section">
        <SyncRunner leagueKey={key} full />
      </main>
    );
  }

  const { season, board, sample, chain } = load;
  const l = season.league;
  const stale = !sample && (await needsSync(key));
  const lastWeek = board.frame.weeks.filter((w) => w.complete).at(-1)?.week ?? board.frame.weeks.at(-1)?.week ?? 1;
  const base = `/l/${key}`;

  return (
    <>
      <main className="wrap">
        <section className="league-head">
          <div className="row">
            <Kicker tone={sample ? "gold" : undefined}>{sample ? "Sample league · made-up teams and scores" : `${l.season} season`}</Kicker>
            {!l.isFinished ? <span className="badge live">Week {l.currentWeek} live</span> : null}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <div className="league-name">{l.name}</div>
            <span className="spacer" />
            <div className="chips">
              {chain.map((c) => (
                <Link key={c.key} href={`/l/${c.key}`} className={`chip ${c.key === key ? "lime on" : ""}`}>
                  {c.season}
                </Link>
              ))}
            </div>
          </div>
          <Tabs
            base={base}
            items={[
              { href: "", label: "The board" },
              { href: `/week/${lastWeek}`, label: "Weeks" },
              { href: "/teams", label: "Teams" },
              { href: "/swap", label: "Schedule swap" },
              { href: "/koth", label: "King of the hill" },
              { href: "/all-time", label: "All-time" },
            ]}
          />
          {stale ? <SyncRunner leagueKey={key} /> : null}
        </section>
        {children}
        <footer className="section row small dim">
          <a className="chip" href={`/api/leagues/${key}/export?format=csv`}>Download CSV</a>
          <a className="chip" href={`/api/leagues/${key}/export?format=json`}>Download JSON</a>
          <span className="spacer" />
          <span>Scores from Yahoo Fantasy. Best ball computed here.</span>
        </footer>
      </main>
      <Ticker board={board} />
      <Chat leagueKey={key} enabled={chatReady()} />
    </>
  );
}
