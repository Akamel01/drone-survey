import { authProblem } from "@/lib/auth";
import { createMissionLifecycle } from "@/lib/missionLifecycle";
import { respond } from "@/lib/missionRoute";
import { b2MissionStore } from "@/lib/missionStore";

// The Mission list, and saving one. Missions live in the shared store rather
// than in browser local storage: the operator lost sight of their saved
// Missions simply by opening a different deployment URL, and a cleared cache
// would have destroyed them with no warning (ADR 0021). The browser keeps the
// edit in progress and nothing else.
//
// The storage credential lives here and never reaches the browser (ADR 0017).
// Every action below delegates to the lifecycle module; the route only parses
// the request and maps the result to a status (#259).
export const runtime = "nodejs";
export const preferredRegion = "yyz1";

/**
 * GET /api/missions
 *
 * Every Mission, newest first, each with the one derived state, the Cards it
 * holds, and both answers about Flown. `?archived=1` includes Missions that
 * are Flown, Withdrawn, Superseded or removed -- nothing is deleted, so they
 * are behind a filter rather than absent.
 */
export async function GET(request: Request) {
  const denied = authProblem(request);
  if (denied) return denied;
  const archived = new URL(request.url).searchParams.get("archived") === "1";
  return respond(await createMissionLifecycle(b2MissionStore()).list({ kind: "passphrase" }, { archived }));
}

/**
 * POST /api/missions
 *
 * Saves a Planned Mission. With no `id`, a new one. With an `id`:
 *  - Planned          edited in place;
 *  - Dispatched and   saved as a NEW Mission with the same Site, date and
 *    later             name, because a Spec is never edited -- a change is a
 *                      new Spec that supersedes the earlier one. The response
 *                      carries the new id and `forked_from`;
 *  - Loaded           refused: a file is already in the field.
 */
export async function POST(request: Request) {
  const denied = authProblem(request);
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Body is not JSON. Send the Mission as JSON." }, { status: 400 });
  }
  return respond(await createMissionLifecycle(b2MissionStore()).save({ kind: "passphrase" }, raw));
}

/**
 * DELETE /api/missions?id=<id>
 *
 * Removing a Mission archives it. Nothing is ever deleted (ADR 0021), so the
 * record stays and is hidden behind the archived filter. A Mission that still
 * holds a Card is refused: withdraw it first, so the Card comes back.
 */
export async function DELETE(request: Request) {
  const denied = authProblem(request);
  if (denied) return denied;
  // The id is plumbing, not validation: the module checks it.
  const id = new URL(request.url).searchParams.get("id");
  return respond(await createMissionLifecycle(b2MissionStore()).remove({ kind: "passphrase" }, { id }));
}
