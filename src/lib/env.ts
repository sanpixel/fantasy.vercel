// What is configured, and the addresses that depend on it.
import { tokenKeyOk } from "./crypto";
import { yahooApp } from "./yahoo-app";

export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

export const redirectUri = () => `${appUrl()}/api/yahoo/callback`;

export const yahooReady = async () => !!(await yahooApp());
export const dbReady = () => !!process.env.DATABASE_URL;
export const chatReady = () => !!process.env.ANTHROPIC_API_KEY;

/** Everything sign-in needs: Yahoo app, database, token key. */
export const signInReady = async () => dbReady() && tokenKeyOk() && (await yahooReady());

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export async function checks(): Promise<Check[]> {
  const app = await yahooApp();
  return [
    {
      name: "Yahoo app",
      ok: !!app,
      detail: app
        ? `Client ID ${app.hint}, ${app.source === "env" ? "from environment variables" : `added on the setup page${app.updatedAt ? ` ${app.updatedAt.toISOString().slice(0, 10)}` : ""}`}.`
        : "Waiting for the client ID and secret. Add them with your setup link.",
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
