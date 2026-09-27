import { requireAdmin } from "@/lib/accountAccess";
import { getPool } from "@/lib/accountDb";
import { approveAccount, listAccounts, removeAccount } from "@/lib/accountAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The Accounts, pending first. The operator (admin) only. */
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  const pool = await getPool();
  if (!pool) return Response.json({ error: "This deployment has no account database." }, { status: 503 });
  return Response.json({ accounts: await listAccounts(pool) });
}

/** { id, action: "approve" | "remove" }; answers with the Accounts as they now are. */
export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body is not JSON. Send { id, action }." }, { status: 400 });
  }
  const { id, action } = (body ?? {}) as { id?: unknown; action?: unknown };
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    return Response.json({ error: "That is not an Account id. Reload the Accounts." }, { status: 400 });
  }
  if (action !== "approve" && action !== "remove") {
    return Response.json({ error: 'The action is "approve" or "remove".' }, { status: 400 });
  }
  const pool = await getPool();
  if (!pool) return Response.json({ error: "This deployment has no account database." }, { status: 503 });
  const outcome =
    action === "approve" ? await approveAccount(pool, id) : await removeAccount(pool, id, gate.session.user.id);
  if (!outcome.ok) return Response.json({ error: outcome.error }, { status: outcome.status });
  return Response.json({ accounts: await listAccounts(pool) });
}
