import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MissionList from "./MissionList";
import { DEFAULT_SPEC, type MissionSpec } from "@/lib/spec";
import type { MissionRow } from "@/lib/missionRecords";
import type { MissionState } from "@/lib/model";
import { PASSPHRASE_KEY } from "@/lib/passphrase";

// Same flyable triangle the lib suite uses to isolate what the test is about.
const SPEC: MissionSpec = {
  ...DEFAULT_SPEC,
  site: "Rehearsal Field",
  site_id: "rehearsal-1",
  date: "2026-09-24",
  aoi: [
    [45, -75],
    [45.001, -75],
    [45.001, -75.001],
  ],
};

function makeRow(name: string, id: string, state: MissionState): MissionRow {
  return {
    id,
    site_id: "rehearsal-1",
    site: "Rehearsal Field",
    name,
    date: "2026-09-24",
    state,
    archived: false,
    spec_key: null,
    spec: SPEC,
    cards: [],
    loaded_cards: [],
    superseded_by: null,
    flown_marked: null,
    flown_evidence_at: null,
    flown_disagreement: null,
    collected_at: null,
    loaded_at: null,
    created_at: "2026-09-24T09:00:00Z",
    updated_at: "2026-09-24T09:00:00Z",
    edit: "in-place",
  };
}

type FetchImpl = (url: string, init?: { method?: string }) => Promise<unknown>;

// happy-dom in this runner exposes no localStorage; the passphrase module
// only needs the Storage surface, so a memory map stands in.
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  } as Storage;
}

function renderList(rows: MissionRow[], actionImpl: FetchImpl, withNotice = true) {
  vi.stubGlobal("localStorage", memoryStorage());
  localStorage.setItem(PASSPHRASE_KEY, "secret");
  const fetchMock = vi.fn(async (url: string, init?: { method?: string }) => {
    if (url === "/api/missions?archived=1") {
      return { ok: true, status: 200, json: async () => ({ missions: rows, archived_count: 0 }) };
    }
    return actionImpl(url, init);
  });
  vi.stubGlobal("fetch", fetchMock);
  const onNotice = vi.fn();
  const utils = render(
    <MissionList
      onEdit={() => {}}
      onCopy={() => {}}
      {...(withNotice ? { onNotice } : {})}
    />,
  );
  return { ...utils, onNotice, fetchMock };
}

function ok(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: async () => body });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MissionList row actions report via onNotice", () => {
  it("Dispatch ok fires onNotice with verbatim text + row name, nothing inline", async () => {
    const { onNotice } = renderList([makeRow("north half", "m1", "planned")], () =>
      ok({ cards: ["way finder 1"] }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Dispatch" }));

    const body = "Dispatched. way finder 1 is reserved for it.";
    await waitFor(() => expect(onNotice).toHaveBeenCalledTimes(1));
    expect(onNotice).toHaveBeenCalledWith({
      title: "Dispatched.",
      body,
      missionName: "north half",
      failed: false,
    });
    expect(screen.queryByText(body)).toBeNull();
  });

  it("Withdraw ok fires onNotice with verbatim text + row name, nothing inline", async () => {
    const { onNotice } = renderList([makeRow("orbit", "m2", "dispatched")], () =>
      ok({ cards_released: ["way finder 1"] }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Withdraw" }));

    const body = "Withdrawn. way finder 1 released.";
    await waitFor(() => expect(onNotice).toHaveBeenCalledTimes(1));
    expect(onNotice).toHaveBeenCalledWith({
      title: "Withdrawn.",
      body,
      missionName: "orbit",
      failed: false,
    });
    expect(screen.queryByText(body)).toBeNull();
  });

  it("Mark Flown ok fires onNotice, never a Dispatch announcement (#164)", async () => {
    const { onNotice } = renderList([makeRow("north half", "m3", "loaded")], () =>
      ok({ cards: ["way finder 1"] }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Mark Flown" }));

    const body = "Marked Flown. Its Card is free for the next Mission.";
    await waitFor(() => expect(onNotice).toHaveBeenCalledTimes(1));
    expect(onNotice).toHaveBeenCalledWith({
      title: "Marked Flown.",
      body,
      missionName: "north half",
      failed: false,
    });
    expect(screen.queryByText(body)).toBeNull();
  });

  it("Unmark Flown ok fires onNotice with verbatim text, nothing inline", async () => {
    const { onNotice } = renderList([makeRow("orbit", "m4", "flown")], () => ok({}));

    fireEvent.click(await screen.findByRole("button", { name: "Unmark Flown" }));

    const body = "Unmarked. It holds its Card again.";
    await waitFor(() => expect(onNotice).toHaveBeenCalledTimes(1));
    expect(onNotice).toHaveBeenCalledWith({
      title: "Unmarked.",
      body,
      missionName: "orbit",
      failed: false,
    });
    expect(screen.queryByText(body)).toBeNull();
  });

  it("Remove via the confirm sheet fires onNotice, nothing inline", async () => {
    const { onNotice } = renderList([makeRow("north half", "m5", "planned")], (url, init) => {
      expect(init?.method).toBe("DELETE");
      expect(url).toContain("m5");
      return ok({ archived: "m5" });
    });

    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(dialog.querySelector("button.primary") as HTMLButtonElement);

    const body = "Removed from the list. It is archived, not deleted — nothing is lost.";
    await waitFor(() => expect(onNotice).toHaveBeenCalledTimes(1));
    expect(onNotice).toHaveBeenCalledWith({
      title: "Removed from the list.",
      body,
      missionName: "north half",
      failed: false,
    });
    expect(screen.queryByText(body)).toBeNull();
  });

  it("a failed action fires onNotice assertive with the server text, nothing inline", async () => {
    const { onNotice } = renderList([makeRow("north half", "m1", "planned")], () =>
      Promise.resolve({
        ok: false,
        status: 503,
        json: async () => ({ error: "No Card is free; 2 needed, 0 available." }),
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Dispatch" }));

    const body = "Dispatch failed: No Card is free; 2 needed, 0 available.";
    await waitFor(() => expect(onNotice).toHaveBeenCalledTimes(1));
    expect(onNotice).toHaveBeenCalledWith({
      title: body,
      body,
      missionName: "north half",
      failed: true,
    });
    expect(screen.queryByText(body)).toBeNull();
  });

  it("poll and Refresh never refire or render the page-owned Notice", async () => {
    const { onNotice, fetchMock } = renderList([makeRow("north half", "m1", "planned")], () =>
      ok({ cards: ["way finder 1"] }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Dispatch" }));
    const body = "Dispatched. way finder 1 is reserved for it.";
    await waitFor(() => expect(onNotice).toHaveBeenCalledTimes(1));

    // The five-minute poll path and the Refresh button both re-read the store;
    // neither may touch the page-owned Notice.
    document.dispatchEvent(new Event("visibilitychange"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([u]) => String(u) === "/api/missions?archived=1").length).toBeGreaterThan(2),
    );
    expect(onNotice).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(body)).toBeNull();
  });

  it("actions still land without an onNotice owner", async () => {
    renderList([makeRow("north half", "m1", "planned")], () => ok({ cards: ["way finder 1"] }), false);

    fireEvent.click(await screen.findByRole("button", { name: "Dispatch" }));

    await waitFor(() =>
      expect(screen.queryByText("Dispatched. way finder 1 is reserved for it.")).toBeNull(),
    );
  });
});
