# Agentic quality tools

These tools support `design/program/CENTRAL_BRAIN.md`. They do not replace `program-dispatch`, the deterministic lab,
the validation broker, `NOW.md`, or packet receipts.

## Rank current work

```bash
python tools/agentic/manager_cycle.py --refresh --limit 5
python tools/agentic/manager_cycle.py --refresh --limit 1 --format prompt
python tools/agentic/manager_cycle.py --refresh --scope FC --limit 3
```

The result is advisory. It ranks dependency-ready canonical dispatch units using an inspectable quality-leverage model
and attaches the workstream's preferred scenario/evidence requirements.

## Reduce a recorded session

```bash
python tools/agentic/analyze_session.py .devshots/observatory/session.ndjson --output .devshots/observatory/analysis.json
```

The analyzer accepts partial `sessionObserver` JSONL and reports coverage gaps rather than inventing evidence. As more
observability fields land, extend it with detectors only after negative-testing each detector.

## Validate this control plane

```bash
python test/agentic_control_plane_selftest.py
```

The self-test verifies workstream/scenario identity, manager determinism, dependency readiness, ranking stability and
basic analyzer behavior using temporary fixtures. It does not claim gameplay acceptance.
