# Mission Control — planner

Drone survey mission planner. One screen (`/plan`): draw the survey area on a
satellite map, tune flight and camera settings, and download a mission spec.

Static Next.js app, no backend, no database, no auth.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 (redirects to `/plan`).

```bash
npm run build   # production build
npm run start   # serve the production build
```

## Deploy on Vercel

- Root directory: `web`
- Framework preset: Next.js
- No environment variables, no serverless functions — it's a static export-shaped app.

## Layout

- `app/plan/` — the planner screen.
- `components/` — `MapPane` (MapLibre map + hand-rolled drawing tools), `Sidebar` (flight/camera settings), `SummaryBar` (computed figures + export).
- `lib/spec.ts` — the `MissionSpec` contract (owned separately).
- `lib/mission.ts` — flight-path geometry (`preview()`, `areaHectares()`) (owned separately).
- `lib/basemap.ts` — the two MapLibre basemap styles (Esri satellite, OSM).
