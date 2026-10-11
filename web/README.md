# Mission Control — planner

Drone survey mission planner. One screen (`/plan`): draw the survey area on a
satellite map, tune flight and camera settings, and download a mission spec.

Every planner route needs an approved Account (#244): the session cookie is
the only credential, and each Account sees only its Workspace's Missions
(`lib/accountAccess.requireCaller`, scoped in `lib/missionLifecycle.ts`).
Which Workspace owns a Mission is the `mission_workspace` table, created by
`npm run db:migrate`; a Mission with no row is the operator's.

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
- The six `AUTH_TEST_*` stand-ins above are ignored whenever `VERCEL_ENV` is set
  (production or preview), where the real `GOOGLE_*`/`GITHUB_*` credentials are
  used instead; `localhost:*` hosts and `http://localhost:3000` origins are only
  added off Vercel.
- `AUTH_TRUSTED_HOSTS` — comma-separated extra hosts allowed in `baseURL`.
- `AUTH_TRUSTED_ORIGINS` — comma-separated extra trusted origins.
- `OWNER_WORKSPACE_SLUG` — the operator Workspace's slug (default `operator`).
- `SUPABASE_URL`, `SUPABASE_OAUTH_CLIENT_ID`, `SUPABASE_OAUTH_CLIENT_SECRET` —
  optional alternate sign-in: when all three are set, the app offers only the
  Papyrus sign-in button and the nine-variable Google/GitHub/email mode is off;
  with any unset, sign-in stays in that mode. No `AUTH_TEST_*` stand-in trio
  exists for Supabase — local runs point `SUPABASE_URL` at the stand-in base
  directly, and the stand-in answers the discovery document the production
  configuration builds from that URL. Recovery is unset-the-trio plus redeploy.
- `PGLITE_PORT` — fixed port for the local PGlite socket (default: one is
  picked).
- Notifications (PWA-5, #319) — see "Notifications" below:
  `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (all three, or
  Web Push is off), `PUSH_HOST_TOKEN` (the host's token; unset, the host's
  route answers 503), `NTFY_URL` (default `https://ntfy.sh`).

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

## Notifications

The installed app is told when a Mission changes (PWA-5, #319; decided in
#232). The planner's routes send what the planner changes — Dispatched,
Withdrawn, Superseded — to every device of the Workspace that owns the
Mission. The Linux host sends what only it sees — Collected, Loaded (naming
the Card to open), a Load refused — by POSTing to `/api/push/host` with the
header `x-push-token: $PUSH_HOST_TOKEN`; the planner words it and sends it
(a refusal goes to the operator's Workspace only). Flown is never announced.
Subscriptions belong to an Account (`push_subscription`, created by
`npm run db:migrate`) and are turned on per device in Settings, Notifications.
The ntfy.sh fallback is switched on per Account there too: the planner makes a
random topic, and the operator subscribes to it in the free ntfy app.

The operator sets, in Vercel (production; previews too if wanted):

| Variable | Value |
| --- | --- |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` once, offline. The private key goes nowhere else. Changing the pair turns every device off until it is turned on again. |
| `VAPID_SUBJECT` | `mailto:` the operator's address |
| `PUSH_HOST_TOKEN` | a long random value, e.g. `openssl rand -base64 32`; the same value goes in the host's `push.env` |
| `NTFY_URL` | optional; only for a self-hosted ntfy |

On the Linux host, beside `b2-status.env` (mode 600):

```
~/.config/wayfinder/push.env
PLANNER_URL=https://<the planner's domain>
PUSH_HOST_TOKEN=<the same value as in Vercel>
```

and deploy `scripts/mission/host_push.py` beside `host_store.py`. Without the
file the host sends nothing and everything else works as before; a planner that
cannot be reached is printed and never costs a Collect or a Load.

iPhone and iPad: Web Push reaches only the app added to the Home Screen, on
iOS 16.4 or later, and is turned on from a tap inside it. If notifications
were blocked, only the device's Settings can allow them again.

## Deploy on Vercel

- Root directory: `web`
- Framework preset: Next.js
- Set the nine variables in the project's environment (`vercel env pull` for
  local dev), with the same `OAUTH_PROXY_SECRET` in production, previews and
   local; register `/api/auth/callback/google` and `/api/auth/callback/github`
   on the production URL. A deployment with the Supabase trio set registers
   `/api/auth/callback/supabase` instead (the only callback live in that mode).
- The planner's storage variables (`B2_KEY_ID`, `B2_APP_KEY`, `B2_BUCKET`)
  are listed in the root `README.md`.
- Offline map regions (PWA-2, #315). The street map a Site keeps for offline
  is read from region archives (Protomaps basemap PMTiles, OpenStreetMap data,
  ODbL) in the private B2 bucket under `specs/_maps/`, listed in
  `specs/_maps/manifest.json`; the planner reads them with the same read key
  as everything else, and picks the region that covers the Site. The Linux
  host cuts them: `scripts/maps/cut_region.py` (copy it to `~/drone/maps/`
  beside the `pmtiles` binary) takes the newest Protomaps daily build,
  `pmtiles extract`s the box to z15, uploads it and updates the manifest.
  `cut_region.py --once` does every cut queued from the Developer section of
  Settings (admin only); `--cut bc --name "British Columbia"
  --bbox=-139.06,48.3,-114.03,60` does one by hand; `--check` cuts nothing.
  It will not start with under 6 GB free and kills a cut that takes the host
  under 5 GB free. Run `--once` from cron if queued cuts should be picked up
  on their own. `SITE_MAP_PMTILES_URL` (optional) overrides all of this with
  one archive at a plain URL (development and tests). Esri satellite and
  tile.openstreetmap.org tiles are never kept offline: their terms forbid it.

## Layout

- `app/plan/` — the planner screen.
- `components/` — `MapPane` (MapLibre map + hand-rolled drawing tools), `MapToolbar` (the drawing and map-editing tools, on the map), `Sidebar` (flight/camera settings), `SummaryBar` (computed figures + export).
- `lib/spec.ts` — the `MissionSpec` contract (owned separately).
- `lib/mission.ts` — flight-path geometry (`preview()`, `areaHectares()`) (owned separately).
- `lib/basemap.ts` — the two MapLibre basemap styles (Esri satellite, OSM).
- `lib/accountEnv.ts` — which deployment variables accounts need, and the 503 naming the missing ones.
- `lib/accountDb.ts` — the store's one driver entry point, chosen by `DATABASE_URL`.
- `lib/accountAuth.ts` — the lazy Better Auth instance (providers, Workspaces, Approval, rate limit, cookies).
- `lib/accountAccess.ts` — route-handler helpers: the approval gate, `getAccount()`, the auth handler, `setAccountApproval`.
- `scripts/migrate.mjs` — forward-only migrations (`npm run db:migrate`, build).
