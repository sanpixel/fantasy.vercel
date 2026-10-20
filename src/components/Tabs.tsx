"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Tabs({ base, items }: { base: string; items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="tabs">
      {items.map((i) => {
        const href = `${base}${i.href}`;
        const on = i.href === "" ? path === base : path.startsWith(`${base}${i.href.split("/").slice(0, 2).join("/")}`);
        return (
          <Link key={i.href} href={href} className={on ? "on" : ""}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
