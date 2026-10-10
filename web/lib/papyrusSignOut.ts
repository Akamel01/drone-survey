/** Where Sign out sends the browser (#341): the Papyrus sign-out, which
 *  returns to Mission Control, in Papyrus mode; the home page otherwise. */
export const PAPYRUS_SIGN_OUT = "https://papyrus-ai.net/sign-out";

export function signOutDestination(papyrusMode: boolean, origin: string): string {
  return papyrusMode ? `${PAPYRUS_SIGN_OUT}?next=${origin}/` : "/";
}
