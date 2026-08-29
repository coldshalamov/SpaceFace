#!/usr/bin/env python3
"""Validate the lightweight Central Brain control plane and its routing invariants."""
from __future__ import annotations

import argparse
import importlib.util
import json
import py_compile
import re
from pathlib import Path

ROOT_MARKER = "CANONICAL_BUILD_MAP.md"
REQUIRED_DOCS = (
    "docs/agentic-development/AGENTIC_GAME_DEVELOPMENT_OS.md",
    "docs/agentic-development/OBSERVABILITY_REPLAY_AND_PLAYTEST_ARCHITECTURE.md",
    "docs/agentic-development/QUALITY_SCORECARD.md",
    "docs/agentic-development/PLAN_CONVERGENCE_PROTOCOL.md",
    "docs/agentic-development/CONTENT_FACTORY_AND_COMPLETENESS.md",
    "docs/agentic-development/INFERENCE_PROTOCOL.md",
    "docs/agentic-development/VISUAL_DIRECTION_AND_VFX_SYSTEM.md",
    "docs/agentic-development/PERFORMANCE_GOVERNANCE.md",
    "docs/agentic-development/IMPLEMENTATION_ROADMAP.md",
    "design/program/CENTRAL_BRAIN.md",
)
REQUIRED_PY = (
    "tools/agentic/manager_cycle.py",
    "tools/agentic/analyze_session.py",
    "tools/agentic/runtime_log_analyzer.py",
    "tools/agentic/inventory_plans.py",
    "tools/agentic/compare_runs.py",
    "tools/agentic/select_next_work.py",
)
REQUIRED_JSON = (
    "design/program/AGENTIC_QUALITY_WORKSTREAMS.json",
    "tools/agentic/scenarios.json",
)
STALE_CANONICAL_PHRASES = (
    "Ordinary `--next` still prefers fleet remaster (`PQ-050`)",
    "That phrase means **`PQ-050`**",
    "Default unfinished campaign is **`PQ-050`**",
)
STALE_PROMPT_PHRASES = (
    "Default unfinished campaign is PQ-050",
    "Each ship: at least five full-job cycles",
    "three subagent reviews that list every",
)


def root_from(start: Path) -> Path:
    p = start.resolve()
    for candidate in (p, *p.parents):
        if (candidate / ROOT_MARKER).exists():
            return candidate
    raise SystemExit(f"cannot find repository root from {start}")


def assert_true(cond: bool, msg: str, failures: list[str]) -> None:
    if not cond:
        failures.append(msg)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", default=".")
    ap.add_argument("--allow-stale-routing", action="store_true", help="diagnostic mode before canonical migration")
    args = ap.parse_args()
    root = root_from(Path(args.root))
    failures: list[str] = []

    for rel in REQUIRED_DOCS:
        assert_true((root / rel).is_file(), f"missing required document: {rel}", failures)
    for rel in REQUIRED_JSON:
        path = root / rel
        assert_true(path.is_file(), f"missing required JSON: {rel}", failures)
        if path.is_file():
            try:
                json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:
                failures.append(f"invalid JSON {rel}: {exc}")
    for rel in REQUIRED_PY:
        path = root / rel
        assert_true(path.is_file(), f"missing Python utility: {rel}", failures)
        if path.is_file():
            try:
                py_compile.compile(str(path), doraise=True)
            except py_compile.PyCompileError as exc:
                failures.append(f"Python compile failed {rel}: {exc.msg}")

    workstreams_path = root / "design/program/AGENTIC_QUALITY_WORKSTREAMS.json"
    scenarios_path = root / "tools/agentic/scenarios.json"
    if workstreams_path.is_file() and scenarios_path.is_file():
        ws_doc = json.loads(workstreams_path.read_text(encoding="utf-8"))
        sc_doc = json.loads(scenarios_path.read_text(encoding="utf-8"))
        ws_ids = [x.get("id") for x in ws_doc.get("workstreams", [])]
        sc_ids = {x.get("id") for x in sc_doc.get("scenarios", [])}
        assert_true(len(ws_ids) == len(set(ws_ids)), "duplicate workstream ids", failures)
        assert_true(None not in sc_ids, "scenario without id", failures)
        for ws in ws_doc.get("workstreams", []):
            for sid in ws.get("scenarios", []):
                assert_true(sid in sc_ids, f"workstream {ws.get('id')} references unknown scenario {sid}", failures)

    canonical = (root / ROOT_MARKER).read_text(encoding="utf-8", errors="replace")
    prompts_path = root / "design/program/AGENT_TASK_PROMPTS.md"
    prompts = prompts_path.read_text(encoding="utf-8", errors="replace") if prompts_path.exists() else ""
    assert_true("design/program/CENTRAL_BRAIN.md" in canonical or "CENTRAL_BRAIN.md" in canonical,
                "canonical build map does not route broad work to Central Brain", failures)
    assert_true("tools/agentic" in canonical,
                "canonical build map does not name agentic selector/tooling", failures)
    if not args.allow_stale_routing:
        for phrase in STALE_CANONICAL_PHRASES:
            assert_true(phrase not in canonical, f"stale canonical routing remains: {phrase}", failures)
        for phrase in STALE_PROMPT_PHRASES:
            assert_true(phrase not in prompts, f"stale generic prompt routing remains: {phrase}", failures)

    central = (root / "design/program/CENTRAL_BRAIN.md").read_text(encoding="utf-8", errors="replace") if (root / "design/program/CENTRAL_BRAIN.md").exists() else ""
    assert_true("not a" in central.lower() and "queue" in central.lower(), "Central Brain must explicitly reject a second queue", failures)
    assert_true("program-queue.json" in central, "Central Brain must point back to canonical PQ authority", failures)

    graphics_path = root / "design/program/GRAPHICS_ITERATION_LOOP.md"
    graphics = graphics_path.read_text(encoding="utf-8", errors="replace") if graphics_path.exists() else ""
    assert_true("Seven passes per model" not in graphics, "graphics fixed seven-pass loop returned", failures)
    assert_true("marginal" in graphics.lower() or "named" in graphics.lower(), "graphics loop lacks bounded marginal-value stop law", failures)

    if failures:
        print("CONTROL_PLANE_INVALID")
        for item in failures:
            print(f"- {item}")
        raise SystemExit(1)
    print("CONTROL_PLANE_VALID")
    print(f"documents={len(REQUIRED_DOCS)} python={len(REQUIRED_PY)} json={len(REQUIRED_JSON)}")


if __name__ == "__main__":
    main()
