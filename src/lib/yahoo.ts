// Yahoo OAuth 2 and the Fantasy API.
//
// Sign-in is the authorization-code flow. Tokens are stored per Yahoo user,
// encrypted, and refreshed five minutes before they expire, so a sync or the
// daily refresh can run without anyone watching.
import { open, seal } from "./crypto";
import { sql } from "./db";
import { redirectUri } from "./env";

const AUTH_URL = "https://api.login.yahoo.com/oauth2/request_auth";
const TOKEN_URL = "https://api.login.yahoo.com/oauth2/get_token";
export const API = "https://fantasysports.yahooapis.com/fantasy/v2";

export class YahooError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function authorizeUrl(state: string): string {
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_id", process.env.YAHOO_CLIENT_ID!);
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("response_type", "code");
  u.searchParams.set("language", "en-us");
  u.searchParams.set("state", state);
  if (process.env.YAHOO_SCOPE) u.searchParams.set("scope", process.env.YAHOO_SCOPE);
  return u.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  xoauth_yahoo_guid?: string;
}

async function tokenRequest(form: Record<string, string>): Promise<TokenResponse> {
  const basic = Buffer.from(`${process.env.YAHOO_CLIENT_ID}:${process.env.YAHOO_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ redirect_uri: redirectUri(), ...form }),
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new YahooError(`Yahoo refused the token request: ${body.error_description ?? body.error ?? res.status}`, res.status);
  }
  return body as TokenResponse;
}

export const exchangeCode = (code: string) => tokenRequest({ grant_type: "authorization_code", code });

export async function storeTokens(guid: string, t: TokenResponse) {
  const expires = new Date(Date.now() + (t.expires_in ?? 3600) * 1000);
  await sql()`
    insert into fantasy.yahoo_tokens (guid, access_enc, refresh_enc, expires_at, updated_at)
    values (${guid}, ${seal(t.access_token)}, ${seal(t.refresh_token)}, ${expires}, now())
    on conflict (guid) do update set
      access_enc = excluded.access_enc, refresh_enc = excluded.refresh_enc,
      expires_at = excluded.expires_at, updated_at = now()`;
}

/** A valid access token for this Yahoo user, refreshed if close to expiry. */
export async function accessToken(guid: string, force = false): Promise<string> {
  const [row] = await sql()<{ access_enc: string; refresh_enc: string; expires_at: Date }[]>`
    select access_enc, refresh_enc, expires_at from fantasy.yahoo_tokens where guid = ${guid}`;
  if (!row) throw new YahooError("Not connected to Yahoo.", 401);
  if (!force && row.expires_at.getTime() - Date.now() > 5 * 60_000) return open(row.access_enc);
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: open(row.refresh_enc) });
  await storeTokens(guid, { ...t, refresh_token: t.refresh_token ?? open(row.refresh_enc) });
  return t.access_token;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET a Fantasy API path as this user. XML text back. */
export async function yget(guid: string, path: string): Promise<string> {
  let token = await accessToken(guid);
  let refreshed = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/xml" },
      cache: "no-store",
    });
    if (res.ok) return res.text();
    if (res.status === 401 && !refreshed) {
      token = await accessToken(guid, true);
      refreshed = true;
      continue;
    }
    // 999 is Yahoo's rate limit.
    if ([429, 999, 500, 502, 503, 504].includes(res.status) && attempt < 3) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    const text = await res.text().catch(() => "");
    const why = /<description>([^<]+)<\/description>/.exec(text)?.[1] ?? res.statusText;
    throw new YahooError(`Yahoo ${res.status} on ${path.split(";")[0]}: ${why}`, res.status);
  }
  throw new YahooError(`Yahoo kept refusing ${path.split(";")[0]}`, 429);
}
