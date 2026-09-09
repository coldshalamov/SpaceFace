<!-- LIFETIME: VOLATILE -->
# Two parallel prompts — copy one into each fresh thread

```yaml
refreshed: 2026-08-09
round: 3
expiresAfterCommits: 40
```

**Rounds 1 and 2 checked off correctly.** `PQ-045.vfx-recipes`,
`PQ-045.tender-client-materialization` and `PQ-045.route-topology` are `state: done` with receipts
and all left the ready list. `PQ-045.npc-identity` was still in flight at the time of writing. The
check-off recipe below is the proven one; do not change it.

**One hard sequencing rule this round:** `PQ-045.causal-chain` and `PQ-045.npc-identity` both own
`src/systems/traffic.js`. Prompt 1 opens by verifying npc-identity is checked off, and waits if it
is not. Prompt 2 is unaffected and can start immediately either way.

**Do not hand out `PQ-019.receiver-facility-reauthor`.** ~100 staged files from another task sit in
the working tree under `assets/ships/m5_claim_outposts/`. Leave them alone.

---

## PROMPT 1 — make the world do things to itself

```
Work the queue unit PQ-045.causal-chain end to end, then check it off. Do not start a second unit.

FIRST, CHECK YOU ARE CLEAR TO START:
  node -e "const q=require('./design/program/roadmap/program-queue.json');console.log(q.dispatchUnits.find(u=>u.id==='PQ-045.npc-identity').state)"
If that prints anything other than "done", STOP AND WAIT. PQ-045.npc-identity owns
src/systems/traffic.js, which you also need. Do not work around it, do not edit the file anyway,
and do not take a different unit. Re-check in a few minutes.

WHAT: Implement the first six ambient microevents as ONE causal chain, so the world visibly acts on
itself instead of each NPC running a private errand.
  ev_rich_seam_strike, ev_miner_calls_hauler, ev_patrol_scans_suspect,
  ev_disabled_hauler_recovery, ev_tender_services_miner, ev_cutter_strips_wreck

FILES YOU MAY EDIT
  src/systems/traffic.js
  design/incubator/microevent_library/

RULES
- Cap concurrent authored events at TWO. Not a suggestion — a busy sky reads as noise, not life.
- CHOREOGRAPHY-TIMER SCOPE ONLY. If you find yourself needing a concurrency, cooldown, or chain
  POLICY layer, STOP AND REPORT rather than building it. That is the moment a bounded adapter turns
  into a global framework, and it is explicitly out of scope for this unit.
- design/incubator/microevent_library/INTEGRATION.md already names the one runner this wiring
  needs, and the catalog is schema-validated. Read it before designing anything new.
- The library is data that nothing imports yet. You are its first consumer — if the data shape
  fights the wiring, say so in the receipt instead of quietly reshaping 58 events.
- Do not change job kinds, phase timing, or the job kernel.

MUST PASS BEFORE YOU CHECK OFF
  npm run check:baseline

Another agent is working PQ-045.wreck-dressing (Blender asset trees) in this same checkout. It
touches none of your files. Also: ~100 staged files under assets/ships/m5_claim_outposts/ belong to
a different task — do not revert, clean, stash, or commit them.

CHECK OFF (all four; this is what stops the task being handed out again)
1. Write design/program/roadmap/receipts/PQ-045-causal-chain-REPORT.md saying what changed, what
   passed, what you did NOT prove, and anything you deliberately left out.
2. In design/program/roadmap/program-queue.json find "id": "PQ-045.causal-chain" and set BOTH:
       "state": "done"
       "receiptRefs": ["design/program/roadmap/receipts/PQ-045-causal-chain-REPORT.md"]
   Setting state without receiptRefs makes the queue schema INVALID and breaks the dispatcher.
3. Verify: node scripts/program-dispatch.mjs --ready
   PQ-045.causal-chain must NOT appear as an "id". If it prints "queue schema is invalid" you
   missed receiptRefs. Fix before continuing.
4. Commit ONLY your exact paths, never a bare `git add -A`:
       git commit -m "<message>" -- src/systems/traffic.js design/incubator/microevent_library/ design/program/roadmap/receipts/PQ-045-causal-chain-REPORT.md design/program/roadmap/program-queue.json

Finish by reporting DONE or NOT DONE in plain language a non-programmer can read.
```

---

## PROMPT 2 — fill the two empty wreck sites

```
Work the queue unit PQ-045.wreck-dressing end to end, then check it off. Do not start a second unit.

WHAT: Two Ceres wreck slots are anonymous placeholders. Dress them with seven selected assets from
the aftermath pack.
  Target slots: ceres_ambush_bait_wreck, ceres_cathedral_grave_shard

FILES YOU MAY EDIT
  assets/incubator/wreck_aftermath_pack/
  assets/ships/parts/places/

KNOW WHAT YOU ARE STARTING FROM — the pack is NOT production ready
- It is ENTIRELY UNTEXTURED: images = 0 in all 37 GLBs.
- It ships 1,891 unmerged meshes, with no LODs and no instancing.
Budget for that. Texturing, merging, LODs and recomputed collision are part of this unit, not a
follow-up. A valid GLB is not accepted art.

RULES
- The three specified-but-unbuilt hull families STAY UNBUILT. Do not expand scope to them.
- Seven assets into two slots. Do not bulk-promote the pack.
- Do not touch place_landmark_wreck_cathedral.glb — it lives in your directory but belongs to
  PQ-018.cathedral-reauthor.
- Follow docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md and complete the material-truth
  preflight in .grok/skills/spaceface-blender-material-truth/SKILL.md BEFORE modeling.
- If you register anything in a manifest, do it as a single small last step — the two manifest JSON
  files are the one place other asset tasks can collide with you.
- Do not reduce any quality setting to buy performance.

MUST PASS BEFORE YOU CHECK OFF
  npm run check:baseline
  npm run check:graphics:asset-receipts

  WARNING on that second check: it is known to inspect a convenient subset. It stayed green for
  weeks while two asteroid rocks were corrupt because it only ever looked at rockA. Confirm WHAT it
  inspected, not just that it passed, and say so in your receipt.

Another agent is working PQ-045.causal-chain (src/systems/traffic.js) in this same checkout. It
touches none of your files. Also: ~100 staged files under assets/ships/m5_claim_outposts/ belong to
a different task — do not revert, clean, stash, or commit them.

CHECK OFF (all four; this is what stops the task being handed out again)
1. Write design/program/roadmap/receipts/PQ-045-wreck-dressing-REPORT.md saying what changed, what
   passed, what you did NOT prove, and anything you deliberately left out.
2. In design/program/roadmap/program-queue.json find "id": "PQ-045.wreck-dressing" and set BOTH:
       "state": "done"
       "receiptRefs": ["design/program/roadmap/receipts/PQ-045-wreck-dressing-REPORT.md"]
   Setting state without receiptRefs makes the queue schema INVALID and breaks the dispatcher.
3. Verify: node scripts/program-dispatch.mjs --ready
   PQ-045.wreck-dressing must NOT appear as an "id". If it prints "queue schema is invalid" you
   missed receiptRefs. Fix before continuing.
4. Commit ONLY your exact paths, never a bare `git add -A`:
       git commit -m "<message>" -- assets/incubator/wreck_aftermath_pack/ assets/ships/parts/places/ design/program/roadmap/receipts/PQ-045-wreck-dressing-REPORT.md design/program/roadmap/program-queue.json

Finish by reporting DONE or NOT DONE in plain language a non-programmer can read.
```

---

## What is left after round 3

| Unit | Status |
|---|---|
| `PQ-045.prop-promotion` | Free, but see the warning below |
| `PQ-018.cathedral-reauthor` | Free. Collides with prop-promotion and wreck-dressing |
| `PQ-019.receiver-facility-reauthor` | **OCCUPIED** — ~100 staged files in the tree |
| `PQ-045.five-minute-h1` | Unlocks only when all five PQ-045 siblings are done |

**`prop-promotion` carries a hidden first task.** Its brief requires pinning the toolchain and
proving two byte-matching builds *before* any art work, because the Everyday Space pack is not
currently reproducible — 29 of 46 GLBs differed across two isolated Blender 5.1.2 builds. Whoever
takes it should expect that reproducibility fix to be most of the session. It is worth doing; it
just is not the sixteen-props job it sounds like.

After round 3 the remaining three are all asset tasks that collide with each other on
`assets/ships/parts/` and the two manifests. Run them **one at a time**, not as a pair.
