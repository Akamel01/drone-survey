import { test } from "node:test";
import assert from "node:assert/strict";
import { emailSignInProblem, passwordProblem, PASSWORD_MIN } from "./emailSignIn.ts";

test("a password needs at least ten characters", () => {
  assert.equal(PASSWORD_MIN, 10);
  assert.match(passwordProblem("123456789") ?? "", /at least 10/);
  assert.equal(passwordProblem("1234567890"), null);
  assert.match(passwordProblem("x".repeat(129)) ?? "", /at most 128/);
});

test("each refusal reads in the operator's words", () => {
  assert.match(emailSignInProblem("USER_ALREADY_EXISTS"), /already uses that email/);
  assert.match(emailSignInProblem("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"), /already uses that email/);
  assert.match(emailSignInProblem("INVALID_EMAIL_OR_PASSWORD"), /do not match/);
  assert.match(emailSignInProblem("EMAIL_NOT_VERIFIED"), /Confirm your email/);
  assert.match(emailSignInProblem("INVALID_TOKEN"), /expired or was already used/);
  assert.equal(emailSignInProblem("SOMETHING_NEW", "Server said so."), "Server said so.");
  assert.equal(emailSignInProblem(undefined), "That did not work. Try again.");
});
