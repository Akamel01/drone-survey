"""The Manifest schema: parsing and validation only, no execution.

A Manifest declares a Pipeline's Nodes and the edges between them, as plain
JSON. It has two readers (ADR 0006): the Runner (runner.py) executes it, and
the planned graph view will draw it. Neither belongs here, so this module
never runs a command and never touches a filesystem beyond reading the
Manifest file itself.

Shape:

    {
      "pipeline": "orthomosaic",
      "nodes": [
        {
          "name": "ingest",                  # unique within the Manifest
          "command": ["python3", "n.py", "{out.images}"],
          "outputs": {"images": "images"},   # path relative to the node's own dir
          "placement": "local"               # optional; default "local", see runner.py
        },
        {
          "name": "solve",
          "command": ["python3", "n.py", "{in.images}", "{out.poses}"],
          "inputs": {"images": {"node": "ingest", "output": "images"}},
          "outputs": {"poses": "poses.json"}
        }
      ]
    }

`command` arguments are formatted with `in.<key>` / `out.<key>` resolved to
absolute paths (see `resolve_paths` in runner.py) so a Node's outputs wire
directly into a later Node's inputs. A Node may also carry `"image"`: a
container to run `command` inside, rather than on the host directly.

Nodes run in the order they are listed. An input may only reference a node
named earlier in the list — no forward references, no graph search needed to
execute in order.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

PLACEMENTS = {"local", "remote-3090", "rented"}

# Every key the schema knows. A field nobody reads is a comment, not a schema:
# an unknown key is a typo waiting to be silently ignored (see ADR 0006).
TOP_KEYS = {"pipeline", "inputs", "nodes"}
NODE_KEYS = {"name", "command", "inputs", "outputs", "placement", "image", "env", "notes"}

# {in.images} / {out.poses} — the only placeholders the Runner resolves.
PLACEHOLDER_RE = re.compile(r"\{(in|out)\.([A-Za-z0-9_-]+)\}")


class ManifestError(Exception):
    """Raised with every problem found, not just the first."""


def validate(data: dict) -> list[str]:
    """Return a list of problems; empty means the Manifest is well-formed."""
    errors: list[str] = []
    if not isinstance(data, dict):
        return ["manifest must be a JSON object"]

    for key in data:
        if key not in TOP_KEYS:
            errors.append(f"unknown top-level key '{key}' (known: {sorted(TOP_KEYS)})")

    if not isinstance(data.get("pipeline"), str) or not data["pipeline"]:
        errors.append("'pipeline' must be a non-empty string")

    # Inputs the Pipeline takes from outside itself: a head Node's {in.x} resolves
    # here, so a head Node can declare its input instead of reading an env var.
    pipeline_inputs = data.get("inputs", {})
    if not isinstance(pipeline_inputs, dict) or not all(
        isinstance(k, str) and isinstance(v, str) for k, v in pipeline_inputs.items()
    ):
        errors.append("'inputs' must be a string-to-string object")

    nodes = data.get("nodes")
    if not isinstance(nodes, list) or not nodes:
        errors.append("'nodes' must be a non-empty list")
        return errors  # nothing below is checkable without it

    seen: set[str] = set()
    for i, node in enumerate(nodes):
        where = f"nodes[{i}]"
        if not isinstance(node, dict):
            errors.append(f"{where} must be an object")
            continue

        name = node.get("name")
        if not isinstance(name, str) or not name:
            errors.append(f"{where}: 'name' must be a non-empty string")
            name = None
        elif name in seen:
            errors.append(f"{where}: duplicate node name '{name}'")
        else:
            seen.add(name)

        for key in node:
            if key not in NODE_KEYS:
                errors.append(f"{where} ('{name}'): unknown key '{key}' (known: {sorted(NODE_KEYS)})")

        command = node.get("command")
        if not isinstance(command, list) or not command or not all(isinstance(c, str) for c in command):
            errors.append(f"{where} ('{name}'): 'command' must be a non-empty list of strings")

        env = node.get("env", {})
        if not isinstance(env, dict) or not all(
            isinstance(k, str) and isinstance(v, (str, int, float, bool)) for k, v in env.items()
        ):
            errors.append(f"{where} ('{name}'): 'env' must be a string-to-scalar object")

        if "image" in node and not isinstance(node["image"], str):
            errors.append(f"{where} ('{name}'): 'image' must be a string")

        placement = node.get("placement", "local")
        if placement not in PLACEMENTS:
            errors.append(f"{where} ('{name}'): 'placement' must be one of {sorted(PLACEMENTS)}")

        outputs = node.get("outputs", {})
        if not isinstance(outputs, dict) or not all(isinstance(v, str) for v in outputs.values()):
            errors.append(f"{where} ('{name}'): 'outputs' must be a string-to-string object")
            outputs = {}

        inputs = node.get("inputs", {})
        if not isinstance(inputs, dict):
            errors.append(f"{where} ('{name}'): 'inputs' must be an object")
            continue
        for key, ref in inputs.items():
            if not isinstance(ref, dict) or not isinstance(ref.get("node"), str) or not isinstance(ref.get("output"), str):
                errors.append(f"{where} ('{name}'): input '{key}' must be {{'node': ..., 'output': ...}}")
                continue
            if ref["node"] not in seen:
                errors.append(f"{where} ('{name}'): input '{key}' references unknown or later node '{ref['node']}'")
                continue
            producer = next(n for n in nodes[:i] if n.get("name") == ref["node"])
            if ref["output"] not in producer.get("outputs", {}):
                errors.append(f"{where} ('{name}'): input '{key}' references '{ref['node']}.{ref['output']}', which that node does not output")

        # A placeholder that names nothing is a typo that would otherwise
        # surface on the first run of a long Pipeline, not here.
        if isinstance(command, list):
            for arg in command:
                if not isinstance(arg, str):
                    continue
                for kind, key in PLACEHOLDER_RE.findall(arg):
                    if kind == "in":
                        declared = {**(pipeline_inputs if isinstance(pipeline_inputs, dict) else {}),
                                    **(inputs if isinstance(inputs, dict) else {})}
                    else:
                        declared = outputs if isinstance(outputs, dict) else {}
                    if key not in declared:
                        errors.append(
                            f"{where} ('{name}'): placeholder '{{{kind}.{key}}}' names an undeclared "
                            f"{'input' if kind == 'in' else 'output'}"
                        )
                # A brace group the resolver would choke on: {in.} or {in.a.b}
                for stray in re.findall(r"\{(?:in|out)\.[^}]*\}", arg):
                    if not PLACEHOLDER_RE.fullmatch(stray):
                        errors.append(
                            f"{where} ('{name}'): malformed placeholder '{stray}' "
                            f"(expected {{in.<name>}} or {{out.<name>}})"
                        )

    return errors


def load(path: Path) -> dict:
    """Parse and validate. Raises ManifestError naming every problem found."""
    try:
        data = json.loads(Path(path).read_text())
    except (OSError, json.JSONDecodeError) as e:
        raise ManifestError(f"could not read Manifest {path}: {e}") from e
    errors = validate(data)
    if errors:
        raise ManifestError(f"{path} is not a valid Manifest:\n  " + "\n  ".join(errors))
    return data
