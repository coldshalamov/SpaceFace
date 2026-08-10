<!-- LIFETIME: VOLATILE -->
# Two parallel prompts — copy one into each fresh thread

```yaml
refreshed: 2026-08-09
baseCommit: b2a94ac1
expiresAfterCommits: 40
```

These two units share **zero files**, verified pairwise against the queue. Run them at the same time.
Each ends by checking itself off, so the dispatcher stops handing it out.

**The check-off block is the point.** It was tested end-to-end: writing the receipt and flipping the
two fields removes the unit from `--ready` (13 → 12) and keeps the queue schema valid. Setting
`state: done` **without** a `receiptRefs` entry makes the queue schema-invalid and the whole
dispatcher stops working — which is why units have been going un-checked-off and reappearing.

---

## PROMPT 1 — visual effects

```
Work the queue unit PQ-045.vfx-recipes end to end, then check it off. Do not start a second unit.

WHAT: Port five finished VFX NEXT recipes into the live effect system.
  impact_concussion, destruction_light, massline_latch, massline_tension, massline_release

ONLY FILE YOU MAY EDIT: src/render/vfx.js

RULES
- Recipes only. No code from src/vfxnext/ ships, and its LightPool does not travel.
- Port them against the LIVE pools and the existing _flashLight().
- speed_extreme is REJECTED and out of scope: velocityLanguage.js owns speed language and its one
  sanctioned exceptional-speed output is already spent.
- EVENT_LIGHT_POOL_SIZE = 6 is a hard ceiling AND a shader cache key that precompile.js must match.
- Three recorded invisible-effect traps: a reversed smoothstep is undefined; RingGeometry UVs are
  planar; cross + cameraPosition billboarding yields NaN.
- Do not reduce any quality setting to buy performance.

MUST PASS BEFORE YOU CHECK OFF
  npm run check:baseline
  npm run check:presentation

Another agent is working PQ-045.tender-client-materialization in this same checkout. It touches
none of your files. Do not revert, clean, stash, or commit anything outside src/render/vfx.js.

CHECK OFF (do all four; this is what stops the task being handed out again)
1. Write design/program/roadmap/receipts/PQ-045-vfx-recipes-REPORT.md saying what changed, what
   passed, what you did NOT prove, and anything you deliberately left out.
2. In design/program/roadmap/program-queue.json find the unit with "id": "PQ-045.vfx-recipes" and
   set BOTH fields together:
       "state": "done"
       "receiptRefs": ["design/program/roadmap/receipts/PQ-045-vfx-recipes-REPORT.md"]
   Setting state without receiptRefs makes the queue schema INVALID and breaks the dispatcher.
3. Verify it worked:
       node scripts/program-dispatch.mjs --ready
   PQ-045.vfx-recipes must NOT appear as an "id" in the output. If the command prints
   "queue schema is invalid", you missed receiptRefs. Fix it before continuing.
4. Commit ONLY your exact paths, never a bare `git add -A`:
       git commit -m "<message>" -- src/render/vfx.js design/program/roadmap/receipts/PQ-045-vfx-recipes-REPORT.md design/program/roadmap/program-queue.json

Finish by reporting DONE or NOT DONE in plain language a non-programmer can read.
```

---

## PROMPT 2 — the missing disabled ship

```
Work the queue unit PQ-045.tender-client-materialization end to end, then check it off. Do not start
a second unit.

WHAT: The Pitborn repair tender flies out to service a disabled ship that does not exist.
activity:disabled-hull is the one route reference claiming a physical service client with no live
object. Make it real.

FILES YOU MAY EDIT
  src/data/sectorActivityPockets.js
  src/systems/factionPresence.js
  src/systems/npcJobsRuntime.js
  src/systems/world.js
  scripts/lib/ceresFiveMinuteAcceptance.mjs
  test/ceres-active-pockets.test.mjs
  test/ceres-activity-faction-tender.test.mjs
  test/ceres-activity-runtime-lifecycle.test.mjs
  test/ceres-five-minute-acceptance.test.mjs

RULES
- Add ONE stable disabled-hull object authority. Single writer.
- Preserve the tender's exact targetRef through its factionPresence job projection AND through
  save/Continue. A restored ship must still be servicing the same client.
- Materialize and bind through world; steer the tender to a safe berth through the EXISTING job
  owner. Do not write a parallel steering path.
- Update the fixed five-minute object census to include it.
- Do NOT touch the seven other activity:* marks. They are abstract scan/throughline/perimeter
  choreography, not missing entities.

MUST PASS BEFORE YOU CHECK OFF
  node --test test/ceres-active-pockets.test.mjs test/ceres-activity-faction-tender.test.mjs test/ceres-activity-runtime-lifecycle.test.mjs test/ceres-five-minute-acceptance.test.mjs
  npm run check:pq020:ceres-topology
  npm run check:baseline

Another agent is working PQ-045.vfx-recipes (src/render/vfx.js) in this same checkout. It touches
none of your files. Do not revert, clean, stash, or commit anything outside your list above.

CHECK OFF (do all four; this is what stops the task being handed out again)
1. Write design/program/roadmap/receipts/PQ-045-tender-client-materialization-REPORT.md saying what
   changed, what passed, what you did NOT prove, and anything you deliberately left out.
2. In design/program/roadmap/program-queue.json find the unit with
   "id": "PQ-045.tender-client-materialization" and set BOTH fields together:
       "state": "done"
       "receiptRefs": ["design/program/roadmap/receipts/PQ-045-tender-client-materialization-REPORT.md"]
   Setting state without receiptRefs makes the queue schema INVALID and breaks the dispatcher.
3. Verify it worked:
       node scripts/program-dispatch.mjs --ready
   PQ-045.tender-client-materialization must NOT appear as an "id" in the output. If the command
   prints "queue schema is invalid", you missed receiptRefs. Fix it before continuing.
4. Commit ONLY your exact paths, never a bare `git add -A`:
       git commit -m "<message>" -- <your edited files> design/program/roadmap/receipts/PQ-045-tender-client-materialization-REPORT.md design/program/roadmap/program-queue.json

Finish by reporting DONE or NOT DONE in plain language a non-programmer can read.
```

---

## One collision to expect

Both prompts end by editing `design/program/roadmap/program-queue.json` — different units inside the
same file. If the second finisher hits a conflict, it re-reads the file, re-applies **only its own
two fields**, and commits. It must not revert the other unit's `done`.

## What comes next

After PROMPT 2 lands, `PQ-045.route-topology` unlocks (it genuinely shares
`sectorActivityPockets.js`, the one real dependency in the cluster). Five more implementation units
are already free and need no waiting: `PQ-045.npc-identity`, `PQ-045.prop-promotion`,
`PQ-045.wreck-dressing`, `PQ-018.cathedral-reauthor`, and `PQ-019.receiver-facility-reauthor` —
though PQ-019 had an agent working it as of `b2a94ac1`.
