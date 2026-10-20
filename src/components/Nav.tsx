import Link from "next/link";
import { currentViewer } from "@/lib/session";

export async function Nav() {
  const viewer = await currentViewer();
  return (
    <header className="top">
      <div className="wrap">
        <Link href="/" className="brand" aria-label="Fantasy home">
          Fan<b>/</b>tasy<i>.</i>
        </Link>
        <nav>
          <Link href="/l/sample-2026" className="hide-sm">Sample</Link>
          <Link href="/tiers">Tiers</Link>
          {viewer ? (
            <Link href="/leagues" className="row" style={{ gap: 8 }}>
              {viewer.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="avatar" src={viewer.imageUrl} alt="" />
              ) : null}
              <span>{viewer.nickname ?? "My leagues"}</span>
            </Link>
          ) : (
            <a href="/api/yahoo/login" className="chip lime on">Connect Yahoo</a>
          )}
        </nav>
      </div>
    </header>
  );
}
