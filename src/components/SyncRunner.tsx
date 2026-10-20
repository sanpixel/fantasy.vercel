"use client";
// Keeps calling the sync route until the league is fully loaded, then
// refreshes the page so the new numbers show.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function SyncRunner({ leagueKey, full }: { leagueKey: string; full?: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<{ fetched: number; remaining: number; error: string | null; done: boolean }>({
    fetched: 0,
    remaining: 0,
    error: null,
    done: false,
  });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let fetched = 0;
    (async () => {
      for (let round = 0; round < 40; round++) {
        const r = await fetch(`/api/leagues/${encodeURIComponent(leagueKey)}/sync`, { method: "POST" }).catch(() => null);
        const j = await r?.json().catch(() => null);
        if (!r?.ok || !j) {
          setState((s) => ({ ...s, error: j?.error ?? "Yahoo did not answer. Reload to try again." }));
          return;
        }
        fetched += j.fetched ?? 0;
        setState({ fetched, remaining: j.remaining ?? 0, error: null, done: !!j.done });
        if (round === 0 || j.done) router.refresh();
        if (j.done) return;
      }
    })();
  }, [leagueKey, router]);

  const total = state.fetched + state.remaining;
  const pctDone = state.done ? 100 : total ? Math.round((state.fetched / total) * 100) : 4;
  if (!full && state.done && !state.error) return null;

  return (
    <div className={full ? "panel notch section" : "section"} style={full ? { maxWidth: 560 } : { margin: "10px 0" }}>
      {full ? <h3 style={{ marginBottom: 8 }}>Pulling the league from Yahoo</h3> : null}
      <div className="row small muted" style={{ marginBottom: 6 }}>
        <span className="badge live">Syncing</span>
        <span>
          {state.error
            ? state.error
            : state.done
              ? "Up to date."
              : `${state.fetched} pieces in${state.remaining ? `, about ${state.remaining} to go` : ""}. Every roster, every week.`}
        </span>
      </div>
      <div className="progress">
        <i style={{ width: `${pctDone}%` }} />
      </div>
    </div>
  );
}
