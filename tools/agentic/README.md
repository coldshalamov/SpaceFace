# Agentic quality tools

These tools support `CANONICAL_BUILD_MAP.md`, `design/program/CENTRAL_BRAIN.md`, and the durable architecture under `docs/agentic-development/`. They do not replace `program-dispatch`, the deterministic lab, validation broker, `NOW.md`, PQ packets, or receipts.

## Select and rank current work

```bash
python tools/agentic/select_next_work.py --format prompt
python tools/agentic/manager_cycle.py --refresh --limit 5
python tools/agentic/manager_cycle.py --refresh --scope FC --limit 3
```

`manager_cycle.py` ranks **dependency-ready existing PQ dispatch units** using an inspectable quality-leverage model. It never edits `program-queue.json`. `select_next_work.py` is only a thin one-unit entrypoint over that same selector; it does not maintain separate readiness state.

Use exact `program-dispatch --id PQ-XXX` when the user already named the outcome.

## Inventory planning artifacts

```bash
python tools/agentic/inventory_plans.py --format table
python tools/agentic/inventory_plans.py --warnings-only --format json
```

This is navigation/deduplication support, not a backlog. It classifies plans/packets/evidence by role and highlights likely stale/fixed-quota/authority problems for inspection.

## Reduce structured observatory sessions

```bash
python tools/agentic/analyze_session.py .devshots/observatory/session.ndjson \
  --output .devshots/observatory/analysis.json
```

The analyzer accepts partial `sessionObserver` records and reports missing coverage rather than inventing evidence. Extend detectors only after negative-testing/calibration.

## Reduce existing runtime/witness logs

```bash
python tools/agentic/runtime_log_analyzer.py runtime.log --pretty
```

This extracts hitch/GPU-brick, asset-publication/fallback, WebGL-context and frame/runtime incidents from the log formats already used by SpaceFace. Structured observatory records take precedence when available.

## Compare matched runs

```bash
python tools/agentic/compare_runs.py baseline.json candidate.json
python tools/agentic/compare_runs.py baseline.json candidate.json --format json
```

This produces deltas for common performance/motion/combat/asset/observer metrics and reports deterministic-hash agreement when present. It deliberately does not decide KEEP/REVERT from one opaque score.

## Validate the Central Brain control plane

```bash
python tools/agentic/validate_control_plane.py
python test/agentic_control_plane_selftest.py
node scripts/check-program-docs.mjs
```

`validate_control_plane.py` checks required recovered docs/tools/registries, Python syntax, Central Brain front-door routing, stale PQ-050-default phrases, and graphics stopping-law regressions. The fixture self-test checks dependency readiness, manager determinism/ranking stability, workstream/scenario integrity and basic analyzer findings.

These checks validate the **control plane**, not gameplay acceptance.

## Evidence philosophy

- LLMs explore and diagnose; deterministic replays remember/regress.
- Screenshots prove appearance, not temporal control/AI/performance truth.
- `runtimeWitness` is the cheap liveness/performance tripwire; `sessionObserver` is the richer synchronized record as it is wired.
- Same scenario/seed/input policy should be retained across before/after comparisons when applicable.
- A detector is advisory until it has been calibrated against seeded positive/negative cases.
- Never rerun an unchanged candidate/harness/environment/failure fingerprint.
