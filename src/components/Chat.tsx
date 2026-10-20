"use client";
// The AI analyst panel.
import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant" | "err"; content: string };

const STARTERS = [
  "Who got robbed the most this season?",
  "Who would be champ in best ball, and why?",
  "Worst bench decision of the year?",
];

export function Chat({ leagueKey, enabled }: { leagueKey: string; enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  async function send(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: question }];
    setMsgs(next);
    setText("");
    setBusy(true);
    const history = next.filter((m) => m.role !== "err").map((m) => ({ role: m.role, content: m.content }));
    try {
      const r = await fetch(`/api/leagues/${encodeURIComponent(leagueKey)}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        console.error("Analyst error", { status: r.status, error: j.error });
        setMsgs((m) => [...m, { role: "err", content: j.error ?? "Something broke." }]);
      } else setMsgs((m) => [...m, { role: "assistant", content: j.reply }]);
    } catch (e) {
      console.error("Analyst request failed", e);
      setMsgs((m) => [...m, { role: "err", content: "Could not reach the analyst." }]);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="chat-fab" onClick={() => setOpen(true)}>
        Ask the analyst
      </button>
    );
  }
  return (
    <div className="chat" role="dialog" aria-label="League analyst">
      <header>
        <b style={{ fontFamily: "var(--display)", fontSize: 18, textTransform: "uppercase" }}>The analyst</b>
        <span className="spacer" />
        <button className="chip" onClick={() => setOpen(false)}>Close</button>
      </header>
      <div className="log" ref={log}>
        {!enabled ? (
          <p className="muted small">The analyst switches on once an Anthropic key is added. Everything else works now.</p>
        ) : msgs.length === 0 ? (
          <>
            <p className="muted small">Ask anything about this season. It reads the real numbers and talks trash about them.</p>
            {STARTERS.map((s) => (
              <button key={s} className="chip" style={{ alignSelf: "flex-start" }} onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </>
        ) : null}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.content}
          </div>
        ))}
        {busy ? <div className="msg assistant muted">Digging through the box scores…</div> : null}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Who choked hardest?" disabled={!enabled} maxLength={2000} />
        <button className="btn small ice" disabled={!enabled || busy}>Ask</button>
      </form>
    </div>
  );
}
