"use client";
// League display settings, for members.
import { useRouter } from "next/navigation";
import { useState } from "react";

export function PrefsForm({
  leagueKey,
  divisions,
  includeReserve,
  koth,
}: {
  leagueKey: string;
  divisions: { id: string; name: string }[];
  includeReserve: boolean;
  koth: Record<number, number>;
}) {
  const router = useRouter();
  const [names, setNames] = useState(Object.fromEntries(divisions.map((d) => [d.id, d.name])));
  const [reserve, setReserve] = useState(includeReserve);
  const [sched, setSched] = useState(
    Object.keys(koth)
      .map(Number)
      .sort((a, b) => a - b)
      .map((w) => koth[w])
      .join(", "),
  );
  const [msg, setMsg] = useState("");

  async function save() {
    const list = sched.split(/[\s,]+/).filter(Boolean).map(Number);
    if (list.some((n) => !Number.isFinite(n) || n < 0)) {
      setMsg("Strikes must be numbers.");
      return;
    }
    const r = await fetch(`/api/leagues/${encodeURIComponent(leagueKey)}/prefs`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        divisionNames: names,
        includeReserve: reserve,
        kothSchedule: Object.fromEntries(list.map((n, i) => [i + 1, n])),
      }),
    });
    setMsg(r.ok ? "Saved." : "Could not save.");
    if (r.ok) router.refresh();
  }

  return (
    <details className="panel">
      <summary>League settings</summary>
      <div className="grid" style={{ marginTop: 12 }}>
        {divisions.map((d) => (
          <label key={d.id} className="field">
            Division {d.id} name
            <input value={names[d.id] ?? ""} maxLength={40} onChange={(e) => setNames({ ...names, [d.id]: e.target.value })} />
          </label>
        ))}
        <label className="field">
          King of the Hill strikes per week, starting week 1
          <input value={sched} onChange={(e) => setSched(e.target.value)} />
        </label>
        <label className="row small muted">
          <input type="checkbox" checked={reserve} onChange={(e) => setReserve(e.target.checked)} />
          Count players sitting in IR as available for best ball
        </label>
        <div className="row">
          <button className="btn small" onClick={save} type="button">Save</button>
          <span className="small muted">{msg}</span>
        </div>
      </div>
    </details>
  );
}
