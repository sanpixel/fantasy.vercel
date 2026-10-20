"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function RefreshLeagues() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function go() {
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/leagues/refresh", { method: "POST" }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setBusy(false);
    if (!r?.ok) setMsg(j?.error ?? "Yahoo did not answer.");
    else router.refresh();
  }
  return (
    <span className="row">
      <button className="btn ghost small" onClick={go} disabled={busy}>
        {busy ? "Asking Yahoo…" : "Refresh from Yahoo"}
      </button>
      {msg ? <span className="coral small">{msg}</span> : null}
    </span>
  );
}
