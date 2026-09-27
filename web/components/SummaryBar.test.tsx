import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SummaryBar from "./SummaryBar";
import { preview } from "@/lib/mission";
import { DEFAULT_SPEC, type MissionSpec } from "@/lib/spec";
import { describeSave } from "@/lib/missionView";

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

function renderBar(extra: Record<string, unknown> = {}) {
  const onSaved = vi.fn();
  const onNotice = vi.fn();
  const utils = render(
    <SummaryBar
      spec={SPEC}
      preview={preview(SPEC)}
      editing={{ id: null, name: "north half" }}
      onSaved={onSaved}
      sites={[]}
      onNotice={onNotice}
      {...extra}
    />,
  );
  return { ...utils, onSaved, onNotice };
}

function okFetch(body: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SummaryBar save reports via onNotice", () => {
  it("save-ok fires onNotice with verbatim describeSave text, nothing inline", async () => {
    const mission = { name: "north half" };
    vi.stubGlobal("fetch", okFetch({ mission }));
    const { onNotice } = renderBar();

    fireEvent.click(screen.getByRole("button", { name: "Save new Mission" }));

    const text = describeSave({ mission });
    await waitFor(() => expect(onNotice).toHaveBeenCalledTimes(1));
    expect(onNotice).toHaveBeenCalledWith({
      title: "“north half” is saved.",
      body: text,
      missionName: "north half",
      failed: false,
    });
    // The verbatim text left through onNotice, not into an inline div.
    expect(screen.queryByText(text)).toBeNull();
  });

  it("save-error fires onNotice assertive with the server text, nothing inline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "Store full." }) }),
    );
    const { onNotice } = renderBar();

    fireEvent.click(screen.getByRole("button", { name: "Save new Mission" }));

    await waitFor(() => expect(onNotice).toHaveBeenCalledTimes(1));
    expect(onNotice).toHaveBeenCalledWith({
      title: "Store full.",
      body: "Store full.",
      missionName: "north half",
      failed: true,
    });
    expect(screen.queryByText("Store full.")).toBeNull();
  });

  it("unreachable store fires onNotice assertive", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    const { onNotice } = renderBar();

    fireEvent.click(screen.getByRole("button", { name: "Save new Mission" }));

    await waitFor(() => expect(onNotice).toHaveBeenCalledTimes(1));
    const payload = onNotice.mock.calls[0][0];
    expect(payload.failed).toBe(true);
    expect(payload.missionName).toBe("north half");
    expect(payload.body).toBe("Not saved: boom. Nothing changed.");
    expect(screen.queryByText(payload.body)).toBeNull();
  });

  it("saveProblem guard stays inline beside the disabled control", () => {
    const { onNotice } = renderBar({ spec: { ...SPEC, site: "" } });

    expect(screen.getByText(/^Save: /)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save new Mission" }).hasAttribute("disabled")).toBe(true);
    expect(onNotice).not.toHaveBeenCalled();
  });
});
