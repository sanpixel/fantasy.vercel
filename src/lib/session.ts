// Sessions: a random id in an HttpOnly cookie, its hash in the database.
import { cookies } from "next/headers";
import { randomId, sha256 } from "./crypto";
import { db, sql } from "./db";

const COOKIE = "fx_session";
const DAYS = 60;

export interface Viewer {
  guid: string;
  nickname: string | null;
  imageUrl: string | null;
}

export async function currentViewer(): Promise<Viewer | null> {
  const id = (await cookies()).get(COOKIE)?.value;
  const s = db();
  if (!id || !s) return null;
  try {
    const rows = await s<{ guid: string; nickname: string | null; image_url: string | null }[]>`
      update fantasy.users u set last_seen = now()
      from fantasy.sessions x
      where x.id_hash = ${sha256(id)} and x.expires_at > now() and u.guid = x.guid
      returning u.guid, u.nickname, u.image_url`;
    const r = rows[0];
    return r ? { guid: r.guid, nickname: r.nickname, imageUrl: r.image_url } : null;
  } catch {
    return null;
  }
}

export async function startSession(guid: string) {
  const id = randomId();
  const expires = new Date(Date.now() + DAYS * 86400_000);
  await sql()`insert into fantasy.sessions (id_hash, guid, expires_at) values (${sha256(id)}, ${guid}, ${expires})`;
  (await cookies()).set(COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function endSession(disconnect: boolean) {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  const s = db();
  if (id && s) {
    const [row] = await s<{ guid: string }[]>`
      delete from fantasy.sessions where id_hash = ${sha256(id)} returning guid`;
    if (row && disconnect) {
      await s`delete from fantasy.yahoo_tokens where guid = ${row.guid}`;
      await s`delete from fantasy.sessions where guid = ${row.guid}`;
    }
  }
  jar.delete(COOKIE);
}
