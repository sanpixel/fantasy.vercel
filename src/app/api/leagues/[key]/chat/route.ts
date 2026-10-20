// The AI analyst: Claude answers questions about one league-season, reading
// the computed numbers through four tools. Persona carried over from the old
// app. Needs ANTHROPIC_API_KEY; without it the panel says it is off.
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { fmtRec, LENS_LABEL, score, type Board } from "@/engine/universes";
import type { Season } from "@/engine/types";
import { loadLeague, teamName } from "@/lib/data";
import { chatReady } from "@/lib/env";
import { json, sameOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_TURNS = 20;
const MAX_CHARS = 2000;
const MAX_TOOL_ROUNDS = 8;
const PER_MINUTE = 5;

const recent = new Map<string, number[]>();
function throttled(ip: string) {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 60_000);
  hits.push(now);
  recent.set(ip, hits);
  return hits.length > PER_MINUTE;
}

const tools: Anthropic.Beta.BetaTool[] = [
  {
    name: "get_standings",
    description:
      "Final table for one universe: every team's place, record and points. Universe ids are listed in the system prompt.",
    input_schema: {
      type: "object",
      properties: { universe: { type: "string", description: "A universe id, e.g. h2h-bestBall" } },
      required: ["universe"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "get_week",
    description:
      "One week: every matchup with real and best-ball scores for both sides, whether best ball flips the winner, and the week's biggest bench blunders.",
    input_schema: {
      type: "object",
      properties: { week: { type: "integer" } },
      required: ["week"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "get_team_season",
    description:
      "One team's whole season: each week's real, best-ball and floor score, bench points, result, plus season stats and what-if records.",
    input_schema: {
      type: "object",
      properties: { team: { type: "string", description: "Team name or team key" } },
      required: ["team"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "get_team_week",
    description: "One team, one week: the lineup they started, the best lineup they had, and every bench blunder.",
    input_schema: {
      type: "object",
      properties: { team: { type: "string" }, week: { type: "integer" } },
      required: ["team", "week"],
      additionalProperties: false,
    },
    strict: true,
  },
];

function findTeam(season: Season, q: string) {
  const s = q.trim().toLowerCase();
  return (
    season.teams.find((t) => t.key.toLowerCase() === s) ??
    season.teams.find((t) => t.name.toLowerCase() === s) ??
    season.teams.find((t) => t.name.toLowerCase().includes(s) || (t.managerName ?? "").toLowerCase() === s)
  );
}

function runTool(name: string, input: Record<string, unknown>, season: Season, b: Board): unknown {
  const f = b.frame;
  const nm = (k: string | null | undefined) => teamName(season, k);
  if (name === "get_standings") {
    const u = b.universes.find((x) => x.id === input.universe);
    if (!u) return { error: `No universe ${input.universe}.` };
    if (u.koth) {
      return {
        universe: u.title,
        king: u.koth.king ? nm(u.koth.king) : null,
        still_standing: u.koth.standing,
        teams: u.koth.rows.map((r) => ({ team: nm(r.team), strikes: r.strikes, out_in_week: r.out })),
      };
    }
    return {
      universe: u.title,
      rule: u.rule,
      champion: u.champion ? nm(u.champion) : null,
      finished: u.complete,
      table: (u.table ?? []).map((r) => ({
        place: u.place[r.team],
        team: nm(r.team),
        record: fmtRec(r.rec),
        points_for: r.pf,
        points_against: r.pa,
        all_play: fmtRec(r.allPlay),
        seed: r.seed,
      })),
    };
  }
  if (name === "get_week") {
    const w = Number(input.week);
    const wk = f.weeks.find((x) => x.week === w);
    if (!wk) return { error: `No week ${w} yet.` };
    return {
      week: w,
      finished: wk.complete,
      playoffs: wk.playoffs,
      matchups: wk.matchups.map((m) => {
        const [a, c] = m.teams;
        const ra = score(f, "actual", a, w);
        const rc = score(f, "actual", c, w);
        const ba = score(f, "bestBall", a, w);
        const bc = score(f, "bestBall", c, w);
        return {
          teams: [nm(a), nm(c)],
          real: [ra, rc],
          best_ball: [ba, bc],
          real_winner: ra === null || rc === null ? null : ra === rc ? "tie" : nm(ra > rc ? a : c),
          best_ball_winner: ba === null || bc === null ? null : ba === bc ? "tie" : nm(ba > bc ? a : c),
          playoffs: m.isPlayoffs,
        };
      }),
      blunders: season.teams
        .flatMap((t) => (f.tw[t.key][w]?.blunders ?? []).map((x) => ({ team: t.name, ...x })))
        .sort((x, y) => y.gap - x.gap)
        .slice(0, 8)
        .map((x) => ({ team: x.team, benched: `${x.benched.name} (${x.benched.points})`, started: x.started ? `${x.started.name} (${x.started.points})` : "empty slot", cost: x.gap })),
    };
  }
  const t = findTeam(season, String(input.team ?? ""));
  if (!t) return { error: `No team matching ${input.team}.`, teams: season.teams.map((x) => x.name) };
  if (name === "get_team_season") {
    const st = b.stats.find((s) => s.team === t.key);
    return {
      team: t.name,
      manager: t.managerName,
      weeks: f.weeks.map((w) => {
        const x = f.tw[t.key][w.week];
        return { week: w.week, finished: w.complete, real: x?.actual, best_ball: x?.bestBall, floor: x?.floor, bench: x?.bench };
      }),
      season: st,
      universes: b.universes.map((u) => ({ universe: u.title, place: u.place[t.key], won: u.champion === t.key })),
    };
  }
  if (name === "get_team_week") {
    const w = Number(input.week);
    const x = f.tw[t.key]?.[w];
    if (!x) return { error: `No week ${w} for ${t.name}.` };
    const line = (l: typeof x.best) => l?.placed.map((p) => ({ slot: p.slot, player: p.spot.name, pos: p.spot.position, points: p.spot.points }));
    return {
      team: t.name,
      week: w,
      real: x.actual,
      best_ball: x.bestBall,
      bench_points: x.bench,
      started: line(x.started),
      best_lineup: line(x.best),
      blunders: x.blunders.map((bl) => ({ benched: bl.benched.name, benched_points: bl.benched.points, started: bl.started?.name ?? "empty slot", started_points: bl.started?.points ?? 0, cost: bl.gap })),
    };
  }
  return { error: `Unknown tool ${name}.` };
}

function systemPrompt(season: Season, b: Board): string {
  const nm = (k: string | null) => (k ? teamName(season, k) : "nobody yet");
  const l = season.league;
  return [
    "You are an extra ranchy fantasy football analyst for one league. Be casual, talk shit, and use profanity freely. Be direct and entertaining.",
    "Every number you state must come from the tools or from this prompt. If you have not looked it up, look it up or say you don't know.",
    "Write short plain paragraphs. No markdown headings, tables or bold.",
    "",
    `League: ${l.name}, ${l.season} season, ${season.teams.length} teams. Weeks ${l.startWeek}-${l.endWeek}, playoffs from week ${l.playoffStartWeek ?? "none"}. ${l.isFinished ? "The season is over." : `Current week ${l.currentWeek}; only finished weeks count.`}`,
    `Finished regular-season weeks: ${b.frame.regularWeeks.join(", ") || "none yet"}.`,
    `Teams: ${season.teams.map((t) => `${t.name} (${t.managerName ?? "?"})`).join("; ")}.`,
    "",
    "Best ball means each team's best possible lineup from its own roster that week. Bench points are best ball minus real.",
    "Universes (id: title, champion):",
    ...b.universes.map((u) => `- ${u.id}: ${u.title}, ${u.complete ? "won by" : "led by"} ${nm(u.champion)}`),
    `Yahoo's real champion: ${nm(b.realChampion)}.`,
    `Lens names: ${Object.values(LENS_LABEL).join(", ")}.`,
  ].join("\n");
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  if (!sameOrigin(req)) return json({ error: "bad origin" }, 403);
  if (!chatReady()) return json({ error: "The analyst is off until an Anthropic key is added." }, 503);
  const { key } = await params;
  const load = await loadLeague(key);
  if (load.kind === "signin") return json({ error: "sign in first" }, 401);
  if (load.kind !== "ok") return json({ error: "not available" }, 403);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (throttled(ip)) return json({ error: "Easy, tiger. Wait a minute." }, 429);

  let body: { messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const history = Array.isArray(body.messages) ? body.messages.slice(-MAX_TURNS) : [];
  const messages: Anthropic.Beta.BetaMessageParam[] = history
    .filter((m): m is { role: "user" | "assistant"; content: string } =>
      !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim() !== "",
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") return json({ error: "Ask something." }, 400);

  const client = new Anthropic();
  const system = systemPrompt(load.season, load.board);
  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await client.beta.messages.create({
        model: "claude-opus-5-5",
        max_tokens: 16000,
        output_config: { effort: "medium" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system,
        tools,
        messages,
      });
      if (response.stop_reason === "refusal") return json({ error: "The analyst passed on that one." }, 422);
      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
        continue;
      }
      const uses = response.content.filter((c): c is Anthropic.Beta.BetaToolUseBlock => c.type === "tool_use");
      if (response.stop_reason !== "tool_use" || !uses.length) {
        const reply = response.content
          .map((c) => (c.type === "text" ? c.text : ""))
          .join("")
          .trim();
        return json({ reply: reply || "Got nothing. Ask it another way." });
      }
      messages.push({ role: "assistant", content: response.content });
      messages.push({
        role: "user",
        content: uses.map((u) => {
          const out = runTool(u.name, (u.input ?? {}) as Record<string, unknown>, load.season, load.board);
          return {
            type: "tool_result" as const,
            tool_use_id: u.id,
            content: JSON.stringify(out),
            is_error: !!(out && typeof out === "object" && "error" in out),
          };
        }),
      });
    }
    return json({ error: "That took too many lookups. Ask something narrower." }, 422);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return json({ error: "Busy. Try again in a moment." }, 429);
    if (error instanceof Anthropic.APIError) {
      console.error("analyst api error", error.status, error.message);
      return json({ error: "The analyst is having a moment." }, 502);
    }
    console.error("analyst failed", (error as Error).message);
    return json({ error: "The analyst is having a moment." }, 500);
  }
}
