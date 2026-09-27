export type HomeState = "unconfigured" | "signedout" | "pending" | "approved";

export const HOME_ENTRANCE_KEY = "home-entrance-played";

export function homeState({
  configured,
  account,
}: {
  configured: boolean;
  account: { approved: boolean } | null;
}): HomeState {
  if (!configured) return "unconfigured";
  if (!account) return "signedout";
  return account.approved ? "approved" : "pending";
}

export function accountLabel(name?: string | null, email?: string | null): string {
  return name?.trim() || email || "";
}

function entranceStore<K extends "getItem" | "setItem">(): Pick<Storage, K> | null {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
}

export function shouldPlayHomeEntrance(
  state: HomeState,
  storage?: Pick<Storage, "getItem"> | null,
): boolean {
  if (state === "approved") return false;
  try {
    const store = storage === undefined ? entranceStore<"getItem">() : storage;
    return store?.getItem(HOME_ENTRANCE_KEY) == null;
  } catch {
    return true;
  }
}

export function markHomeEntrancePlayed(storage?: Pick<Storage, "setItem"> | null): void {
  try {
    const store = storage === undefined ? entranceStore<"setItem">() : storage;
    store?.setItem(HOME_ENTRANCE_KEY, "1");
  } catch {
    return;
  }
}
