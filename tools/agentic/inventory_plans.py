#!/usr/bin/env python3
"""Inventory SpaceFace planning artifacts without creating a second backlog."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Iterable

ROOT_MARKER = "CANONICAL_BUILD_MAP.md"
SCAN_ROOTS = ("design", "docs")
PQ_RE = re.compile(r"\bPQ-\d{3}(?:\.[A-Za-z0-9-]+)?\b")
LIFETIME_RE = re.compile(r"<!--\s*LIFETIME:\s*([A-Z_]+)\s*-->", re.I)
STATUS_RE = re.compile(r"\b(ACTIVE_PACKET|ACTIVE|PARTIAL|FUTURE|HISTORICAL|DRAFT|DONE|READY|PLANNED)\b", re.I)


def find_root(start: Path) -> Path:
    p = start.resolve()
    for candidate in (p, *p.parents):
        if (candidate / ROOT_MARKER).exists():
            return candidate
    raise SystemExit(f"cannot find {ROOT_MARKER} from {start}")


def markdown_files(root: Path) -> Iterable[Path]:
    for rel in SCAN_ROOTS:
        base = root / rel
        if not base.exists():
            continue
        yield from (p for p in base.rglob("*.md") if p.is_file())


def classify(rel: str, text: str, lifetime: str | None) -> str:
    low = rel.lower()
    if rel == "CANONICAL_BUILD_MAP.md":
        return "FRONT_DOOR"
    if low.endswith("plan_registry.md"):
        return "REGISTRY"
    if "/roadmap/active/" in low:
        return "ACTIVE_PACKET"
    if "/receipts/" in low or "acceptance" in low:
        return "EVIDENCE"
    if "handoff" in low:
        return "HANDOFF"
    if lifetime == "HISTORICAL" or "historical" in low or "archive" in low:
        return "HISTORICAL"
    if lifetime == "GENERATED":
        return "GENERATED"
    if lifetime == "VOLATILE":
        return "VOLATILE_STATUS"
    if "method" in low or "protocol" in low or "standard" in low:
        return "DURABLE_METHOD"
    if "vision" in low or "brainstorm" in low or "experiment" in text[:3000].lower():
        return "EXPERIMENT_BANK"
    return "SUPPORTING_PLAN"


def record_for(root: Path, path: Path) -> dict:
    text = path.read_text(encoding="utf-8", errors="replace")
    rel = path.relative_to(root).as_posix()
    lm = LIFETIME_RE.search(text[:1000])
    lifetime = lm.group(1).upper() if lm else None
    title = ""
    for line in text.splitlines()[:30]:
        if line.startswith("# "):
            title = line[2:].strip()
            break
    pq_ids = sorted(set(PQ_RE.findall(text)))
    statuses = sorted({m.group(1).upper() for m in STATUS_RE.finditer(text[:8000])})
    warnings = []
    if lifetime == "STABLE" and re.search(r"\b(?:branch|HEAD|commit)\s*[:=]", text[:2500], re.I):
        warnings.append("stable_file_may_contain_volatile_revision_fact")
    if "seven passes per model" in text.lower() or "five-plus full-job cycles" in text.lower():
        warnings.append("fixed_iteration_quota_present")
    if "second queue" in text.lower() and "do not" not in text.lower():
        warnings.append("possible_parallel_queue_language")
    return {
        "path": rel,
        "title": title,
        "lifetime": lifetime,
        "classification": classify(rel, text, lifetime),
        "pqIds": pq_ids,
        "statusTokens": statuses,
        "warnings": warnings,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", default=".")
    ap.add_argument("--format", choices=("json", "table"), default="table")
    ap.add_argument("--warnings-only", action="store_true")
    args = ap.parse_args()
    root = find_root(Path(args.root))
    records = [record_for(root, p) for p in markdown_files(root)]
    records.sort(key=lambda r: r["path"])
    if args.warnings_only:
        records = [r for r in records if r["warnings"]]
    if args.format == "json":
        print(json.dumps({"root": str(root), "count": len(records), "records": records}, indent=2))
        return
    print("classification\tlifetime\tpqs\twarnings\tpath")
    for r in records:
        print(f"{r['classification']}\t{r['lifetime'] or '-'}\t{','.join(r['pqIds'][:6]) or '-'}\t{','.join(r['warnings']) or '-'}\t{r['path']}")


if __name__ == "__main__":
    main()
