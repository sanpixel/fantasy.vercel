// The Yahoo app's client ID and secret. Environment variables win if set;
// otherwise they come from the setup page, sealed in fantasy.app_secrets.
import { timingSafeEqual } from "node:crypto";
import { open, seal, sha256 } from "./crypto";
import { db, sql } from "./db";

export interface YahooApp {
  id: string;
  secret: string;
  source: "env" | "setup";
  hint: string;
  updatedAt: Date | null;
}

const NAME = "yahoo_app";
let cache: { at: number; v: YahooApp | null } | null = null;

const hintOf = (id: string) => `…${id.slice(-4)}`;

export async function yahooApp(): Promise<YahooApp | null> {
  const id = process.env.YAHOO_CLIENT_ID;
  const secret = process.env.YAHOO_CLIENT_SECRET;
  if (id && secret) return { id, secret, source: "env", hint: hintOf(id), updatedAt: null };
  if (cache && Date.now() - cache.at < 60_000) return cache.v;
  const s = db();
  if (!s) return null;
  let v: YahooApp | null = null;
  try {
    const [row] = await s<{ value_enc: string; updated_at: Date }[]>`
      select value_enc, updated_at from fantasy.app_secrets where name = ${NAME}`;
    if (row) {
      const parsed = JSON.parse(open(row.value_enc)) as { id: string; secret: string };
      v = { ...parsed, source: "setup", hint: hintOf(parsed.id), updatedAt: row.updated_at };
    }
  } catch (e) {
    console.error("could not read the Yahoo app from the database", (e as Error).message);
  }
  cache = { at: Date.now(), v };
  return v;
}

export async function saveYahooApp(id: string, secret: string) {
  await sql()`
    insert into fantasy.app_secrets (name, value_enc, hint, updated_at)
    values (${NAME}, ${seal(JSON.stringify({ id, secret }))}, ${hintOf(id)}, now())
    on conflict (name) do update set value_enc = excluded.value_enc, hint = excluded.hint, updated_at = now()`;
  cache = null;
}

/** The setup code from the link, checked against the stored hash. */
export function setupCodeOk(code: string): boolean {
  const want = process.env.SETUP_CODE_HASH;
  if (!want || !code) return false;
  const a = Buffer.from(sha256(code), "hex");
  const b = Buffer.from(want, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
