// The browser's one way to the Accounts API (#243), in the shape of the
// planner client (lib/missionClient.ts): every result is { ok: true, … } or
// { ok: false, text } with the sentence the operator reads.

import type { AccountRow } from "./accountAdmin";

export type AccountsResult = { ok: true; accounts: AccountRow[] } | { ok: false; text: string };

async function read(response: Response): Promise<AccountsResult> {
  let body: { accounts?: AccountRow[]; error?: string } = {};
  try {
    body = await response.json();
  } catch {}
  if (response.ok && Array.isArray(body.accounts)) return { ok: true, accounts: body.accounts };
  return { ok: false, text: body.error ?? `The Accounts could not be read (${response.status}).` };
}

async function call(init?: RequestInit): Promise<AccountsResult> {
  try {
    return await read(await fetch("/api/accounts", { cache: "no-store", ...init }));
  } catch {
    return { ok: false, text: "The Accounts could not be reached. Check the connection and try again." };
  }
}

export const accountsClient = {
  list: () => call(),
  run: (action: "approve" | "remove", id: string) =>
    call({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) }),
};
