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
      <HowItWorks />
    </main>
  );
}

function HowItWorks() {
  const steps: [string, React.ReactNode][] = [
    [
      "The link is the lock",
      <>
        Everything after the <code>#</code> in your setup link is the setup code. Browsers keep that part to themselves: it
        is not sent when the page loads, so it never lands in the site&apos;s logs. The site does not store the code either.
        It stores only a fingerprint of it (a SHA-256 hash), which cannot be turned back into the code.
      </>,
    ],
    [
      "Pressing Save",
      <>
        The page sends one request over HTTPS carrying three things: the setup code, the Client ID and the Client Secret.
        The server fingerprints the code it received and compares it with the stored fingerprint. No match, nothing
        happens. After five wrong codes from the same address, that server refuses tries for ten minutes.
      </>,
    ],
    [
      "Checking with Yahoo",
      <>
        Before saving, the server asks Yahoo&apos;s sign-in service to trade a made-up sign-in code using your ID and secret.
        Yahoo always refuses a made-up code, but how it refuses tells the story. If it says the app does not exist or the
        secret is wrong, nothing is saved and you are told so. If it only objects to the code, the app is real. If its answer
        is unclear, the pair is saved and the page says it could not confirm.
      </>,
    ],
    [
      "Locking it away",
      <>
        The ID and secret are encrypted together with AES-256-GCM, using a 32-byte key that lives only in the site&apos;s
        settings on Vercel. Only the scrambled result goes into the database. The database alone cannot read it, and the key
        alone has nothing to read. The last four characters of the ID stay readable so this page can say which app is set.
        The secret is never shown again and never sent to any browser.
      </>,
    ],
    [
      "Using it",
      <>
        When someone presses Connect Yahoo, the server unlocks the pair in memory, sends them to Yahoo&apos;s sign-in page
        with the ID, and when Yahoo sends them back, uses the ID and secret to swap Yahoo&apos;s one-time code for that
        person&apos;s own access. Their access is encrypted the same way and renewed automatically, so syncing and the daily
        refresh run without anyone here.
      </>,
    ],
    [
      "Changing it",
      <>
        Anyone with this link can paste a new pair. It replaces the old one at once, and every server picks it up within a
        minute. If the link ever leaks, a new setup code can be issued: its fingerprint replaces the old one and the old link
        stops working. If a Client ID and Secret are ever set directly on Vercel, those win over the saved pair.
      </>,
    ],
  ];
  return (
    <section className="section">
      <h2>How it works</h2>
      <div className="grid two" style={{ marginTop: 14 }}>
        {steps.map(([title, body], i) => (
          <div key={title} className="panel notch">
            <div className="row" style={{ gap: 10 }}>
              <span className="big-num lime" style={{ fontSize: 28 }}>{i + 1}</span>
              <h3>{title}</h3>
            </div>
            <p className="muted" style={{ margin: "10px 0 0" }}>{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
