"use client";
// Reads the setup code from the link's #fragment, which never reaches the
// server's logs, and sends it with the Yahoo app's ID and secret.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function SetupForm() {
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [id, setId] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    // The fragment only exists in the browser; read it in a callback.
    Promise.resolve().then(() => setCode(window.location.hash.slice(1) || ""));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, clientId: id, clientSecret: secret }),
    }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setBusy(false);
    if (!r?.ok) {
      setMsg({ ok: false, text: j?.error ?? "Could not save. Try again." });
      return;
    }
    setId("");
    setSecret("");
    setMsg({
      ok: true,
      text:
        j.check === "ok"
          ? `Saved. Yahoo recognised the app (ID ${j.hint}). Sign-in is on.`
          : `Saved (ID ${j.hint}). Yahoo did not confirm it either way; try Connect Yahoo.`,
    });
    router.refresh();
  }

  if (code === null) return null;
  if (!code) {
    return <p className="notice">Open this page from your setup link. The code in the link is what unlocks it.</p>;
  }
  return (
    <form className="panel notch grid" onSubmit={save} autoComplete="off">
      <h3>Paste the Yahoo app</h3>
      <label className="field">
        Client ID
        <input value={id} onChange={(e) => setId(e.target.value)} spellCheck={false} required />
      </label>
      <label className="field">
        Client Secret
        <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} spellCheck={false} required />
      </label>
      <div className="row">
        <button className="btn" disabled={busy || !id || !secret}>{busy ? "Checking with Yahoo…" : "Save"}</button>
        {msg?.ok ? <a href="/api/yahoo/login" className="btn ghost small">Connect Yahoo</a> : null}
      </div>
      {msg ? <p className={msg.ok ? "lime" : "coral"} style={{ margin: 0 }}>{msg.text}</p> : null}
      <p className="small dim" style={{ margin: 0 }}>
        The secret is checked with Yahoo, encrypted, and stored. It is never shown again, here or anywhere.
      </p>
    </form>
  );
}
