# Fantasy

Your Yahoo fantasy football league, rebuilt with the lineup everyone should have
set, then replayed every way the season could have gone, for every season.

The successor to `sanpixel/fantasy.ai`. What it does and why is in
[docs/REQUIREMENTS.md](docs/REQUIREMENTS.md).

## Layout

| Path | What |
|---|---|
| `src/engine/` | Pure TypeScript: Yahoo XML parsing, the optimal-lineup solver, every universe, the sample league. No I/O. |
| `src/lib/` | Database, Yahoo OAuth and API client, sync, sessions. |
| `src/app/` | Pages and API routes (Next.js App Router). |
| `db/migrations/` | SQL for the `fantasy` schema on the clocknumbers Supabase project. |
| `test/` | Engine tests: `npm test`. |

## Run

```
npm install
npm test
npm run dev
```

Without any keys, `/`, `/l/sample-2026` and the rest of the sample league work.
`/status` lists what is missing. Environment variables are in section 13 of the
requirements.
