#!/usr/bin/env python3
"""Reduce SpaceFace observability JSON/JSONL into agent-readable quality findings.

Accepts records shaped like sessionObserver output. It is deliberately tolerant of missing
fields so instrumentation can land incrementally. It never upgrades evidence quality; missing
signals are reported as coverage gaps.
"""
from __future__ import annotations
import argparse, json, math
from collections import Counter
from pathlib import Path
from typing import Any


def load_records(path: Path) -> list[dict[str, Any]]:
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        return []
    if text[0] == "[":
        data = json.loads(text)
        return [x for x in data if isinstance(x, dict)]
    records = []
    for n, line in enumerate(text.splitlines(), 1):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as exc:
            raise SystemExit(f"{path}:{n}: invalid JSON: {exc}")
        if isinstance(value, dict): records.append(value)
    return records


def percentile(xs: list[float], q: float) -> float | None:
    if not xs: return None
    ys = sorted(xs)
    pos = (len(ys)-1)*q
    lo, hi = int(math.floor(pos)), int(math.ceil(pos))
    if lo == hi: return ys[lo]
    return ys[lo]*(hi-pos)+ys[hi]*(pos-lo)


def finite(v: Any) -> float | None:
    try:
        f = float(v)
    except (TypeError, ValueError): return None
    return f if math.isfinite(f) else None


def vec2(obj: Any) -> tuple[float,float] | None:
    if not isinstance(obj, dict): return None
    x, z = finite(obj.get("x")), finite(obj.get("z"))
    if x is None or z is None: return None
    return x, z


def reduce(records: list[dict[str, Any]]) -> dict[str, Any]:
    kinds = Counter(r.get("kind", "unknown") for r in records)
    frame_ms, sim_times, speeds, ang_vels = [], [], [], []
    target_changes = 0; target_sentinel = object(); last_target = target_sentinel
    ai_transitions = Counter(); last_ai = {}
    event_counts = Counter(); asset_bad = []; observer_faults = []
    heading_reversals = 0
    last_ang_sign = 0
    first_tick = None; last_tick = None

    for r in records:
        tick = finite(r.get("tick"))
        if tick is not None:
            first_tick = tick if first_tick is None else min(first_tick, tick)
            last_tick = tick if last_tick is None else max(last_tick, tick)
        if r.get("kind") == "frame_perf":
            dt = finite(r.get("frameDt"))
            if dt is not None:
                frame_ms.append(dt*1000 if dt < 2 else dt)
        elif r.get("kind") == "state_sample":
            st = finite(r.get("simTime"));
            if st is not None: sim_times.append(st)
            player = r.get("player") or {}; pose = player.get("pose") or {}
            vel = vec2(pose.get("vel"))
            if vel: speeds.append(math.hypot(*vel))
            av = finite(pose.get("angVel"))
            if av is not None:
                ang_vels.append(av)
                sign = 1 if av > 0.02 else -1 if av < -0.02 else 0
                if sign and last_ang_sign and sign != last_ang_sign: heading_reversals += 1
                if sign: last_ang_sign = sign
            target = player.get("targetId")
            if last_target is not target_sentinel and target != last_target: target_changes += 1
            last_target = target
            intent = r.get("aiIntent")
            if isinstance(intent, dict):
                entity = str(intent.get("entityId", intent.get("id", "global")))
                state = intent.get("tactic", intent.get("state", intent.get("action")))
                if state is not None:
                    if entity in last_ai and last_ai[entity] != state: ai_transitions[entity] += 1
                    last_ai[entity] = state
        elif r.get("kind") == "event_receipt":
            event_counts[str(r.get("type", "unknown"))] += 1
        elif r.get("kind") in {"asset_exposure", "asset_lifecycle"}:
            exposure = r.get("exposure") or {}
            text = json.dumps(exposure, sort_keys=True).lower()
            if any(term in text for term in ["fallback", "invisible", "partial", "missing"]):
                asset_bad.append({"tick": r.get("tick"), "exposure": exposure})
        elif r.get("kind") == "observer_fault":
            observer_faults.append({"tick":r.get("tick"),"message":r.get("message")})

    hitches32 = sum(v > 32 for v in frame_ms)
    hitches100 = sum(v > 100 for v in frame_ms)
    findings = []
    def add(code, severity, summary, evidence):
        findings.append({"code":code,"severity":severity,"summary":summary,"evidence":evidence})
    if hitches100:
        add("PF_LONG_FRAME", "high", f"{hitches100} frames exceeded 100 ms", {"maxMs":max(frame_ms),"p95Ms":percentile(frame_ms,.95)})
    elif hitches32:
        add("PF_HITCH", "medium", f"{hitches32} frames exceeded 32 ms", {"p95Ms":percentile(frame_ms,.95),"p99Ms":percentile(frame_ms,.99)})
    if asset_bad:
        add("VX_ASSET_PUBLICATION", "high", f"{len(asset_bad)} asset exposure records mention fallback/missing/partial/invisible state", asset_bad[:5])
    if heading_reversals >= 8:
        add("FC_ROTATION_OSCILLATION", "medium", f"{heading_reversals} angular-velocity sign reversals observed", {"samples":len(ang_vels)})
    if target_changes >= 8:
        add("CB_TARGET_CHURN", "medium", f"target changed {target_changes} times", {})
    noisy_ai = {k:v for k,v in ai_transitions.items() if v >= 6}
    if noisy_ai:
        add("CB_TACTIC_CHURN", "medium", "high AI tactic/state transition counts", noisy_ai)
    if observer_faults:
        add("OB_OBSERVER_FAULT", "high", f"observer faulted {len(observer_faults)} times; session cannot support acceptance", observer_faults[:5])

    coverage = {
        "hasFrames": bool(frame_ms), "hasState": kinds.get("state_sample",0)>0,
        "hasInputs": kinds.get("applied_input",0)>0, "hasEvents": kinds.get("event_receipt",0)>0,
        "hasAssets": kinds.get("asset_exposure",0)+kinds.get("asset_lifecycle",0)>0,
        "hasHashes": kinds.get("hash_checkpoint",0)>0,
    }
    return {
        "schemaVersion":1, "recordCount":len(records), "kindCounts":dict(kinds),
        "tickRange":[first_tick,last_tick], "coverage":coverage,
        "performance":{"frames":len(frame_ms),"p50Ms":percentile(frame_ms,.5),"p95Ms":percentile(frame_ms,.95),"p99Ms":percentile(frame_ms,.99),"maxMs":max(frame_ms) if frame_ms else None,"hitches32":hitches32,"hitches100":hitches100},
        "motion":{"speedP50":percentile(speeds,.5),"speedP95":percentile(speeds,.95),"angularVelocityP95":percentile([abs(x) for x in ang_vels],.95),"headingReversals":heading_reversals},
        "combat":{"targetChanges":target_changes,"aiTransitions":dict(ai_transitions),"eventCounts":dict(event_counts)},
        "findings":sorted(findings,key=lambda x:{"high":0,"medium":1,"low":2}.get(x["severity"],3)),
    }


def main():
    ap=argparse.ArgumentParser(); ap.add_argument("input"); ap.add_argument("--output"); args=ap.parse_args()
    report=reduce(load_records(Path(args.input)))
    text=json.dumps(report,indent=2)
    if args.output: Path(args.output).write_text(text+"\n",encoding="utf-8")
    else: print(text)
if __name__=="__main__": main()
