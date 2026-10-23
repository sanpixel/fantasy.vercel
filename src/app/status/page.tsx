import { Kicker } from "@/components/ui";
import { db } from "@/lib/db";
import { checks, redirectUri } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Setup" };

export default async function Status() {
  const list = await checks();
  let database = "DATABASE_URL is missing.";
  let reachable = false;
  const s = db();
  if (s) {
    try {
      await s`select 1 from fantasy.leagues limit 1`;
      database = "Connected, and the fantasy tables are there.";
      reachable = true;
    } catch {
      database = "Set, but the database did not answer.";
    }
  }
  const yahoo = list.find((c) => c.name === "Yahoo app")!;

  return (
    <main className="wrap">
      <section className="hero" style={{ paddingTop: 40 }}>
        <Kicker tone={yahoo.ok ? undefined : "gold"}>{yahoo.ok ? "Ready" : "Waiting on the Yahoo key"}</Kicker>
        <h1 style={{ marginTop: 14, fontSize: "clamp(40px,8vw,88px)" }}>Setup</h1>
        {/* The setup link shows only until a Yahoo app is saved. */}
        {!yahoo.ok && process.env.SETUP_CODE ? (
          <div className="row" style={{ marginTop: 22 }}>
            <a href={`/setup#${process.env.SETUP_CODE}`} className="btn">Set up Yahoo</a>
            <span className="muted small">Paste the Yahoo app&apos;s Client ID and Secret. The link disappears once it is set.</span>
          </div>
        ) : null}
      </section>
      <div className="scroll">
        <table>
          <tbody>
            {list.map((c) => (
              <tr key={c.name}>
                <td className="l">{c.name}</td>
                <td className={c.ok ? "lime" : c.name === "AI analyst" ? "dim" : "coral"}>{c.ok ? "OK" : "Missing"}</td>
                <td className="l muted">{c.detail}</td>
              </tr>
            ))}
            <tr>
              <td className="l">Database reachable</td>
              <td className={reachable ? "lime" : "coral"}>{reachable ? "OK" : "No"}</td>
              <td className="l muted">{database}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <section className="section panel notch">
        <h3>Switching Yahoo on</h3>
        <ol className="muted" style={{ lineHeight: 1.8 }}>
          <li>
            Open <a className="lime" href="https://developer.yahoo.com/apps/create/">developer.yahoo.com/apps/create</a> signed in to Yahoo.
          </li>
          <li>Application type: Web Application.</li>
          <li>
            Redirect URI, exactly: <code className="lime">{redirectUri()}</code>
          </li>
          <li>API permissions: Fantasy Sports, Read.</li>
          <li>Paste the Client ID and Client Secret Yahoo shows into your setup link. The site checks them with Yahoo and stores them encrypted.</li>
        </ol>
      </section>
    </main>
  );
}
