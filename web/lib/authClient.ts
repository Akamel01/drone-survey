"use client";

import { createAuthClient } from "better-auth/react";
import { signOutDestination } from "./papyrusSignOut";

export const authClient = createAuthClient();

/** Signs out here, then (Papyrus mode) on the Papyrus account too, so one
 *  Sign out ends both sessions (#341). Legacy mode goes home as before. */
export async function signOutToHome(): Promise<void> {
  let papyrus = false;
  try {
    await authClient.signOut({ disableRedirect: true });
    papyrus = ((await (await fetch("/api/papyrus-sign-out")).json()) as { enabled?: boolean }).enabled === true;
  } finally {
    location.assign(signOutDestination(papyrus, location.origin));
  }
}
