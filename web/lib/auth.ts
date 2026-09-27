import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time compare that does not leak the secret's length. */
export function secretMatches(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Passphrase gate shared by every planner endpoint. Null when authorised. */
export function authProblem(request: Request): Response | null {
  const expected = process.env.DISPATCH_SECRET;
  if (!expected) {
    // No refusal is silent and none leaves the operator without a next step:
    // this one is a deployment that was never given its secret, which no
    // passphrase can fix, so saying "not authorised" would send them to retype
    // one for an hour.
    return Response.json(
      {
        error:
          "This deployment has no shared secret set, so it cannot reach the store at all. " +
          "No passphrase will work until DISPATCH_SECRET is set on the deployment.",
      },
      { status: 503 },
    );
  }
  const given = request.headers.get("x-wayfinder-key") ?? "";
  if (!given || !secretMatches(given, expected)) {
    // Named to no location: this is read from more than one field now (the
    // Missions view's own, and the Summary's beside Save -- plan decision
    // 17), and naming one of them here would point the operator at a box
    // elsewhere, which is exactly what that decision removes.
    return Response.json(
      {
        error: "That passphrase is not the one this deployment expects. Retype it; it is kept only in this browser.",
      },
      { status: 401 },
    );
  }
  return null;
}
