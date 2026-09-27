// Email and password sign-in (#247), the parts both sides share: the
// password rule and the sentence the operator reads for each refusal.
// Client-safe: no server imports.

/** The shortest password an email Account may have, checked by the form
 *  before it sends and by the server (lib/accountAuth.ts). */
export const PASSWORD_MIN = 10;

/** Null when the password is acceptable, else the reason. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters for the password.`;
  if (password.length > 128) return "Use at most 128 characters for the password.";
  return null;
}

/** Better Auth's error code, in the operator's words. The reset form never
 *  uses this: it answers the same way whether or not an Account exists. */
export function emailSignInProblem(code: string | undefined, fallback?: string): string {
  switch (code) {
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "An Account already uses that email. Sign in instead, or reset the password.";
    case "INVALID_EMAIL_OR_PASSWORD":
      return "That email and password do not match an Account.";
    case "EMAIL_NOT_VERIFIED":
      return "Confirm your email first: open the link we sent to it, then sign in.";
    case "PASSWORD_TOO_SHORT":
      return `Use at least ${PASSWORD_MIN} characters for the password.`;
    case "PASSWORD_TOO_LONG":
      return "Use at most 128 characters for the password.";
    case "INVALID_EMAIL":
      return "That is not an email address.";
    case "INVALID_TOKEN":
      return "That link has expired or was already used. Ask for a new one.";
    default:
      return fallback || "That did not work. Try again.";
  }
}
