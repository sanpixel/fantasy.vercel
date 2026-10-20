// What is configured, and the addresses that depend on it.
import { tokenKeyOk } from "./crypto";

export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

export const redirectUri = () => `${appUrl()}/api/yahoo/callback`;

export const yahooReady = () => !!(process.env.YAHOO_CLIENT_ID && process.env.YAHOO_CLIENT_SECRET);
export const dbReady = () => !!process.env.DATABASE_URL;
export const chatReady = () => !!process.env.ANTHROPIC_API_KEY;

/** Everything sign-in needs: Yahoo app, database, token key. */
export const signInReady = () => yahooReady() && dbReady() && tokenKeyOk();

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export function checks(): Check[] {
  return [
    {
      name: "Yahoo app",
      ok: yahooReady(),
      detail: yahooReady()
        ? "YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET are set."
        : "Waiting for YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET.",
    },
    { name: "Database", ok: dbReady(), detail: dbReady() ? "DATABASE_URL is set." : "DATABASE_URL is missing." },
    {
      name: "Token key",
      ok: tokenKeyOk(),
      detail: tokenKeyOk() ? "TOKEN_KEY is set and 32 bytes." : "TOKEN_KEY is missing or not 32 bytes.",
    },
    {
      name: "Daily refresh",
      ok: !!process.env.CRON_SECRET,
      detail: process.env.CRON_SECRET ? "CRON_SECRET is set." : "CRON_SECRET is missing.",
    },
    {
      name: "AI analyst",
      ok: chatReady(),
      detail: chatReady() ? "ANTHROPIC_API_KEY is set." : "Optional. Waiting for ANTHROPIC_API_KEY.",
    },
  ];
}
