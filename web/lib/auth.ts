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
    return Response.json({ error: "Dispatch is not configured" }, { status: 503 });
  }
  const given = request.headers.get("x-wayfinder-key") ?? "";
  if (!given || !secretMatches(given, expected)) {
    return Response.json({ error: "Not authorised" }, { status: 401 });
  }
  return null;
}
