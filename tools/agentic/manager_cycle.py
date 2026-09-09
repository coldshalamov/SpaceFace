#!/usr/bin/env python3
"""Advisory manager for SpaceFace agentic quality convergence.

Reads the canonical program queue; never mutates it. Ranks currently ready units by
player-quality leverage and attaches scenario/evidence obligations from the Central Brain.
If no ready unit matches a requested quality scope, it emits a bounded INFERENCE candidate
rather than creating a second queue.
"""
from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any

ROOT_MARKER = "CANONICAL_BUILD_MAP.md"
QUEUE_REL = Path("design/program/roadmap/program-queue.json")
WORKSTREAM_REL = Path("design/program/AGENTIC_QUALITY_WORKSTREAMS.json")
SCENARIO_REL = Path("tools/agentic/scenarios.json")
NOW_REL = Path("design/program/NOW.md")

STATE_DONE = {"done", "integrated", "historical", "route_accepted", "focused_green"}
BUILD_KINDS = {"implementation", "acceptance_repair", "performance", "integration"}

SEVERITY_TERMS = {
    "invisible": 2.2, "crash": 2.4, "freeze": 2.3, "hitch": 2.0, "stutter": 2.0,
    "broken": 2.0, "wonky": 1.7, "unreadable": 1.8, "fallback": 1.9,
    "combat": 1.55, "flight": 1.65, "performance": 1.7, "visual": 1.25,
    "polish": 0.8, "review": 0.65, "capture": 0.55, "docs": 0.45,
}
EXPOSURE_TERMS = {
    "player": 1.35, "flight": 1.45, "combat": 1.4, "hud": 1.25, "enemy": 1.2,
    "ship": 1.2, "continue": 1.25, "new game": 1.2, "station": 1.05,
    "map": 1.0, "background": 0.85, "rare": 0.75,
}
KIND_MULTIPLIER = {
    "implementation": 1.35, "acceptance_repair": 1.15, "performance": 1.4,
    "integration": 1.05, "acceptance_capture": 0.7, "acceptance_review": 0.65,
    "program_control": 0.55,
}
COST_HINT = {"xs": 1.0, "short": 1.2, "small": 1.3, "medium": 2.0, "long": 3.5, "xl": 5.0}

@dataclass
class Candidate:
    id: str
    parentId: str | None
    title: str
    kind: str
    canonicalPriority: int
    managerScore: float
    workstream: str
    workstreamTitle: str
    scenarios: list[str]
    evidence: list[str]
    paths: list[str]
    checks: list[str]
    reason: str
    stopCondition: str
    brief: str


def find_root(start: Path) -> Path:
    p = start.resolve()
    for candidate in [p, *p.parents]:
        if (candidate / ROOT_MARKER).exists():
            return candidate
    raise SystemExit(f"cannot find repository root containing {ROOT_MARKER} from {start}")


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise SystemExit(f"missing required file: {path}")
    except json.JSONDecodeError as exc:
        raise SystemExit(f"invalid JSON {path}: {exc}")


def ready_units(queue: dict[str, Any]) -> list[dict[str, Any]]:
    units = queue.get("dispatchUnits") or []
    by_id = {u.get("id"): u for u in units if isinstance(u, dict) and u.get("id")}
    result = []
    for u in units:
        if not isinstance(u, dict) or u.get("state") != "ready":
            continue
        deps = u.get("dependsOn") or []
        if all((by_id.get(dep) or {}).get("state") in STATE_DONE for dep in deps):
            result.append(u)
    return result


def tokenize(unit: dict[str, Any]) -> str:
    fields = [unit.get("id", ""), unit.get("title", ""), unit.get("brief", ""),
              " ".join(unit.get("paths") or []), " ".join(unit.get("checks") or [])]
    return " ".join(fields).lower()


def choose_workstream(text: str, workstreams: list[dict[str, Any]]) -> tuple[dict[str, Any], float]:
    best = None
    best_score = -1.0
    for ws in workstreams:
        hits = sum(1 for kw in ws.get("keywords", []) if kw.lower() in text)
        score = hits * float(ws.get("weight", 1.0))
        if score > best_score:
            best, best_score = ws, score
    if best is None:
        best = next(ws for ws in workstreams if ws.get("id") == "CV")
        best_score = 0.0
    return best, best_score


def term_factor(text: str, terms: dict[str, float], default: float = 1.0) -> float:
    values = [weight for term, weight in terms.items() if term in text]
    return max(values, default=default)


def estimate_cost(text: str) -> float:
    for token, value in COST_HINT.items():
        if re.search(rf"\b{re.escape(token)}\b", text):
            return value
    return 1.8


def score_unit(unit: dict[str, Any], ws: dict[str, Any], ws_hits: float) -> float:
    text = tokenize(unit)
    severity = term_factor(text, SEVERITY_TERMS)
    exposure = term_factor(text, EXPOSURE_TERMS)
    leverage = 1.0 + min(ws_hits, 4.0) * 0.12
    kind = KIND_MULTIPLIER.get(unit.get("kind", ""), 0.8)
    cost = estimate_cost(text)
    # Canonical priority remains meaningful. It is a soft tie-breaker, not something this overlay erases.
    priority = max(1, int(unit.get("priority") or 9999))
    canonical = 1.0 + 1.0 / (1.0 + priority / 50.0)
    return severity * exposure * leverage * kind * canonical / cost


def current_dirty_paths(now_text: str) -> set[str]:
    # Advisory only. NOW.md formats have changed; recognize repo-like paths without pretending this is ownership law.
    found = set()
    for match in re.finditer(r"(?<![\w.-])((?:src|assets|styles|scripts|test|tools|design|docs)/[^\s`|,]+)", now_text):
        found.add(match.group(1).rstrip(".;:)"))
    return found


def collides(paths: list[str], dirty: set[str]) -> bool:
    norm = [p.rstrip("/") for p in paths]
    for p in norm:
        for d in dirty:
            if p == d or p.startswith(d + "/") or d.startswith(p + "/"):
                return True
    return False


def build_candidates(root: Path, scope: str | None = None) -> list[Candidate]:
    queue = load_json(root / QUEUE_REL)
    workstream_doc = load_json(root / WORKSTREAM_REL)
    workstreams = workstream_doc["workstreams"]
    scenarios_doc = load_json(root / SCENARIO_REL)
    scenario_ids = {s["id"] for s in scenarios_doc["scenarios"]}
    dirty = current_dirty_paths((root / NOW_REL).read_text(encoding="utf-8") if (root / NOW_REL).exists() else "")
    scope_l = (scope or "").lower().strip()

    candidates: list[Candidate] = []
    for unit in ready_units(queue):
        text = tokenize(unit)
        if scope_l and scope_l not in text:
            # Scope may be a workstream id or keyword; keep units whose workstream matches below.
            pass
        ws, ws_hits = choose_workstream(text, workstreams)
        if scope_l and scope_l not in text and scope_l != ws.get("id", "").lower():
            continue
        paths = list(unit.get("paths") or [])
        score = score_unit(unit, ws, ws_hits)
        collision = collides(paths, dirty)
        if collision:
            score *= 0.2
        ws_scenarios = [s for s in ws.get("scenarios", []) if s in scenario_ids]
        reason_parts = [f"classified {ws['id']} ({ws['title']})"]
        if unit.get("kind") in BUILD_KINDS:
            reason_parts.append("player/product mutation outranks proof-only work")
        if collision:
            reason_parts.append("NOW.md path overlap detected; prefer a disjoint unit unless handed off")
        reason_parts.append(f"canonical unit priority {unit.get('priority')}")
        candidates.append(Candidate(
            id=str(unit.get("id")), parentId=unit.get("parentId"), title=str(unit.get("title", "")),
            kind=str(unit.get("kind", "unknown")), canonicalPriority=int(unit.get("priority") or 9999),
            managerScore=round(score, 4), workstream=ws["id"], workstreamTitle=ws["title"],
            scenarios=ws_scenarios[:4], evidence=list(ws.get("evidence", [])), paths=paths,
            checks=list(unit.get("checks") or []), reason="; ".join(reason_parts),
            stopCondition="Stop after the bounded unit. After two failed repair cycles with the same causal model, record it falsified and return a narrower finding instead of looping.",
            brief=str(unit.get("brief", "")),
        ))
    candidates.sort(key=lambda c: (-c.managerScore, c.canonicalPriority, c.id))
    return candidates


def prompt_for(c: Candidate) -> str:
    scenario_text = ", ".join(c.scenarios) if c.scenarios else "use the packet's narrowest existing scenario"
    evidence_text = ", ".join(c.evidence) if c.evidence else "focused proof"
    parent = c.parentId or c.id.split(".")[0]
    return f"""CENTRAL BRAIN ASSIGNMENT

UNIT: {c.id}
PARENT: {parent}
WORKSTREAM: {c.workstream} — {c.workstreamTitle}
WHY NOW: {c.reason}

Start at CANONICAL_BUILD_MAP.md and design/program/CENTRAL_BRAIN.md. Re-read NOW.md immediately before mutation. Run `node scripts/program-dispatch.mjs --id {parent}` and open the exact unit/packet. Do not create a second queue or framework.

Before mutation, characterize the player-visible defect with: {scenario_text}. Reuse src/testing/lab, runtimeWitness and src/observability before adding instrumentation. Name one causal hypothesis.

Implement only the bounded outcome. Preserve determinism, save/Continue, single writers, Browser/Electron parity and default visual/content quality.

After mutation, replay the same scenario/seed/input policy and compare. Required evidence: {evidence_text}. Keep the change only if the claimed player result improves without a new regression.

{c.stopCondition}

Return DONE/NOT DONE plus the player result, commit, proof, remaining defect, and next executable action.
"""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--refresh", action="store_true", help="validate registries before ranking")
    ap.add_argument("--limit", type=int, default=3)
    ap.add_argument("--scope", default=None, help="substring or workstream id")
    ap.add_argument("--format", choices=["json", "prompt", "table"], default="table")
    args = ap.parse_args()
    root = find_root(Path(args.root))
    if args.refresh:
        # Loading all required documents is the validation. Additional invariants are tested by selftest.py.
        load_json(root / WORKSTREAM_REL)
        load_json(root / SCENARIO_REL)
        load_json(root / QUEUE_REL)
    candidates = build_candidates(root, args.scope)[: max(0, args.limit)]
    if args.format == "json":
        print(json.dumps([asdict(c) for c in candidates], indent=2))
    elif args.format == "prompt":
        if not candidates:
            print("NO_READY_MATCH: run the existing dispatcher or use a bounded INFERENCE 1 task grounded in observed quality debt.")
        else:
            print(prompt_for(candidates[0]))
    else:
        if not candidates:
            print("No ready unit matched the requested scope.")
            return
        print("rank\tscore\tunit\tworkstream\tkind\ttitle")
        for i, c in enumerate(candidates, 1):
            print(f"{i}\t{c.managerScore:.4f}\t{c.id}\t{c.workstream}\t{c.kind}\t{c.title}")

if __name__ == "__main__":
    main()
