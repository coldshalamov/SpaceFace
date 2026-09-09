#!/usr/bin/env python3
"""Compare two agentic session summaries without pretending every field is a gate."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

DEFAULT_METRICS = (
    "performance.p50Ms",
    "performance.p95Ms",
    "performance.p99Ms",
    "performance.hitches32Ms",
    "performance.hitches100Ms",
    "performance.maxFrameMs",
    "motion.reversalTimeSec",
    "motion.brakeSettleSec",
    "motion.headingReversals",
    "combat.targetChanges",
    "combat.tacticChanges",
    "combat.blockedActionRepeats",
    "assets.fallbackCount",
    "assets.missingRequiredVisualCount",
    "observer.droppedRecordCount",
    "observer.observerFaultCount",
)


def load(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"cannot load {path}: {exc}")
    if not isinstance(value, dict):
        raise SystemExit(f"summary must be a JSON object: {path}")
    return value


def get_path(obj: dict[str, Any], dotted: str) -> Any:
    cur: Any = obj
    for part in dotted.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    return cur


def numeric(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def compare_metric(name: str, base: Any, cand: Any) -> dict[str, Any]:
    b = numeric(base)
    c = numeric(cand)
    out: dict[str, Any] = {"metric": name, "baseline": base, "candidate": cand}
    if b is None or c is None:
        out["delta"] = None
        out["deltaPct"] = None
        out["comparable"] = False
        return out
    delta = c - b
    pct = None if b == 0 else delta / abs(b) * 100.0
    out.update({"delta": round(delta, 6), "deltaPct": None if pct is None else round(pct, 3), "comparable": True})
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("baseline")
    ap.add_argument("candidate")
    ap.add_argument("--metric", action="append", default=[], help="dotted metric path; repeatable")
    ap.add_argument("--format", choices=("json", "table"), default="table")
    args = ap.parse_args()

    baseline = load(Path(args.baseline))
    candidate = load(Path(args.candidate))
    metrics = tuple(args.metric) or DEFAULT_METRICS
    rows = [compare_metric(m, get_path(baseline, m), get_path(candidate, m)) for m in metrics]

    hashes = {
        "baseline": get_path(baseline, "determinism.finalHash") or baseline.get("finalHash"),
        "candidate": get_path(candidate, "determinism.finalHash") or candidate.get("finalHash"),
    }
    determinism_match = None if None in hashes.values() else hashes["baseline"] == hashes["candidate"]
    result = {
        "baseline": str(Path(args.baseline)),
        "candidate": str(Path(args.candidate)),
        "determinism": {**hashes, "match": determinism_match},
        "metrics": rows,
    }

    if args.format == "json":
        print(json.dumps(result, indent=2))
        return

    print(f"determinism_match\t{determinism_match}")
    print("metric\tbaseline\tcandidate\tdelta\tdelta_pct")
    for row in rows:
        print(f"{row['metric']}\t{row['baseline']}\t{row['candidate']}\t{row['delta']}\t{row['deltaPct']}")


if __name__ == "__main__":
    main()
