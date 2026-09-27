# Pipeline

A Pipeline is a **Manifest**: a JSON file naming its Nodes, their commands,
and the edges between them. The **Runner** (`runner.py`) executes one Node
at a time, in the order listed, wiring each Node's outputs into the inputs
of later Nodes that reference them. See ADR 0006 and `docs/design.md` §4.

## Manifest example

Two Nodes of `pipeline/manifests/orthomosaic.json`, unedited — a check fails if
this drifts from the real Manifest, because a documented format is a second copy
of the format.

```json
{
  "pipeline": "orthomosaic",
  "nodes": [
    {
      "name": "ingest",
      "command": [
        "python3",
        "nodes/ingest/ingest.py",
        "--out",
        "{out.images}"
      ],
      "outputs": {
        "images": "images"
      }
    },
    {
      "name": "exif-audit",
      "command": [
        "python3",
        "nodes/exif-audit/exif_audit.py",
        "--in",
        "{in.images}",
        "--out",
        "{out.report}"
      ],
      "inputs": {
        "images": {
          "node": "ingest",
          "output": "images"
        }
      },
      "outputs": {
        "report": "audit.json"
      }
    }
  ]
}
```

`{in.x}` / `{out.x}` resolve to absolute paths under `<workdir>/nodes/<name>/`.
Add `"image": "some-container"` to a Node to run its command in a container.

## Running

```
python3 pipeline/runner.py MANIFEST.json --workdir RUN_DIR
python3 pipeline/runner.py --selftest      # proves the Runner, no real Node needed
```

Per-Node status goes to `RUN_DIR/state.json` after every Node. Re-running the
same Manifest against the same `--workdir` skips Nodes already `done` and
resumes at the first incomplete one. A Node's non-zero exit stops the run
immediately, unmodified, as the Runner's own exit code.

A Node is marked `running` before it starts and `done` or `failed` after, so an
attempt cut off by a crash or a reboot is still known as one. Before a Node
runs, its declared outputs are deleted, so "it exists" afterwards means this run
wrote it. A Node marked `"resumable": true` is the one exception: retried after
its last attempt stopped, it keeps its declared directories -- where it keeps its
progress -- while its declared files are still deleted, so the finished product
is always this attempt's. A changed Manifest resets the state, so nothing ever
resumes from an earlier Manifest's output (#105, #83). `fit-splat` is resumable;
`reconstruct` is not yet, until ODM is shown to resume cleanly from a
half-finished project.

Only one run may be in progress at a time (#12): a lock file at
`pipeline/.runner.lock` refuses a second concurrent run; a lock left by a
killed process is cleared automatically once its PID is gone.

## Re-grade without re-render

The look is decided at Grading, so a look change re-runs the Nodes from
`grade-frames` onward and never the render — the render frame dirs are PNG RGBA
and stay byte-identical. The re-grade is direct Node commands, not the Runner:
a changed Manifest resets the Runner's state (see above), and the point is that
nothing upstream of `grade-frames` runs. The two `--clouds-*` layers are
required with the default `nodes/grade/grade-params.json` (clouds on), exactly
as the Manifest wires them — a re-grade that omits them fails loudly rather
than producing a silent cloudless look:

```
python3 nodes/grade/grade.py \
    --frames-wide <wd>/nodes/render/frames-wide \
    --frames-tall <wd>/nodes/render/frames-tall \
    --sky <wd>/sky.png \
    --clouds-wide <wd>/nodes/render-background/clouds-wide.png \
    --clouds-tall <wd>/nodes/render-background/clouds-tall.png \
    --params nodes/grade/grade-params.json \
    --graded-wide <wd>/nodes/grade-frames/graded-wide \
    --graded-tall <wd>/nodes/grade-frames/graded-tall \
    --out-report <wd>/nodes/grade-frames/grade-report.json
```

Then re-run `interpolate`, `cuts` and `check-showcase` with the same arguments
the Manifest names for them (the RIFE binary is at its host path, not the
image's `/opt/rife`).

The proof that nothing was re-rendered, checkable after the re-grade:

1. Before: `sha256sum` and `stat -c '%n %Y'` of
   `<wd>/nodes/render/frames-{wide,tall}/frame_000.png`.
2. Edit a value in `nodes/grade/grade-params.json` (say `haze`), run the block
   above with `2>&1 | tee <wd>/regrade.log`, then the other three Nodes.
3. After: the same `sha256sum` and `stat` output — the frames were untouched —
   and `grep -ci blender <wd>/regrade.log` prints `0`.
4. `cmp` of `<wd>/nodes/grade-frames/graded-wide/frame_000.png` against
   `.../frame_242.png` (and the tall pair) passes: the cloud pan has a
   242-frame period, so first == last again.
5. `<wd>/nodes/grade-frames/grade-report.json` carries the digest of the params
   file it ran with, and the gate re-checks that digest against the checked-in
   `nodes/grade/grade-params.json`; copy the report aside as the AC2 proof.

`render-background` runs in `drone-render-showcase:blender-5.2.2`, and
`cloud_pass.py` is COPYed into that image by `nodes/render/Dockerfile` — so the
image must be rebuilt before the Runner path can execute `render-background`.
The host run invokes Blender directly and does not need the rebuild.

## Decisions to review

- **JSON, not YAML.** No dependency is named by ADR 0006; reversible.
- **`placement` is declarative, not yet enforced.** ADR 0014's local/3090/rented
  thresholds don't exist yet. A Node may declare `"placement"`; the Runner
  only executes `"local"` until those thresholds are measured.
- **NodeODM delegation isn't wired up.** No real ODM Node is built yet; every
  Node here is "run this command, check its exit code" — the seam NodeODM's
  queue sits behind once that Node exists.
- **Ordering, not a dependency graph.** An input may only reference an
  earlier-listed Node, matching every real Pipeline in `docs/design.md` §4.
