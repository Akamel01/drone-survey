// The account gate and its helpers (D10). Every planner route asks
// `requireCaller` and nothing else (#244): no session is a 401, a pending
// Account a 403, and an approved one becomes the Caller -- its Workspace --
// that the Mission lifecycle scopes every read and write by.
//
// Import discipline: explicit .ts on relative imports, and next/headers is
// loaded inside getAccount() only -- `node --test` and `node
// --input-type=module` can import this module with no Next request in play.

import type { Session, User } from "better-auth";
import { getPool } from "./accountDb.ts";
import { getAuth, ownerWorkspaceSlug, promoteOwnerIfVerified } from "./accountAuth.ts";
import { accountEnvProblem } from "./accountEnv.ts";
import type { Caller } from "./missionLifecycle.ts";

/** A session as the account surface sees it: Better Auth's API session
 *  payload, user included. (The bare `Session` export is the session row
 *  without `.user`; D10's "session" is the `auth.api.getSession` result.)
 *  approved is optional/nullable in the installed response type, so the gate
 *  treats anything but true as pending. */
export type AccountSession = { session: Session; user: User & { approved?: boolean | null } };

/** The planner gate's answer: the session, or the response that refuses. */
export type AccountGate = { ok: true; session: AccountSession } | { ok: false; response: Response };

function isApproved(user: unknown): boolean {
  return (user as { approved?: boolean | null }).approved === true;
}

/** Route handlers: 503 unconfigured, 401 no session, 403 pending, else the
 *  session (D10). The env gate runs before any Better Auth construction. */
export async function requireApprovedAccount(request: Request): Promise<AccountGate> {
  const problem = accountEnvProblem();
  if (problem) return { ok: false, response: problem };
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return {
      ok: false,
      response: Response.json({ error: "Sign in to continue: this request carried no session." }, { status: 401 }),
    };
  }
  if (!isApproved(session.user)) {
    return {
      ok: false,
      response: Response.json(
        {
          error:
            "This account is waiting for approval: an operator must approve it before it can reach its Workspace's Missions.",
        },
        { status: 403 },
      ),
    };
  }
  return { ok: true, session };
}

/** The planner routes' one gate (#244): the approved Account as its
 *  Workspace, or the refusal. A Mission outside that Workspace is the
 *  lifecycle's 404, not a refusal here. */
export async function requireCaller(
  request: Request,
): Promise<{ ok: true; caller: Caller; accountId: string } | { ok: false; response: Response }> {
  const gate = await requireApprovedAccount(request);
  if (!gate.ok) return gate;
  const { user } = gate.session;
  let workspace = await workspaceOf(user.id);
  if (workspace?.slug !== ownerWorkspaceSlug() && isOwnerEmail(user)) {
    // The verified owner outside the operator's Workspace (an Account created
    // before its email was verified, then linked): the bootstrap is
    // re-runnable, so heal here rather than hide the operator's Missions.
    await promoteOwnerIfVerified(user);
    workspace = await workspaceOf(user.id);
  }
  if (!workspace) {
    return {
      ok: false,
      response: Response.json(
        { error: "This account has no Workspace yet, so it has no Missions to reach. Sign out and sign in again." },
        { status: 403 },
      ),
    };
  }
  return {
    ok: true,
    caller: { workspaceId: workspace.id, ownsUnclaimed: workspace.slug === ownerWorkspaceSlug() },
    // The Account itself, for what belongs to it rather than its Workspace:
    // its notification subscriptions (#319).
    accountId: user.id,
  };
}

function isOwnerEmail(user: { email?: string | null; emailVerified?: boolean | null }): boolean {
  const owner = (process.env.OWNER_EMAIL ?? "").toLowerCase();
  return owner !== "" && (user.email ?? "").toLowerCase() === owner && user.emailVerified === true;
}

/** The Account's Workspace: the operator's when it is a member of it, else
 *  its first. One Workspace per Account today (inviting is not specified). */
async function workspaceOf(userId: string): Promise<{ id: string; slug: string } | null> {
  const pool = await getPool();
  if (!pool) return null;
  const { rows } = await pool.query<{ id: string; slug: string }>(
    `SELECT o.id, o.slug FROM "member" m JOIN "organization" o ON o.id = m."organizationId"
      WHERE m."userId" = $1 ORDER BY (o.slug = $2) DESC, m."createdAt" ASC LIMIT 1`,
    [userId, ownerWorkspaceSlug()],
  );
  return rows[0] ?? null;
}

/** The Accounts API: an approved admin only (403 otherwise), checked on the
 *  server from the session's role, never from anything the page sends. */
export async function requireAdmin(request: Request): Promise<AccountGate> {
  const gate = await requireApprovedAccount(request);
  if (!gate.ok) return gate;
  if ((gate.session.user as { role?: string | null }).role !== "admin") {
    return {
      ok: false,
      response: Response.json({ error: "Only the operator can see and change Accounts." }, { status: 403 }),
    };
  }
  return gate;
}

/** Server components: the signed-in account and its approval, or null when
 *  unconfigured, signed out, or the store is unreachable. Never throws. */
export async function getAccount(): Promise<(User & { approved: boolean }) | null> {
  try {
    if (accountEnvProblem()) return null;
    const { headers } = await import("next/headers");
    const auth = await getAuth();
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return null;
    return { ...session.user, approved: isApproved(session.user) };
  } catch (error) {
    // A page must still render when the store is down; the log is the only
    // signal, because a thrown error here would blank the page instead.
    console.error("accountAccess.getAccount: no account this render:", error);
    return null;
  }
}

/** app/api/auth/[...all]/route.ts delegates here (D6): env gate first, then
 *  Better Auth's Request -> Response handler, no Next runtime coupling. */
export async function accountAuthHandler(request: Request): Promise<Response> {
  const problem = accountEnvProblem();
  if (problem) return problem;
  return (await getAuth()).handler(request);
}

/** Server-side approval write (#243 reuses it): one parameterised UPDATE. */
export async function setAccountApproval(userId: string, approved: boolean): Promise<void> {
  const pool = await getPool();
  if (!pool) {
    console.warn("accountAccess.setAccountApproval: no DATABASE_URL; nothing to update");
    return;
  }
  await pool.query('UPDATE "user" SET approved = $1 WHERE id = $2', [approved, userId]);
}
