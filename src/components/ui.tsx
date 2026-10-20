// Small display helpers shared by the pages.
import type { Rec } from "@/engine/universes";
import { fmtRec } from "@/engine/universes";

export const pts = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toFixed(2));
export const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${Math.round(n * 100)}%`);
export const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;

export function Kicker({ children, tone }: { children: React.ReactNode; tone?: "ice" | "coral" | "gold" | "ghost" }) {
  return (
    <span className={`kicker ${tone ?? ""}`}>
      <span>{children}</span>
    </span>
  );
}

export function Place({ n, of }: { n: number | undefined; of: number }) {
  if (!n) return <span className="dim">—</span>;
  const cls = n === 1 ? "p1" : n === 2 ? "p2" : n === 3 ? "p3" : n === of ? "last" : "";
  return <span className={`place ${cls}`}>{n}</span>;
}

export const Record = ({ r }: { r: Rec }) => <span>{fmtRec(r)}</span>;
