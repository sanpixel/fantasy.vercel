import { TierGame } from "@/components/TierGame";
import { Kicker } from "@/components/ui";

export const metadata = { title: "Tier game" };

export default function Tiers() {
  return (
    <main className="wrap">
      <section className="hero" style={{ paddingTop: 40 }}>
        <Kicker tone="ice">Study hall</Kicker>
        <h1 style={{ marginTop: 14, fontSize: "clamp(40px,8vw,88px)" }}>Name that tier</h1>
        <p className="lede">A player, his position and his 2025 auction price. You call the tier.</p>
      </section>
      <TierGame />
    </main>
  );
}
