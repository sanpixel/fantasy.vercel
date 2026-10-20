import Link from "next/link";

export default function NotFound() {
  return (
    <main className="wrap section">
      <h1 style={{ fontSize: "clamp(48px,10vw,120px)" }}>
        Fumble<span className="coral">.</span>
      </h1>
      <p className="lede">Nothing at this address.</p>
      <Link href="/" className="btn ghost">Back to the start</Link>
    </main>
  );
}
