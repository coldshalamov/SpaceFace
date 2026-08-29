#!/usr/bin/env python3
"""Reduce SpaceFace runtime/witness console logs into structured incident findings.

This is intentionally complementary to analyze_session.py: structured observatory records win
when available; this tool makes existing runtime-witness/GPU-brick/loader logs agent-readable.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

HITCH_RE = re.compile(r"(?:hitch|frame)\D{0,20}(?P<ms>\d+(?:\.\d+)?)\s*ms", re.I)
GPU_BRICK_RE = re.compile(
    r"\[GPU brick\]\s+(?P<phase>\S+)\s+(?P<ms>\d+(?:\.\d+)?)ms"
    r".*?programs\s+(?P<p0>\d+)\s*->\s*(?P<p1>\d+)"
    r".*?geometries\s+(?P<g0>\d+)\s*->\s*(?P<g1>\d+)"
    r".*?textures\s+(?P<t0>\d+)\s*->\s*(?P<t1>\d+)",
    re.I,
)
ASSET_FAIL_RE = re.compile(r"(?:authored composition failed|no substitute visual published|release mode requires|fallback)", re.I)
CONTEXT_RE = re.compile(r"(?:context lost|webgl context|context restore)", re.I)
FRAME_ERROR_RE = re.compile(r"(?:frame error|render error|uncaught|unhandled)", re.I)
STAGE_RE = re.compile(r"\bstage\s+([A-Za-z0-9_-]+)", re.I)
PHASE_RE = re.compile(r"\b(?:phase|owner)\s*[:=]?\s*([A-Za-z0-9_.:-]+)", re.I)


def read_lines(path: Path) -> list[str]:
    try:
        return path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError as exc:
        raise SystemExit(f"cannot read {path}: {exc}")


def analyze(lines: list[str]) -> dict[str, Any]:
    gpu_bricks = []
    hitches = []
    asset_failures = []
    context_events = []
    frame_errors = []
    stages: Counter[str] = Counter()
    phases: Counter[str] = Counter()

    for idx, line in enumerate(lines, 1):
        if m := GPU_BRICK_RE.search(line):
            item = {"line": idx, "phase": m.group("phase"), "ms": float(m.group("ms"))}
            for key in ("p0", "p1", "g0", "g1", "t0", "t1"):
                item[key] = int(m.group(key))
            item.update({
                "programDelta": item["p1"] - item["p0"],
                "geometryDelta": item["g1"] - item["g0"],
                "textureDelta": item["t1"] - item["t0"],
                "text": line.strip()[:1000],
            })
            gpu_bricks.append(item)
        elif m := HITCH_RE.search(line):
            hitches.append({"line": idx, "ms": float(m.group("ms")), "text": line.strip()[:1000]})

        if ASSET_FAIL_RE.search(line):
            asset_failures.append({"line": idx, "text": line.strip()[:1000]})
        if CONTEXT_RE.search(line):
            context_events.append({"line": idx, "text": line.strip()[:1000]})
        if FRAME_ERROR_RE.search(line):
            frame_errors.append({"line": idx, "text": line.strip()[:1000]})
        if m := STAGE_RE.search(line):
            stages[m.group(1)] += 1
        if m := PHASE_RE.search(line):
            phases[m.group(1)] += 1

    all_ms = [x["ms"] for x in hitches] + [x["ms"] for x in gpu_bricks]
    severe = [x for x in all_ms if x >= 100.0]
    multi_second = [x for x in all_ms if x >= 1000.0]
    findings = []
    if multi_second:
        findings.append({"severity": "RED", "kind": "multi_second_freeze", "count": len(multi_second), "maxMs": max(multi_second)})
    elif severe:
        findings.append({"severity": "YELLOW", "kind": "severe_hitch", "count": len(severe), "maxMs": max(severe)})
    if asset_failures:
        findings.append({"severity": "RED", "kind": "asset_publication_or_fallback", "count": len(asset_failures)})
    if context_events:
        findings.append({"severity": "RED", "kind": "webgl_context_event", "count": len(context_events)})
    if frame_errors:
        findings.append({"severity": "RED", "kind": "frame_or_runtime_error", "count": len(frame_errors)})

    return {
        "lineCount": len(lines),
        "performance": {
            "hitchLikeCount": len(all_ms),
            "over100MsCount": len(severe),
            "multiSecondCount": len(multi_second),
            "maxIncidentMs": max(all_ms) if all_ms else None,
            "gpuBricks": gpu_bricks,
            "hitches": hitches,
        },
        "assets": {"failureCount": len(asset_failures), "events": asset_failures},
        "context": {"eventCount": len(context_events), "events": context_events},
        "errors": {"eventCount": len(frame_errors), "events": frame_errors},
        "stageMentions": dict(stages.most_common()),
        "phaseMentions": dict(phases.most_common()),
        "findings": findings,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("log")
    ap.add_argument("--output", default=None)
    ap.add_argument("--pretty", action="store_true")
    args = ap.parse_args()
    result = analyze(read_lines(Path(args.log)))
    text = json.dumps(result, indent=2 if args.pretty or args.output else None)
    if args.output:
        Path(args.output).write_text(text + "\n", encoding="utf-8")
    else:
        print(text)


if __name__ == "__main__":
    main()
