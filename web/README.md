# Mission Control — planner

Drone survey mission planner. One screen (`/plan`): draw the survey area on a
satellite map, tune flight and camera settings, and download a mission spec.

The planning screen is still static and passphrase-gated; the app now also
carries the accounts backend — a Better Auth surface at `/api/auth/[...all]`
with its schema and migrations — which later tickets wire into the planner.
Nothing on `/plan` needs an account yet.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 (redirects to `/plan`). Accounts need the variables
below; without them the app still builds and runs, and the auth endpoints
answer 503 naming what is missing.

```bash
npm run build   # node scripts/migrate.mjs && next build
npm run start   # serve the production build
```

## Configuration

Nine required variables, in this order (the 503 message lists them the same
way):

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | The store: a `postgres://` URL, or `pglite://memory` / `pglite://<dir>` locally (see Database below) |
| `BETTER_AUTH_SECRET` | Signs sessions |
| `BETTER_AUTH_URL` | This deployment's public base URL, e.g. `http://localhost:3000` |
| `OAUTH_PROXY_SECRET` | Shared OAuth-proxy secret — the same value in production, previews and local |
| `GOOGLE_CLIENT_ID` | Google OAuth client id |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | GitHub OAuth client id |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret |
| `OWNER_EMAIL` | The operator's email — that Account gets the operator Workspace and the admin role |

Optional:

- `AUTH_TEST_GOOGLE_AUTHORIZATION_URL`, `AUTH_TEST_GOOGLE_TOKEN_URL`,
  `AUTH_TEST_GOOGLE_USERINFO_URL` — point Google at a local stand-in server;
  tests only.
- `AUTH_TEST_GITHUB_AUTHORIZATION_URL`, `AUTH_TEST_GITHUB_TOKEN_URL`,
  `AUTH_TEST_GITHUB_USERINFO_URL` — same for GitHub.
- `AUTH_TRUSTED_HOSTS` — comma-separated extra hosts allowed in `baseURL`.
- `AUTH_TRUSTED_ORIGINS` — comma-separated extra trusted origins.
- `OWNER_WORKSPACE_SLUG` — the operator Workspace's slug (default `operator`).
- `PGLITE_PORT` — fixed port for the local PGlite socket (default: one is
  picked).

## Database

Local and test runs need no Docker and no Postgres: `pglite://memory` (or a
directory, e.g. `pglite://.pglite`, gitignored) starts a Postgres in-process
and serves it over a loopback socket, so migrations and queries take the same
path as production. A `postgres://` URL works too.

Migrations are forward-only and applied from the config with
`npm run db:migrate`:

```bash
DATABASE_URL=pglite://memory npm run db:migrate
```

`npm run build` runs the same script first, so a deploy migrates the
deployment's own database (a preview's Neon branch) as part of the build.

## Tests

```bash
npm test                                # DB-backed tests print a skip reason
DATABASE_URL=pglite://memory npm test   # ...and run on PGlite
```

Evidence for a pull request: the script builds and starts the app plus a local
OAuth stand-in server, drives both providers, and writes screenshots to
`web/.evidence/` (gitignored):

```bash
npm run build
node scripts/auth-evidence.mjs
```

## Deploy on Vercel

- Root directory: `web`
- Framework preset: Next.js
- Set the nine variables in the project's environment (`vercel env pull` for
  local dev), with the same `OAUTH_PROXY_SECRET` in production, previews and
  local; register `/api/auth/callback/google` and `/api/auth/callback/github`
  on the production URL.
- The planner's Dispatch variables (`DISPATCH_SECRET`, `B2_KEY_ID`,
  `B2_APP_KEY`, `B2_BUCKET`) are listed in the root `README.md`.

## Layout

- `app/plan/` — the planner screen.
- `components/` — `MapPane` (MapLibre map + hand-rolled drawing tools), `Sidebar` (flight/camera settings), `SummaryBar` (computed figures + export).
- `lib/spec.ts` — the `MissionSpec` contract (owned separately).
- `lib/mission.ts` — flight-path geometry (`preview()`, `areaHectares()`) (owned separately).
- `lib/basemap.ts` — the two MapLibre basemap styles (Esri satellite, OSM).
- `lib/accountEnv.ts` — which deployment variables accounts need, and the 503 naming the missing ones.
- `lib/accountDb.ts` — the store's one driver entry point, chosen by `DATABASE_URL`.
- `lib/accountAuth.ts` — the lazy Better Auth instance (providers, Workspaces, Approval, rate limit, cookies).
- `lib/accountAccess.ts` — route-handler helpers: the approval gate, `getAccount()`, the auth handler, `setAccountApproval`.
- `scripts/migrate.mjs` — forward-only migrations (`npm run db:migrate`, build).
