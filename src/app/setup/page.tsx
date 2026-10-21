import { CopyText } from "@/components/CopyText";
import { SetupForm } from "@/components/SetupForm";
import { Kicker } from "@/components/ui";
import { redirectUri } from "@/lib/env";
import { yahooApp } from "@/lib/yahoo-app";

export const dynamic = "force-dynamic";
export const metadata = { title: "Setup", robots: { index: false, follow: false } };

export default async function Setup() {
  const app = await yahooApp();
  const uri = redirectUri();
  return (
    <main className="wrap">
      <section className="hero" style={{ paddingTop: 40 }}>
        <Kicker tone={app ? undefined : "gold"}>{app ? `Yahoo app set · ID ${app.hint}` : "Yahoo app not set yet"}</Kicker>
        <h1 style={{ marginTop: 14, fontSize: "clamp(40px,8vw,88px)" }}>Yahoo setup</h1>
        <p className="lede">
          {app
            ? app.source === "env"
              ? "The ID and secret come from the site's environment variables, which win over anything saved here."
              : `Saved ${app.updatedAt?.toISOString().slice(0, 10) ?? ""}. Paste a new pair below to replace it.`
            : "Make a Yahoo app, paste its ID and secret below, and the site does the rest."}
        </p>
      </section>
      <div className="grid two">
        <section className="panel notch">
          <h3>Make the Yahoo app</h3>
          <ol className="muted" style={{ lineHeight: 1.8, paddingLeft: 18 }}>
            <li>
              Open <a className="lime" href="https://developer.yahoo.com/apps/create/">developer.yahoo.com/apps/create</a>, signed in to Yahoo.
            </li>
            <li>Application type: Web Application.</li>
            <li>
              Redirect URI, exactly:
              <br />
              <CopyText text={uri} />
            </li>
            <li>API permissions: Fantasy Sports, Read.</li>
            <li>Create it. Yahoo shows a Client ID and a Client Secret.</li>
          </ol>
        </section>
        <SetupForm />
      </div>
    </main>
  );
}
