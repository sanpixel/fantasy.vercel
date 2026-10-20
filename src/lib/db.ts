// The app's only way into Postgres: the Supabase pooler in transaction mode,
// server-side. Every table lives in the fantasy schema and is named in full.
import postgres from "postgres";

let client: postgres.Sql | null = null;

export function db(): postgres.Sql | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  client ??= postgres(url, { prepare: false, max: 4, idle_timeout: 20, connect_timeout: 10 });
  return client;
}

export function sql(): postgres.Sql {
  const s = db();
  if (!s) throw new Error("DATABASE_URL is not set");
  return s;
}
