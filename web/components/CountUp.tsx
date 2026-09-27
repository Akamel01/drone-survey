"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { countValue } from "@/lib/count";

// The open signal must paint its first frame (0) *before* the browser paints,
// or the final value flashes for one frame first. Layout effect on the client;
// plain effect on the server, where it does nothing — the same hook on every
// render of an environment.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

// Matches --dur-count (globals.css:32). Read as a constant: getComputedStyle
// per open would be work without a knob anyone turns.
const DURATION_MS = 900;

interface CountUpProps {
  value: number;
  decimals?: number;
  /** The open signal. It is the only thing that starts the count; a value edit
   *  never does. Omitted = render the final value, never animate. */
  countKey?: string | number;
  className?: string;
}

/** A figure that counts from 0 to `value` over 900ms when its `countKey`
 *  changes (a Mission opening), and writes the final value in one frame for
 *  every other reason the value moves (slider edits, name changes). */
export default function CountUp({ value, decimals = 0, countKey, className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const valueRef = useRef(value);
  const animating = useRef(false);

  // Latest value, so an animation already in flight ends on it.
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // The open signal: count up once per new countKey.
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    animating.current = false;
    const finish = () => {
      el.textContent = valueRef.current.toFixed(decimals);
    };

    if (countKey === undefined) {
      finish();
      return;
    }
    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // offsetParent is null when no layout box exists — the phone's Missions
    // view hides the Summary with display:none, so there is nothing to animate.
    if (reduced || el.offsetParent === null) {
      finish();
      return;
    }

    animating.current = true;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      el.textContent = countValue(valueRef.current, t).toFixed(decimals);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
        return;
      }
      finish();
      animating.current = false;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      animating.current = false;
    };
  }, [countKey, decimals]);

  // Any other change writes the final value immediately — never restart the count.
  useEffect(() => {
    const el = ref.current;
    if (!el || animating.current) return;
    el.textContent = value.toFixed(decimals);
  }, [value, decimals]);

  return (
    <span ref={ref} className={className}>
      {value.toFixed(decimals)}
    </span>
  );
}
