<!-- LIFETIME: VOLATILE -->
# Inference ledger — human view over `inference-memory.json`

**Two doors**

| Door | Who decides the unit | Execution |
|---|---|---|
| `NEXT` / PQ | the admitted program | dispatch one packet unit |
| `INFERENCE N` | the agent, inside user scope | build N sequential production slices |

`INFERENCE` is not a request to create a queue, acceptance campaign, review portfolio, or candidate
archive. Follow [`INFERENCE_LANES.md`](./INFERENCE_LANES.md).

The detector is advisory and is run at most once at task entry:

```bash
node scripts/inference-detect.mjs
node scripts/inference-detect.mjs --scope=NPCS
node scripts/inference-detect.mjs --out=design/program/INFERENCE_DETECT_LAST.json
```

Do not pass the user's requested production-unit count to the detector. The user's `N` is the task
termination target; the detector only suggests a domain/mode.

## Memory

The machine memory at `design/program/inference-memory.json` preserves recent runs, shipped or
implemented units, rejected ideas, fingerprints, and reference use. Never hand-edit it.

Record the run once:

```bash
node scripts/inference-record.mjs run \
  --mode starved --domains WF-13 --scope AUDIO --nx 20 \
  --note "20-unit production target; sequential execution"
```

Record every completed production unit after its commit:

```bash
node scripts/inference-record.mjs unit \
  --id refinery-shift-whistle --wf WF-13 --mode starved \
  --verdict implemented --verification focused_green \
  --commit abc1234 \
  --reason "refinery gains a live shift-change audio identity" \
  --fp "verb=hear,subject=refinery,sector=ceres,layer=midground,tempo=ambient,domain=wf-13"
```

Promote to `accepted` only with current route evidence:

```bash
node scripts/inference-record.mjs unit \
  --id refinery-shift-whistle --wf WF-13 --mode starved \
  --verdict accepted --verification route_accepted \
  --commit abc1234 --evidence design/program/receipts/refinery-shift-route.md \
  --reason "ordinary Ceres route exposes the authored shift-change cue" \
  --fp "verb=hear,subject=refinery,sector=ceres,layer=midground,tempo=ambient,domain=wf-13"
```

A separate review file is optional. It never gates recording an implemented unit.

Rejected/cut units still need a causal root reason so future runs do not resurrect the same premise:

```bash
node scripts/inference-record.mjs unit \
  --id gravity-toll --wf WF-05 --mode repair \
  --verdict cut --reason "redundant with mass seed" \
  --root-reason "no new tactic; overlaps existing tool" \
  --fp "verb=push,subject=chokepoint,sector=any,domain=wf-05"
```

Fingerprint axes are `verb, subject, sector, layer, tempo, domain`; provide at least three.

## Concurrency

Commit the memory update with the production slice when practical. On conflict, re-read and rerun the
record command. Never discard another unit's entries.

## Current status

Run `node scripts/inference-detect.mjs`. This file intentionally carries no queue snapshot or
completion history.
