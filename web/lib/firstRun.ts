/** First-run step → destination + focus (plan §5 table). Narrow switches the
 *  whole view; wide never switches — the page unfolds the target panel and
 *  moves focus there. `focus` is an opaque anchor key the page maps to a
 *  selector; no copy strings live here (M5 owns copy). */

export type FirstRunStep = "draw" | "site" | "name";

export interface FirstRunDestination {
  view: "map" | "settings" | null;
  focus: FirstRunStep;
}

export function firstRunDestination(step: FirstRunStep, narrow: boolean): FirstRunDestination {
  if (step === "draw") return { view: narrow ? "map" : null, focus: "draw" };
  return { view: narrow ? "settings" : null, focus: step };
}
