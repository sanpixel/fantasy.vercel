# Fantasy — requirements

The new home of everything `sanpixel/fantasy.ai` did, rebuilt from scratch and done
correctly. The heart of it is the same idea: take a Yahoo league's real scoring,
work out the best lineup every team could have set every week, and then replay the
season in every alternate universe to see who would have won.

This document is the contract for the build in this repo. Section 2 is the recon
of the old app. Everything after it is what the new app must do.

---

## 1. Decisions already made

| Question | Answer |
|---|---|
| Port or rebuild | Rebuild. New code, same features, done correctly. |
| Who uses it | Anyone. Each visitor signs in with their own Yahoo account and sees every league they are in. |
| Which seasons | Every season Yahoo still has for the visitor: the current one and all past ones. |
| What gets re-imagined | Every score, every week, the whole season, every past season. See section 6. |
| Yahoo key | Not issued yet. The app ships without it and starts working the moment it is added. See section 13. |
| Hosting | Vercel, from this repo's `main`. |
| Database | The clocknumbers Supabase project, in its own `fantasy` schema, reached server-side only. |

---

## 2. What the old app was

Express backend plus a Create React App frontend, deployed to Google Cloud Run at
`fantasy.clocknumbers.com`. Last commit 2025-12-03. One league was hard-coded
throughout: `461.l.888400`, "Drunktown Football League", 16 teams, 2025 season.

### 2.1 Features it had

| Feature | Where | What it did |
|---|---|---|
| Best Ball | `/best-ball`, `backend/services/optimal-lineup-calculator.js` | Optimal lineup per team per week, "points left on bench", optimal head-to-head results, optimal standings by division. |
| Weekly matchup cards | `WeeklyMatchupCard.js` | Actual vs optimal score for both sides, a "Different Winner!" badge, actual and optimal lineups side by side. |
| Season summary | `BestBallAnalysis.js` | Per week: points missed and number of matchups whose winner flips. |
| Optimal standings | `OptimalStandings.js` | Record, win %, optimal points, points missed, per-division "champion", best and worst lineup setter. |
| King of the Hill | `KingOfTheHill.js` | Survivor game on actual scores. Lowest N teams each week take a strike, three strikes and out. |
| League teams | `YahooTeams.js` | Yahoo standings by division, division records, editable division names. |
| AI analyst | `AMASection.js`, `ChatWidget.js`, `/api/best-ball/:league/chat` | OpenAI `gpt-5-mini` with two tools (week data, team-week data) and a trash-talking persona. |
| Exports | `AMASection.js` | JSON dump and a CSV of week, team, actual, optimal, bench points. |
| Share images | html2canvas | Copy a card or the standings to the clipboard as a PNG. |
| Tier game | `TierGame.js`, `data/players.csv` | Guess a player's draft tier from name, position and auction price. Three-letter arcade names, leaderboard. |
| Sign-in | `Auth.js` | Google via Supabase, separate from the Yahoo connection. |

`TailwindGame`, `MantineGame` and `StyledComponentsGame` were styling experiments of
the tier game. `YahooDebug`, `ApiCheck` and `DebugPage` were debugging screens.

### 2.2 How it deciphered best ball

The pipeline, in order:

1. **League info.** `GET /league/{league_key}` for `current_week`.
2. **Scoreboards.** `GET /league/{league_key}/scoreboard;week=N` for weeks 1 to
   `current_week`. Each matchup gives two teams and their `team_points.total`.
3. **Rosters with that week's points.** For every team and every week,
   `GET /team/{team_key}/roster;week=N/players/stats;type=week;week=N`. Each player
   carries `selected_position` (where the manager put him), `eligible_positions`,
   and `player_points.total` (fantasy points under the league's own scoring).
4. **Optimal lineup.** Group players by eligible position, fill each fixed slot with
   the top scorers, then fill FLEX with the best leftover RB, WR or TE.
5. **Points left on bench.** Optimal score minus the sum of the starters.
6. **Optimal matchups.** For each real matchup, compare the two optimal scores.
7. **Optimal standings.** Count optimal wins, losses and ties. Sort by win %, then
   optimal points.

Steps 3 and 4 are the trick. Yahoo returns the roster *as of the requested week*
only when `roster;week=N` is in the path. Without it, Yahoo returns today's roster
and lineup with the old week's points attached. The captured responses in
`.kiro/debug/roster` show exactly that failure: week-1 points on a week-5 lineup.
The old debug scripts `check-x-week1.js` and `check-x-week2.js` were chasing it.

### 2.3 What it got wrong

Each of these is a requirement in the new app. Section 5 says how.

1. **Greedy lineup is not always optimal.** Filling fixed slots first and FLEX
   last is correct for plain QB/RB/WR/TE/FLEX, but it breaks with superflex,
   multiple flex types or IDP, because a player can be spent on the wrong slot.
2. **Lineup rules guessed from the starters.** Slot counts were inferred by
   counting the positions the manager actually started. An empty slot shrank the
   lineup. An `IR` player counted as a "starter" and created an `IR` slot. The
   league's real rules are in `/league/{key}/settings` under `roster_positions`.
3. **The game in progress counted as final.** Best ball analysed weeks 1 to
   `current_week`, so a half-played week moved the standings.
4. **Playoff weeks counted as regular season.** Weeks after `playoff_start_week`
   went into the optimal record.
5. **Actual score was re-added from players** instead of read from Yahoo, so it
   drifted from Yahoo whenever a starter sat in an odd slot.
6. **Ties went to team 2.** The matchup card used `a > b ? a : b`.
7. **Fallback-to-actual hid failures.** `optimal_score || points` silently showed
   the actual score as "optimal" whenever a roster failed to load, and treated a
   genuine optimal score of 0 as missing.
8. **Points parser guessed.** When `player_points` was missing it tried stat ids
   0, 12, 1 and 60, then searched any key containing "point". Stat 12 is a real
   yardage stat, not points.
9. **One league, one season, one session.** League key and all 16 team keys were
   hard-coded. Tokens were tied to a browser session, so nothing could refresh
   without someone logged in.
10. **Cache always cleared.** `debugMode = true` wiped the computed cache on every
    run, and the cached view hard-coded 16 teams.
11. **OAuth `state` was never checked.** The callback skipped CSRF validation.
12. **Session secret had a default** and the AI routes returned stack traces and
    full data dumps to the browser.
13. **King of the Hill ties** at the strike line were broken by array order.

---

## 3. Users and access

- **Anyone with a Yahoo account** can sign in. Yahoo is the only sign-in.
- After sign-in the app reads every NFL league the person is in, every season.
- A league's pages are visible only to people who are members of it, checked
  against their own Yahoo league list.
- Data fetched with one member's token is stored per league, so the next member
  sees it without refetching.
- Signing out deletes the session. Disconnecting also deletes the stored tokens.
- A **sample league** with made-up teams and scores is open to everyone at
  `/l/sample`, so the app can be seen working before any Yahoo key exists. It is
  labelled as sample data on every page.

---

## 4. Yahoo data

Base URL `https://fantasysports.yahooapis.com/fantasy/v2`, XML responses, Bearer
token. Responses are parsed as XML because Yahoo's JSON format nests lists under
numeric keys.

| Purpose | Endpoint | Fields used |
|---|---|---|
| Who am I, which leagues | `/users;use_login=1/games;game_codes=nfl/leagues` | user `guid`; per game `game_key`, `season`; per league `league_key`, `name`, `num_teams`, `logo_url`, `season`, `renew`, `renewed`, `is_finished` |
| League rules | `/league/{key}/settings` | `current_week`, `start_week`, `end_week`, `is_finished`, `scoring_type`, `uses_playoff`, `playoff_start_week`, `num_playoff_teams`, `uses_playoff_reseeding`, `roster_positions`, `divisions` |
| Teams and real standings | `/league/{key}/standings` | `team_key`, `name`, logo, `division_id`, managers (`guid`, `nickname`), `rank`, `playoff_seed`, `outcome_totals`, `points_for`, `points_against` |
| Matchups | `/league/{key}/scoreboard;week=N` | per matchup `status`, `is_playoffs`, `is_consolation`, `is_tied`, `winner_team_key`, `week_start`; per team `team_points.total`, `team_projected_points.total` |
| Weekly rosters with points | `/team/{team_key}/roster;week=N/players/stats;type=week;week=N` | per player `player_key`, `name.full`, `editorial_team_abbr`, `display_position`, `eligible_positions`, `selected_position.position`, `player_points.total` |

Rules:

- **Points come from `player_points.total` only.** If it is absent the player
  scores 0 and the roster is flagged, never guessed from stat ids.
- **Seasons link through `renew` and `renewed`.** `renew` holds the previous
  season as `{game_id}_{league_id}`, so the previous league key is
  `{game_id}.l.{league_id}`. That chain is how "all past seasons" is assembled.
- **Managers carry across seasons by Yahoo `guid`.** Team keys change every season.
  When the guid is hidden, fall back to nickname.
- **Rate limits.** At most 4 requests in flight per sync. On 429 or 999, back off
  and resume. On 401, refresh the token once and retry.

### 4.1 When data is final

| Week state | Rule |
|---|---|
| Before `start_week` or after the season | Not fetched. |
| Week `N` < `current_week` - 1, or league `is_finished` | Final. Stored once, never refetched. |
| Week `current_week` - 1 | Refetched daily, because Yahoo applies stat corrections during the following week. |
| Week `current_week` | Live. Refetched when anyone opens the league and it is older than 10 minutes, and daily by cron. Shown, but never counted in records. |

---

## 5. The best-ball engine

### 5.1 Lineup slots

Slots come from `roster_positions`, never from the starters. Every position is a
starting slot except `BN`, `IR`, `IR+` and `NA`. A slot with count 2 is two slots.

### 5.2 Who can fill a slot

A player can fill a slot when the slot's position is in his `eligible_positions`.
Yahoo already lists flex positions there (`RB` players list `RB` and `W/R/T`). As a
safety net, a combined slot such as `W/R/T` or `Q/W/R/T` also accepts any player
whose eligible positions include one of the letters it stands for
(Q = QB, W = WR, R = RB, T = TE).

### 5.3 Who is in the pool

Every player on that week's roster except those Yahoo placed in `IR`, `IR+` or
`NA`, because Yahoo would not have let the manager start them. This is a league
setting the viewer can flip.

### 5.4 The optimal lineup

The set of players that can be placed into slots forms a transversal matroid, so a
greedy pass is provably optimal:

1. Sort the pool by points, highest first. Break ties by player key so results
   never change between runs.
2. Take each player in turn. Keep him if every kept player can still be given a
   distinct slot, checked with an augmenting-path bipartite match.
3. Stop adding players once their points are 0 or less. Yahoo allows an empty slot,
   which scores 0, so starting a negative score is never optimal.

The match from step 2 assigns each kept player to a slot. For display, a player is
offered his own position's slot before any flex slot.

### 5.5 Other lineups computed per team per week

| Lineup | Definition |
|---|---|
| Actual | Yahoo's `team_points.total`. When a team has no matchup that week, the sum of its starters. |
| Starters sum | Points of everyone not on `BN`, `IR`, `IR+`, `NA`. Compared with Yahoo's actual as a data check. |
| Optimal | Section 5.4. |
| Floor | The worst full lineup: the same greedy, lowest points first, every slot filled. |
| Projected | Yahoo's `team_projected_points.total` for the lineup the manager set. |

Derived per team per week:

- **Bench points**: optimal minus actual. Never negative, because the actual
  lineup is one of the lineups considered.
- **Lineup IQ**: actual as a percentage of optimal.
- **Blunders**: each benched player who would have started, paired with the
  starter he should have replaced, and the points between them.

### 5.6 Rounding and ties

All points are stored to two decimals and compared at two decimals. Equal is a
tie, never a coin flip.

---

## 6. Re-imagined winners

A **universe** is a scoring lens applied to a schedule format. The app computes
every one of them for every season.

### 6.1 Lenses

| Lens | Each team's weekly score is |
|---|---|
| Actual | What Yahoo recorded. |
| Best ball | Its optimal lineup. |
| Projected | What Yahoo projected for the lineup it set. Yahoo only projects teams with a matchup, so this lens decides its champion on the regular season alone. |
| Floor | Its worst possible lineup. |

### 6.2 Formats

| Format | How a week is scored |
|---|---|
| Head to head | The real Yahoo schedule. Record, division record, standings, playoff seeds, then the playoffs replayed to a champion. |
| All-play | Each week, every team plays every other team. |
| Versus median | The real matchup, plus a second game against the league median that week. |
| Points only | Season points decide the table. |
| Schedule swap | An N by N grid. Row team plays the column team's schedule. When that schedule meets the row team itself, it plays the column team instead. |
| One side perfect | Each team's best lineup against its opponent's actual, and the reverse. Shows wins thrown away and losses dodged. |
| King of the Hill | Section 8.1, on either lens. |

### 6.3 Standings and the champion

- Records count regular-season weeks only: `start_week` up to the week before
  `playoff_start_week`, finished weeks only.
- Order: win percentage, then points in that universe, then all-play wins.
- Ties count as half a win.
- Playoff seeds are the top `num_playoff_teams`. The bracket is the next power of
  two, top seeds take byes, and seed 1 meets the lowest seed. When
  `uses_playoff_reseeding` is on, every round re-pairs highest against lowest.
- Round `r` is played in week `playoff_start_week + r - 1`, using that universe's
  scores for that week. The last round's winner is that universe's champion.
- **Check:** the Actual head-to-head universe must reproduce Yahoo's real seeds and
  real champion. Any mismatch is shown on the league page, not hidden.

### 6.4 The board

The league home page leads with one line per universe: who won it, their record,
and whether that differs from the real champion. While a season is still being
played, each universe shows who leads it instead. Under it, a table of every team
against every universe, showing finishing place.

Season stats per team:

- Total and average bench points.
- Lineup IQ.
- Luck: actual wins minus the wins an average schedule would have given, taken
  from all-play win percentage.
- Weekly high scores.
- Universes won.

### 6.5 Every season

Each league page has a season switcher across its `renew` chain. An **all-time**
page combines every season by manager:

- Seasons played.
- Real titles and best-ball titles.
- Universes won.
- Career actual points, best-ball points and bench points.
- Career lineup IQ and luck.

---

## 7. Every score

| Page | Shows |
|---|---|
| Week | Every matchup that week: actual and best-ball score both sides, whether the winner flips, both lineups side by side with every player's points, blunders marked. |
| Team | Every week of one team's season: actual, best ball, floor, projected, result in each lens, every player's points every week, its row of the schedule swap grid. |
| Blunders | The biggest bench mistakes of the season, league-wide, as a scrolling ticker and a full list. |

---

## 8. Carried-over features

### 8.1 King of the Hill

- Default strike schedule, from the old spec, by week: 8, 7, 6, 6, 4, 4, 3, 3, 2,
  then 1 a week to week 13.
- Three strikes and out. Eliminated teams are skipped when counting the lowest.
- At the strike line, the team with fewer season points so far takes the strike.
  If that is also tied, both take it.
- Finished weeks only. Runs on the actual lens or the best-ball lens.
- The last team standing is King. The schedule is editable per league.

### 8.2 Division names

League members can rename divisions for display. Stored per league.

### 8.3 AI analyst

- A chat panel on each league, answered by Claude using the league's computed data
  through tools: standings for any universe, a week, a team's season, a team's week.
- The persona is the old one: a casual, profane, trash-talking league analyst that
  only states numbers the tools returned.
- Needs `ANTHROPIC_API_KEY`. Without it the panel says it is off; nothing else
  changes.
- Errors are logged on the server and summarised to the browser. No stack traces
  or data dumps are sent to the browser.

### 8.4 Exports and sharing

- CSV of every team-week: week, team, manager, actual, best ball, floor,
  projected, bench points, and result in each lens.
- JSON of the whole computed season.
- Any card or table can be saved or copied as a PNG.

### 8.5 Tier game

- One player at a time: name, position, auction price. Guess the tier.
- Tiers per position: QB 3, RB 4, WR 6, TE 3. K and DEF are excluded, as before.
- Three-letter initials, no account needed.
- The answer is checked on the server.
- Leaderboard of accuracy, with at least 5 guesses to qualify, as before, then best streak.
- Seeded from the old `data/players.csv`, the 2025 preseason list.

---

## 9. Pages and API

| Page | Purpose |
|---|---|
| `/` | Landing. Connect Yahoo, or open the sample league. |
| `/leagues` | Every league the visitor is in, grouped by league across seasons. |
| `/l/{league_key}` | The board: champions per universe, standings in any universe, season stats, blunder ticker. |
| `/l/{league_key}/week/{n}` | Every matchup that week. |
| `/l/{league_key}/team/{team_key}` | One team's season. |
| `/l/{league_key}/swap` | Schedule swap grid. |
| `/l/{league_key}/koth` | King of the Hill. |
| `/l/{league_key}/all-time` | Every season combined. |
| `/tiers` | Tier game. |
| `/status` | Setup checklist: which keys are set, database reachable, the exact Yahoo redirect URI to register. |
| `/setup` | Paste the Yahoo app's ID and secret. Opens only from the setup link. |

| API | Purpose |
|---|---|
| `GET /api/yahoo/login` | Start Yahoo sign-in with a signed `state`. |
| `GET /api/yahoo/callback` | Check `state`, exchange the code, store tokens, start a session, read leagues. |
| `POST /api/yahoo/logout` | End the session. `?disconnect=1` also deletes the tokens. |
| `POST /api/leagues/refresh` | Re-read the visitor's league list from Yahoo. |
| `POST /api/leagues/{key}/sync` | Fetch what is missing or stale, within a time budget. Returns progress so the page can call again until done. |
| `GET /api/leagues/{key}/export?format=csv\|json` | Exports. |
| `PUT /api/leagues/{key}/prefs` | Division names, King of the Hill schedule, pool setting. |
| `POST /api/leagues/{key}/chat` | AI analyst. |
| `GET /api/tier/next`, `POST /api/tier/guess`, `GET /api/tier/board` | Tier game. |
| `GET /api/cron/refresh` | Daily refresh of live and correction weeks. Needs `CRON_SECRET`. |
| `GET /api/status` | The `/status` checks as JSON. Never returns secret values. |
| `POST /api/setup` | Setup code, client ID and secret. Checks with Yahoo, seals, saves. |

---

## 10. Data model

Postgres schema `fantasy` on the clocknumbers Supabase project. Not exposed through
the Supabase REST API. Only the app's server connects, with `DATABASE_URL`.

| Table | Holds |
|---|---|
| `users` | Yahoo `guid`, nickname, avatar, first and last seen. |
| `yahoo_tokens` | Per user: access and refresh token, encrypted with AES-256-GCM under `TOKEN_KEY`, and expiry. |
| `sessions` | SHA-256 of the session id, user, expiry. The raw id lives only in the cookie. |
| `leagues` | One row per league per season: key, season, name, size, weeks, playoff settings, roster slots, divisions, `renew`, `renewed`, last sync. |
| `league_members` | Which user is in which league, and their team. |
| `teams` | Per league: team key, name, logo, division, manager guid and nickname, Yahoo's own rank, seed and record. |
| `weeks` | Per league per week: fetched at, final or not. |
| `matchups` | Per league per week: both teams, points, projections, playoff and consolation flags, Yahoo's winner. |
| `roster_spots` | Per league, week, team, player: name, NFL team, position, eligible positions, Yahoo slot, points. |
| `league_prefs` | Division names, King of the Hill schedule, pool setting. |
| `app_secrets` | The Yahoo app's ID and secret from the setup page, sealed under `TOKEN_KEY`. |
| `tier_players` | Tier game players. |
| `tier_board` | Initials, correct, total, current and best streak, last played. |

Everything in sections 5 to 8 is computed from these tables at request time. A full
season is a few thousand roster rows, which computes in milliseconds, so there is
no second cache to go stale.

---

## 11. Sync

- Sign-in reads the league list. Opening a league starts a sync if anything is
  missing or stale, and the page shows progress while it runs.
- A sync fetches settings, standings, each needed scoreboard, then each needed team
  roster, oldest week first, four at a time. It stops at about 50 seconds and
  reports what remains, and the page calls again.
- Final weeks are never refetched.
- A daily cron refreshes the live week and the stat-correction week of every
  current-season league, using the token of its most recently active member.

---

## 12. Security

- Session cookie: random 32 bytes, `HttpOnly`, `Secure`, `SameSite=Lax`, 60 days.
- OAuth `state`: random, stored in a short-lived `HttpOnly` cookie, compared on
  callback.
- Tokens are encrypted at rest. Refreshed automatically five minutes before
  expiry.
- Every league route checks membership.
- State-changing routes reject requests whose `Origin` is not the app.
- No secret is ever returned by an API or written to a log.

---

## 13. Plugging in the Yahoo key

The app is deployed and running without it. Switching Yahoo on needs no code
change, no Vercel visit and no chat:

1. Open the setup link: `{APP_URL}/setup#{setup code}`. The code lives only in
   the part after `#`, which browsers never send to the server, and the site
   keeps only its SHA-256 (`SETUP_CODE_HASH`).
2. The page shows the exact redirect URI and the Yahoo steps:
   - Go to `https://developer.yahoo.com/apps/create/`, signed in to Yahoo.
   - **Application type:** Web Application.
   - **Redirect URI:** `{APP_URL}/api/yahoo/callback`.
   - **API permissions:** Fantasy Sports, Read.
3. Paste the **Client ID** and **Client Secret** Yahoo shows, and save.
4. The site checks the pair with Yahoo by trading a made-up sign-in code. A
   pair Yahoo does not recognise is refused and nothing is saved.
5. A good pair is sealed with AES-256-GCM under `TOKEN_KEY` and stored in
   `fantasy.app_secrets`. It is never displayed again, only the last four
   characters of the ID.
6. Sign-in works at once. `/status` turns green.

Anyone holding the link can replace the pair, which is how it is updated
later. Five wrong codes from one address lock it for ten minutes. Setting
`YAHOO_CLIENT_ID` and `YAHOO_CLIENT_SECRET` on Vercel still works and wins
over the saved pair.

### Environment variables

| Variable | Set by | Purpose |
|---|---|---|
| `APP_URL` | build | Public address. Decides the Yahoo redirect URI. |
| `DATABASE_URL` | build | Supabase pooler connection, transaction mode. |
| `TOKEN_KEY` | build | 32 random bytes, base64. Encrypts Yahoo tokens. |
| `CRON_SECRET` | build | Authorises the daily refresh. |
| `SETUP_CODE_HASH` | build | SHA-256 of the setup link's code. |
| `YAHOO_CLIENT_ID` | optional | Yahoo app, if not added on the setup page. |
| `YAHOO_CLIENT_SECRET` | optional | Yahoo app, if not added on the setup page. |
| `ANTHROPIC_API_KEY` | Sanj, later | AI analyst only. Optional. |

If the app later moves to another address, such as `fantasy.clocknumbers.com`,
`APP_URL` and the Yahoo app's redirect URI change together.

---

## 14. Look and feel

- Night game. Near-black field, stadium-light glow, chalk yard lines.
- Scoreboard numerals for every score. Broadcast lower-thirds for headings.
- Three colours carry meaning everywhere:
  - **Lime** is real.
  - **Ice blue** is best ball.
  - **Hot coral** is points left on the bench.
- A bottom ticker of the season's worst bench blunders, like a sports crawl.
- Works one-handed on a phone first. Tables scroll inside themselves, never the
  page.

---

## 15. Acceptance

1. With no Yahoo key, `/`, `/l/sample` and every sample sub-page load, and `/status`
   lists exactly what is missing.
2. The engine's tests pass, including:
   - The captured 2025 rosters from the old repo.
   - A superflex case that the old greedy gets wrong.
   - A negative-points kicker.
   - An `IR` player.
   - An empty slot.
   - A tie.
3. In every universe of the sample league, bench points are never negative, and
   best-ball points are never below actual.
4. After the key is added and Sanj signs in:
   - His leagues for every season appear.
   - A full sync of the 2025 league completes.
   - The Actual head-to-head universe reproduces Yahoo's real seeds and champion.
5. A league page refuses a signed-in visitor who is not a member.

---

## 16. Known limits

- **Mid-week pickups.** A player picked up after his game is on that week's roster
  with points scored before the pickup, and best ball will count them. Fixing it
  needs the transactions feed and game kickoff times. Left for later.
- **Leagues with weekly playoff byes** or consolation ladders are replayed with the
  standard bracket in section 6.3, then checked against Yahoo's real champion.
- **Non-NFL games** are not covered.
