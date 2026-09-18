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

Only one run may be in progress at a time (#12): a lock file at
`pipeline/.runner.lock` refuses a second concurrent run; a lock left by a
killed process is cleared automatically once its PID is gone.

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
