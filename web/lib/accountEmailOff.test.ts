// With no mail sender configured, email and password is off (#247): the
// home page hides it (app/page.tsx) and Better Auth refuses its endpoints.
import { test } from "node:test";
import assert from "node:assert/strict";

test("with no mail sender, the email sign-up and sign-in endpoints refuse", async () => {
  for (const k of ["RESEND_API_KEY", "EMAIL_FROM", "AUTH_TEST_MAIL_DIR", "DATABASE_URL"]) delete process.env[k];
  process.env.BETTER_AUTH_SECRET ??= "email-off-test-secret-0123456789abcdef";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
  const { getAuth } = await import("./accountAuth.ts");
  const auth = await getAuth();
  assert.equal(auth.options.emailAndPassword?.enabled, false);
  for (const endpoint of ["sign-up/email", "sign-in/email"]) {
    const response = await auth.handler(
      new Request(`http://localhost:3000/api/auth/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ email: "a@example.test", password: "long-enough-1", name: "A" }),
      }),
    );
    assert.ok(response.status >= 400 && response.status < 500, `${endpoint} refused (${response.status})`);
  }
});
