"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

export async function signOutToHome(): Promise<void> {
  try {
    await authClient.signOut({ disableRedirect: true });
  } finally {
    location.assign("/");
  }
}
