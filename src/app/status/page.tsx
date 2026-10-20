import { Kicker } from "@/components/ui";
import { db } from "@/lib/db";
import { checks, redirectUri } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Setup" };

export default async function Status() {
  const list = checks();
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
          <li>Hand over the Client ID and Client Secret Yahoo shows. They go in as YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET.</li>
        </ol>
      </section>
    </main>
  );
}
