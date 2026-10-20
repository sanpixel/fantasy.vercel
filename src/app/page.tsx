import Link from "next/link";
import { SAMPLE_LATEST, sampleKey, sampleSeason } from "@/engine/sample";
import { board } from "@/engine/universes";
import { Kicker } from "@/components/ui";
import { signInReady } from "@/lib/env";
import { currentViewer } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const viewer = await currentViewer();
  const ready = signInReady();
  const demo = sampleSeason(sampleKey(2025))!;
  const b = board(demo);
  const crowned = b.universes.filter((u) => u.champion);
  const distinct = new Set(crowned.map((u) => u.champion)).size;
  const name = (k: string | null) => demo.teams.find((t) => t.key === k)?.name ?? "—";

  return (
    <main className="wrap">
      <section className="hero">
        <Kicker>Yahoo fantasy football</Kicker>
        <h1 style={{ marginTop: 18 }}>
          Every season.
          <br />
          <span className="ice">Every universe.</span>
        </h1>
        <p className="lede" style={{ marginTop: 18 }}>
          Your league, rebuilt week by week with the lineup everyone should have set. Then the whole season is
          replayed a dozen ways, every past season too, to settle who actually won.
        </p>
        {error ? <p className="notice bad">{error}</p> : null}
        <div className="row">
          {viewer ? (
            <Link href="/leagues" className="btn">My leagues</Link>
          ) : ready ? (
            <a href="/api/yahoo/login" className="btn">Connect Yahoo</a>
          ) : (
            <Link href="/status" className="btn off" title="The Yahoo key has not been added yet">Yahoo key coming</Link>
          )}
          <Link href={`/l/${SAMPLE_LATEST}`} className="btn ghost">Open the sample league</Link>
        </div>
      </section>

      <section className="lens-strip">
        <div className="panel notch">
          <Kicker>Real</Kicker>
          <h3>What Yahoo said</h3>
          <p className="muted small">The scores, the records, the champion. The universe everyone already argues about.</p>
        </div>
        <div className="panel notch">
          <Kicker tone="ice">Best ball</Kicker>
          <h3>The perfect lineup</h3>
          <p className="muted small">Every week, the best lineup each roster could legally have started. Flex, superflex, IDP: solved, not guessed.</p>
        </div>
        <div className="panel notch">
          <Kicker tone="coral">Bench</Kicker>
          <h3>Points left behind</h3>
          <p className="muted small">Every benched player who should have started, and the starter he should have replaced.</p>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <Kicker tone="ghost">Sample league · 2025</Kicker>
            <h2 style={{ marginTop: 10 }}>
              <span className="glow-gold">{distinct}</span> different champions
            </h2>
            <p className="muted">Same twelve made-up teams, same scores, {crowned.length} ways to crown somebody.</p>
          </div>
          <Link href={`/l/${sampleKey(2025)}`} className="btn small ice">See them all</Link>
        </div>
        <div className="grid cards">
          {crowned.slice(0, 6).map((u) => (
            <div key={u.id} className={`uni lens-${u.lens}`}>
              <div className="title">{u.title}</div>
              <div className="who">{name(u.champion)}</div>
              <div className="rule">{u.rule}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="section row muted small">
        <Link href="/tiers" className="chip">Play the tier game</Link>
        <Link href="/status" className="chip">Setup status</Link>
      </section>
    </main>
  );
}
