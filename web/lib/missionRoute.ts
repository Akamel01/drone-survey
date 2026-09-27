// The one place an Outcome becomes a Response (#259, D3).
//
// The module answers with a kind; the routes must not each re-decide a status
// (the withdraw route shipped broken once precisely because nothing checked
// its status). Extras carry the exact non-`error` fields the operator saw
// before this module existed.

import type { Outcome, RefusalKind } from "./missionLifecycle.ts";

const STATUS: Record<RefusalKind, number> = {
  invalid: 400,
  not_found: 404,
  refused: 409,
  partial: 502,
  unreachable: 502,
  store_refused: 503,
  not_configured: 503,
};

export function refusalStatus(kind: RefusalKind): number {
  return STATUS[kind];
}

/** Success body as-is; refusal as `{error, ...extras}` with its kind's status. */
export function respond<T>(outcome: Outcome<T>): Response {
  if (outcome.ok) return Response.json(outcome.body);
  return Response.json(
    { error: outcome.message, ...outcome.extras },
    { status: refusalStatus(outcome.kind) },
  );
}
