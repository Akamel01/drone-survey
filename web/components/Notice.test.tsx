import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Notice, { type NoticePayload } from "./Notice";

const success: NoticePayload = {
  title: "Dispatched",
  body: "Dispatched. Two Cards reserved for site S.",
  missionName: "north half",
  failed: false,
  key: 1,
};

const failure: NoticePayload = {
  title: "Not saved",
  body: "Not saved: the store could not be reached. Nothing changed.",
  missionName: "north half",
  failed: true,
  key: 2,
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("Notice", () => {
  it("success renders role=status expanded, then collapses and leaves on its own", () => {
    const onDismiss = vi.fn();
    render(<Notice payload={success} onDismiss={onDismiss} />);

    // Expanded on arrival: Mission name + full body, no compact title.
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("north half")).toBeTruthy();
    expect(screen.getByText(/Two Cards reserved/)).toBeTruthy();

    // ~4s expanded, then compact (first sentence + ellipsis, body gone).
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.getByText("Dispatched…")).toBeTruthy();
    expect(screen.queryByText(/Two Cards reserved/)).toBeNull();
    expect(onDismiss).not.toHaveBeenCalled();

    // Brief beat later the Notice leaves by itself.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("supersede resets the success timer", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<Notice payload={success} onDismiss={onDismiss} />);

    vi.advanceTimersByTime(3000);
    rerender(<Notice key={3} payload={{ ...success, key: 3 }} onDismiss={onDismiss} />);

    // 3000ms of the old timer + 2000ms of the new one: still expanded.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByText("Dispatched…")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText("Dispatched…")).toBeTruthy();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("failure renders role=alert, never leaves on its own, X dismisses", () => {
    const onDismiss = vi.fn();
    render(<Notice payload={failure} onDismiss={onDismiss} />);

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText(/store could not be reached/)).toBeTruthy();

    vi.advanceTimersByTime(30000);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("tap toggles compact/expanded without timers involved", () => {
    const onDismiss = vi.fn();
    render(<Notice payload={failure} onDismiss={onDismiss} />);
    const node = screen.getByRole("alert");

    fireEvent.click(node);
    expect(screen.getByText("Not saved…")).toBeTruthy();
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.click(node);
    expect(screen.getByText(/store could not be reached/)).toBeTruthy();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("identical-text key change remounts so the failure re-announces", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<Notice payload={failure} onDismiss={onDismiss} />);

    // Collapse it, then deliver the same words again under a new key.
    fireEvent.click(screen.getByRole("alert"));
    expect(screen.getByText("Not saved…")).toBeTruthy();

    rerender(<Notice key={9} payload={{ ...failure, key: 9 }} onDismiss={onDismiss} />);
    expect(screen.getByText(/store could not be reached/)).toBeTruthy();
  });

  it("Escape dismisses and returns focus to the opener", () => {
    const onDismiss = vi.fn();
    const opener = document.createElement("button");
    opener.textContent = "Dispatch";
    document.body.appendChild(opener);
    opener.focus();

    render(<Notice payload={failure} onDismiss={onDismiss} />);
    // Toggle focus away first so the test proves focus actually returns.
    (screen.getByRole("button", { name: "Dismiss" }) as HTMLElement).focus();
    expect(document.activeElement).not.toBe(opener);

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(opener);
  });

  it("Escape with opener gone focuses Notice fallback instead of no-op body", () => {
    const onDismiss = vi.fn();
    const opener = document.createElement("button");
    opener.textContent = "Dispatch";
    document.body.appendChild(opener);
    opener.focus();

    render(<Notice payload={failure} onDismiss={onDismiss} />);
    // Opener removed (or disabled post-async): fallback must take focus.
    opener.remove();

    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole("alert"));
  });

  it("Escape while a native dialog is open closes the sheet only, never the Notice", () => {
    const onDismiss = vi.fn();
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    document.body.appendChild(dialog);

    render(<Notice payload={failure} onDismiss={onDismiss} />);
    fireEvent.keyDown(document.body, { key: "Escape" });

    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("renders nothing without a payload", () => {
    const { container } = render(<Notice payload={null} onDismiss={() => {}} />);
    expect(container.innerHTML).toBe("");
  });
});
