"use client";
// Guess the tier. Three-letter initials, answers checked on the server.
import { useCallback, useEffect, useState } from "react";

type Player = { id: number; name: string; position: string; price: number; tiers: number };
type Row = { initials: string; correct: number; total: number; best_streak: number; accuracy: number };

function readInitials() {
  try {
    return localStorage.getItem("tier-initials") ?? "";
  } catch {
    return "";
  }
}

export function TierGame() {
  const [initials, setInitials] = useState("");
  const [locked, setLocked] = useState(false);
  const [player, setPlayer] = useState<Player | null>(null);
  const [last, setLast] = useState<{ ok: boolean; name: string; tier: number; guess: number } | null>(null);
  const [stats, setStats] = useState<{ correct: number; total: number; streak: number; best_streak: number } | null>(null);
  const [board, setBoard] = useState<Row[]>([]);
  const [err, setErr] = useState("");

  const loadBoard = useCallback(() => {
    fetch("/api/tier/board")
      .then((r) => r.json())
      .then((j) => setBoard(j.rows ?? []))
      .catch(() => {});
  }, []);
  const next = useCallback(() => {
    fetch("/api/tier/next")
      .then((r) => r.json())
      .then((j) => (j.error ? setErr(j.error) : setPlayer(j)))
      .catch(() => setErr("Could not load a player."));
  }, []);

  useEffect(() => {
    // Browser storage only exists after mount; read it in a callback.
    Promise.resolve().then(() => {
      const saved = readInitials();
      if (/^[A-Z]{3}$/.test(saved)) {
        setInitials(saved);
        setLocked(true);
      }
    });
    loadBoard();
    next();
  }, [loadBoard, next]);

  async function guess(tier: number) {
    if (!player) return;
    const r = await fetch("/api/tier/guess", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: player.id, tier, initials }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErr(j.error ?? "Could not check that.");
      return;
    }
    setLast({ ok: j.correct, name: player.name, tier: j.tier, guess: tier });
    setStats(j.stats);
    loadBoard();
    next();
  }

  if (!locked) {
    return (
      <div className="panel notch tier-card">
        <h3>Enter your initials</h3>
        <p className="muted small">Three letters, arcade style. That is your name on the board.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^[A-Z]{3}$/.test(initials)) return;
            try {
              localStorage.setItem("tier-initials", initials);
            } catch {}
            setLocked(true);
          }}
        >
          <input
            className="initials"
            value={initials}
            maxLength={3}
            autoFocus
            onChange={(e) => setInitials(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
          />
          <div style={{ marginTop: 16 }}>
            <button className="btn" disabled={initials.length !== 3}>Play</button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="grid two">
      <div className="panel notch tier-card">
        <div className="row" style={{ justifyContent: "center" }}>
          <span className="chip on">{initials}</span>
          {stats ? (
            <span className="chip">
              {stats.correct}/{stats.total} · streak {stats.streak}
            </span>
          ) : null}
          <button className="chip" onClick={() => setLocked(false)}>Change</button>
        </div>
        {err ? <p className="coral">{err}</p> : null}
        {player ? (
          <>
            <p className="muted" style={{ marginTop: 24 }}>
              {player.position} · ${player.price}
            </p>
            <div className="player">{player.name}</div>
            <p className="muted small">What tier?</p>
            <div className="tier-buttons">
              {Array.from({ length: player.tiers }, (_, i) => i + 1).map((t) => (
                <button key={t} onClick={() => guess(t)}>
                  {t}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="muted">Loading…</p>
        )}
        {last ? (
          <p className={last.ok ? "lime" : "coral"} style={{ marginTop: 20 }}>
            {last.ok ? "Right." : "Nope."} {last.name} is tier {last.tier}
            {last.ok ? "" : `, not ${last.guess}`}.
          </p>
        ) : null}
      </div>
      <div>
        <h3>Leaderboard</h3>
        <p className="muted small">Five guesses to qualify.</p>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th className="l">Name</th>
                <th>Right</th>
                <th>Accuracy</th>
                <th>Best streak</th>
              </tr>
            </thead>
            <tbody>
              {board.map((r, i) => (
                <tr key={r.initials} className={r.initials === initials ? "me" : ""}>
                  <td>{i + 1}</td>
                  <td className="l team">{r.initials}</td>
                  <td>
                    {r.correct}/{r.total}
                  </td>
                  <td>{r.accuracy}%</td>
                  <td>{r.best_streak}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
