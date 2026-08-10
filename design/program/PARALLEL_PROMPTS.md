<!-- LIFETIME: VOLATILE -->
# Two parallel prompts — copy one into each fresh thread

```yaml
refreshed: 2026-08-09
round: 2
baseCommit: c555f989
expiresAfterCommits: 40
```

**Round 1 is complete and checked off** — `PQ-045.vfx-recipes` and
`PQ-045.tender-client-materialization` are both `state: done` with receipts, and both left the ready
list. The check-off recipe below is the one that worked; do not change it.

Round 2's two units share **zero files**, verified pairwise. Both attack the same complaint from
different angles: the world reads as repetitive. One makes the four Ceres areas structurally
different; the other stops four NPC trades flying the same hull.

**Do not hand out `PQ-019.receiver-facility-reauthor`.** It has ~100 staged files in the working tree
from an agent that is mid-task or stopped there. Leave those files alone entirely.

---

## PROMPT 1 — make the four Ceres areas actually different

```
Work the queue unit PQ-045.route-topology end to end, then check it off. Do not start a second unit.

WHAT: Four Ceres pockets have four different fictions but read as the same back-and-forth.
Measured today: all eight actors use the identical 102/116 WU cardinal marks, six of the eight
routes are 218.000 WU colinear shuttles, and the other two are 154.467 WU right angles. Give each
pocket its own route topology so its fiction is legible from how the traffic moves.

FILES YOU MAY EDIT
  src/data/sectorActivityPockets.js
  test/ceres-active-pockets.test.mjs

RULES
- Ceres must satisfy the no-two-places-share-a-topology rule AGAINST ITSELF before it can serve as
  the propagation template for other sectors. Two pockets matching each other is a failure.
- Derive each topology from that pocket's existing fiction. Do not invent new fictions, and do not
  randomize — a shuffled route is still not a designed one.
- Enforce distinctness IN THE TEST, not in prose. A sibling unit already learned this: asserting
  distinctness in a comment let every trade collapse to the same behaviour unnoticed.
- Do not change actor counts, job kinds, or timings. This is route geometry only.

MUST PASS BEFORE YOU CHECK OFF
  npm run check:baseline
  npm run check:pq020:ceres-topology

Another agent is working PQ-045.npc-identity (src/render/partsLibrary.js, src/systems/traffic.js)
in this same checkout. It touches none of your files. Also: ~100 staged files under
assets/ships/m5_claim_outposts/ belong to a different task — do not revert, clean, stash, or
commit them.

CHECK OFF (all four; this is what stops the task being handed out again)
1. Write design/program/roadmap/receipts/PQ-045-route-topology-REPORT.md saying what changed, what
   passed, what you did NOT prove, and anything you deliberately left out.
2. In design/program/roadmap/program-queue.json find "id": "PQ-045.route-topology" and set BOTH:
       "state": "done"
       "receiptRefs": ["design/program/roadmap/receipts/PQ-045-route-topology-REPORT.md"]
   Setting state without receiptRefs makes the queue schema INVALID and breaks the dispatcher.
3. Verify: node scripts/program-dispatch.mjs --ready
   PQ-045.route-topology must NOT appear as an "id". If it prints "queue schema is invalid" you
   missed receiptRefs. Fix before continuing.
4. Commit ONLY your exact paths, never a bare `git add -A`:
       git commit -m "<message>" -- src/data/sectorActivityPockets.js test/ceres-active-pockets.test.mjs design/program/roadmap/receipts/PQ-045-route-topology-REPORT.md design/program/roadmap/program-queue.json

Finish by reporting DONE or NOT DONE in plain language a non-programmer can read.
```

---

## PROMPT 2 — stop four NPC trades flying the same ship

```
Work the queue unit PQ-045.npc-identity end to end, then check it off. Do not start a second unit.

WHAT: Four occupational NPC families all present as the same hull. Give each its own identity:
  ore_barge, repair_tender, salvage_cutter, survey_pin

FILES YOU MAY EDIT
  src/render/partsLibrary.js
  src/systems/traffic.js
  assets/incubator/npc_activity_pack/

THE TRAP THAT WILL BITE YOU SILENTLY
WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE is keyed by presentationRole, and `hauler` is ALREADY the accepted
helios_span. So the ore barge needs a NEW `ore_carrier` presentationRole PLUS its own TRAFFIC_ROLES
entry. Without both, it silently inherits hauler's ship, team, speed AND the "Cargo Hauler" label —
and nothing reports the failure. Verify each of the four resolves to a DISTINCT hull and a distinct
label at runtime, and assert that in a test rather than in a comment.

RULES
- customs_cutter is deliberately EXCLUDED: it collides with a live hostile archetype.
- assets/incubator/npc_activity_pack/ is a source-only donor pack whose independent review rejects
  wholesale promotion — primitive blockout forms, flat materials, 8 scale deltas, no authored LODs.
  Use it to SELECT and adapt a silhouette. Do not bulk-promote it and do not replace an accepted
  asset with it.
- Do not change job kinds, phase timing, or the job kernel. This is presentation identity only.
- If an authored load fails, assetLoader returns null and partsLibrary substitutes procedural
  geometry — the ship stays VISIBLE, so a broken wire looks like an art problem. Check
  getAuthoredAssetDiagnostic before concluding anything about how something looks.

MUST PASS BEFORE YOU CHECK OFF
  npm run check:baseline
  npm run check:assets:live

Another agent is working PQ-045.route-topology (src/data/sectorActivityPockets.js) in this same
checkout. It touches none of your files. Also: ~100 staged files under
assets/ships/m5_claim_outposts/ belong to a different task — do not revert, clean, stash, or
commit them.

CHECK OFF (all four; this is what stops the task being handed out again)
1. Write design/program/roadmap/receipts/PQ-045-npc-identity-REPORT.md saying what changed, what
   passed, what you did NOT prove, and anything you deliberately left out.
2. In design/program/roadmap/program-queue.json find "id": "PQ-045.npc-identity" and set BOTH:
       "state": "done"
       "receiptRefs": ["design/program/roadmap/receipts/PQ-045-npc-identity-REPORT.md"]
   Setting state without receiptRefs makes the queue schema INVALID and breaks the dispatcher.
3. Verify: node scripts/program-dispatch.mjs --ready
   PQ-045.npc-identity must NOT appear as an "id". If it prints "queue schema is invalid" you
   missed receiptRefs. Fix before continuing.
4. Commit ONLY your exact paths, never a bare `git add -A`:
       git commit -m "<message>" -- src/render/partsLibrary.js src/systems/traffic.js design/program/roadmap/receipts/PQ-045-npc-identity-REPORT.md design/program/roadmap/program-queue.json

Finish by reporting DONE or NOT DONE in plain language a non-programmer can read.
```

---

## The one place they can touch

Both end by editing `design/program/roadmap/program-queue.json` — different entries in the same
file. If the second finisher hits a conflict, it re-reads, re-applies **only its own two fields**,
and commits. It must not revert the other unit's `done`.

## Queue state at `c555f989`

Ready: 12 units, 6 of them implementation.

| Unit | Status for dispatch |
|---|---|
| `PQ-045.route-topology` | **Round 2, prompt 1** |
| `PQ-045.npc-identity` | **Round 2, prompt 2** |
| `PQ-045.prop-promotion` | Free. Collides with cathedral + wreck-dressing on `assets/ships/parts/` |
| `PQ-045.wreck-dressing` | Free. Collides with prop-promotion and both re-authors |
| `PQ-018.cathedral-reauthor` | Free, but collides with every other asset task on the two manifests |
| `PQ-019.receiver-facility-reauthor` | **OCCUPIED** — ~100 staged files in the tree |

`PQ-045.causal-chain` unlocks when route-topology lands. After that only `PQ-045.five-minute-h1`
remains in the cluster, and it needs all five siblings done.
