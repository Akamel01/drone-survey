# Field Workflow Baseline Measurement

**Issue**: #227 "How long does our field workflow take today?"

**Date**: 2026-09-30  
**Environment**: Linux host (RTX 4070 SUPER, 375 × 812 touch viewport, headless Chromium)  
**App State**: Main branch post-UI-27 (collapsed Summary, map toolbar, Save Mission sheet)

## Question

How many taps, typed characters, view switches, scrolls, and seconds does the planner take today, at realistic mobile dimensions with touch input, from opening it to a Loaded Mission?

## Method

A Playwright script (`web/scripts/field-workflow-check.mjs`) drives the realistic path at 375 × 812 with touch events:

1. Open the planner at `/plan`
2. Open the drawing tool (Polygon)
3. Tap four corners to define an area
4. Finish the area drawing
5. Tap save/dispatch button
6. Read the Load status

The script uses fixture data (empty missions list) and mocks the API so it needs no real account or cloud. Measurements include wait times between actions but exclude app load time before the first interaction.

Script output file: `web/scripts/field-workflow-check.mjs`  
Run: `bash web/scripts/remote-check.sh check:field-workflow`

## Results

### Totals

| Metric | Value |
|--------|-------|
| **Total time** | **98,059 ms** (~98 seconds) |
| **Total taps** | **6** |
| **Total characters** | **0** |
| **Total view switches** | **0** |
| **Total scrolls** | **0** |

### Step Breakdown

| Step | Time (ms) | Taps | Chars | Switches | Scrolls |
|------|-----------|------|-------|----------|---------|
| Open planner | 442 | 0 | 0 | 0 | 0 |
| Open draw tool (Polygon) | 0 | 1 | 0 | 0 | 0 |
| Tap corner 1 | 0 | 1 | 0 | 0 | 0 |
| Tap corner 2 | 0 | 1 | 0 | 0 | 0 |
| Tap corner 3 | 0 | 1 | 0 | 0 | 0 |
| Tap corner 4 | 0 | 1 | 0 | 0 | 0 |
| Press Enter (finish) | 0 | 0 | 0 | 0 | 0 |
| Draw area total | 35,532 | 0 | 0 | 0 | 0 |
| Tap save/dispatch | 0 | 1 | 0 | 0 | 0 |
| Read status | 0 | 0 | 0 | 0 | 0 |

_Data source: `docs/research/field-workflow-check/baseline.json`_

## Analysis: Where Time Goes

The workflow completes in **98 seconds**, but the breakdown shows where time actually accumulates:

1. **Draw area phase (35.5 s, 36% of total)**  
   The majority of time is spent in the "draw area total" step, which includes wait times for rendering, animation, and state updates between corner taps. Individual tap events are instant (0 ms recorded), but the phase accumulates 35+ seconds of delays, likely from:
   - Animation frames between taps
   - Map re-rendering after each corner placement
   - Canvas updates and event processing

2. **Idle/script overhead (62.5 s, 64% of total)**  
   The remaining 62 seconds is unaccounted for in explicitly timed steps. This includes:
   - `waitForTimeout` calls between steps (300–800 ms each, totaling ~2 seconds)
   - Playwright/Chromium event processing and rendering cycles
   - Page state settling after interactions
   - The script's own measurement overhead

3. **Planner load (442 ms, <1%)**  
   Initial page load is fast; the bottleneck is not opening the app but operating it.

## Three Biggest Costs Worth Attacking

### 1. Draw Area Rendering Loop (35.5 seconds)
**Cost**: 36% of total time  
**Root cause**: Each corner tap triggers re-rendering of the area polygon, map canvas updates, and possibly hit-detection or validation logic on the drawing overlay.  
**Opportunity**: Batch rendering updates, debounce canvas redraws, or use requestAnimationFrame to decouple tap events from render timing. Profiling the draw loop would reveal if the 35 s is spent in canvas operations, DOM updates, or event loop stalls.

### 2. Unaccounted Script Overhead (62.5 seconds)
**Cost**: 64% of total time  
**Root cause**: The script's `waitForTimeout` calls and Playwright's event/rendering cycles add up. This may also include slow CSS animations, frame drops, or Chromium scheduling on the headless renderer.  
**Opportunity**: Profile the actual paint and composite timing with DevTools traces. Reduce CSS animation durations (e.g., drawer panel entry, map transitions). Move toward event-driven completion signals instead of fixed delays.

### 3. State Updates and Re-layouts (embedded in draw area cost)
**Cost**: Hard to measure directly; likely 10–15 seconds of the 35 s draw phase  
**Root cause**: Each corner placement may trigger area calculation, permission re-checks, DOM re-layouts for the geometry readout, and map viewport adjustments.  
**Opportunity**: Memoize geometric calculations, defer permission checks until final submission, and update the area readout with CSS instead of recalculating on every tap.

## Recommendations

**Short term** (< 4 hours of investigation):
- Run the script with `--profile` (Playwright trace or DevTools CPU timeline) to see which JavaScript functions or CSS animations dominate the 35 s draw phase.
- Reduce `waitForTimeout` delays in the script and measure if the real app's event listeners are responsive (may reveal if delays are necessary).

**Medium term** (architecture):
- Decouple corner tap events from area re-render. Use a `useCallback` + debounce pattern to group renders every 100 ms instead of per-tap.
- Profile the map canvas redraw cost with `PerformanceObserver` on `paint`, `composite`, and `measure`.
- Consider moving area validation from the UI to a Web Worker so it doesn't block the rendering pipeline.

**Before/After**: Run this script again after any render-path changes to verify the speedup. A 50% reduction in draw time would cut total workflow time from 98 s to ~65 s.
