import { pct, pts, signed } from "@/components/ui";
import { loadCareers, loadLeague } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function AllTime({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const load = await loadLeague(key);
  if (load.kind !== "ok") return null;
  const { careers, boards } = await loadCareers(load.chain);
  const seasons = boards.map((b) => b.frame.season.league.season);

  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>All-time</h2>
          <p className="muted small">
            {seasons.length} season{seasons.length === 1 ? "" : "s"} ({seasons.join(", ")}), joined by manager. Seasons you were not in, or that have not synced yet, are left out.
          </p>
        </div>
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th className="l">Manager</th>
              <th>Seasons</th>
              <th>Real titles</th>
              <th>Best-ball titles</th>
              <th>Universes won</th>
              <th>Real pts</th>
              <th>Best ball</th>
              <th>Bench</th>
              <th>Lineup IQ</th>
              <th>Luck</th>
              <th className="l">Teams</th>
            </tr>
          </thead>
          <tbody>
            {careers.map((c) => (
              <tr key={c.manager}>
                <td className="l team">{c.name}</td>
                <td>{c.seasons.length}</td>
                <td className="gold">{c.realTitles.length ? `${c.realTitles.length} (${c.realTitles.join(", ")})` : ""}</td>
                <td className="ice">{c.bestBallTitles.length ? `${c.bestBallTitles.length} (${c.bestBallTitles.join(", ")})` : ""}</td>
                <td>{c.universesWon || ""}</td>
                <td className="lime">{pts(c.actual)}</td>
                <td className="ice">{pts(c.bestBall)}</td>
                <td className="coral">{pts(c.bench)}</td>
                <td>{pct(c.iq)}</td>
                <td className={c.luck >= 0 ? "lime" : "coral"}>{signed(c.luck)}</td>
                <td className="l dim small">{Object.entries(c.teams).map(([y, n]) => `${y}: ${n}`).join(" · ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
