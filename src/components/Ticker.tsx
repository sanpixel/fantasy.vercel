import type { Board } from "@/engine/universes";

/** The season's worst bench blunders, as a sports crawl. */
export function Ticker({ board }: { board: Board }) {
  const f = board.frame;
  const name = (k: string) => f.season.teams.find((t) => t.key === k)?.name ?? k;
  const items = f.weeks
    .filter((w) => w.complete)
    .flatMap((w) =>
      f.season.teams.flatMap((t) =>
        (f.tw[t.key][w.week]?.blunders ?? []).map((b) => ({ week: w.week, team: t.key, ...b })),
      ),
    )
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 16);
  if (!items.length) return null;
  const run = [...items, ...items];
  return (
    <div className="ticker" aria-label="Biggest bench blunders">
      <div className="tag">Bench blunders</div>
      <div className="run" style={{ ["--dur" as string]: `${items.length * 6}s` }}>
        {run.map((b, i) => (
          <span key={i} aria-hidden={i >= items.length}>
            WK {b.week} · {name(b.team)} sat <em>{b.benched.name} {b.benched.points.toFixed(1)}</em> for{" "}
            {b.started ? `${b.started.name} ${b.started.points.toFixed(1)}` : "an empty slot"} <b>−{b.gap.toFixed(1)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
