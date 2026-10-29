#!/usr/bin/env python3
"""Attach hasaneyldrm/exercises-dataset target muscles to Body OS canonical IDs.

The dataset (23k stars, media (c) Gym Visual, text/metadata MIT per its NOTICE) already
classifies every exercise by a fine-grained `target` muscle. Alternatives are then chosen
by sharing that target, not by name heuristics.
Usage: python3 scripts/build_muscle_targets.py --dataset exercises.json
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PREFIX = "export const EXERCISE_REFERENCES = "


def references() -> dict:
    for line in (ROOT / "core.js").read_text().splitlines():
        if line.startswith(PREFIX):
            return json.loads(line[len(PREFIX):].rstrip().rstrip(";"))
    raise SystemExit("EXERCISE_REFERENCES not found")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", required=True)
    args = parser.parse_args()
    dataset = {str(item["id"]): item for item in json.loads(Path(args.dataset).read_text())}
    out = {}
    for canonical_id, ref in sorted(references().items()):
        item = dataset.get(str(ref.get("datasetId", "")))
        if not item:
            continue
        out[canonical_id] = {"datasetId": item["id"], "target": item["target"], "secondary": item.get("secondary_muscles", []), "datasetEquipment": item["equipment"]}
    payload = {"schemaVersion": "body.os.muscle-targets.v1", "source": "https://github.com/hasaneyldrm/exercises-dataset", "count": len(out), "items": out}
    (ROOT / "catalog" / "muscle-targets.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n")
    print(len(out), "mapped")


if __name__ == "__main__":
    main()
