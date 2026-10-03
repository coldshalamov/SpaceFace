# GROK-BUILD20 boot and fight-entry receipt

Date: 2026-10-02. Branch: master. No commit.

This sitting did not measure a browser frame rate and did not re-time the
`loading:entering-flight` → first-playable wall gap. The evidence is headless
repeat-work counts. The picture, sampled doctrine, and per-ship gun state stay
the same.

## What changed

- `src/render/openingSubmissionPlan.js` — the leaf list is walked on every
  read. A same-turn memo keyed only by root, camera, and offscreen flag was
  handing the census, the plan, and the renderer a list that ignored a reveal,
  an added mesh, an instance count, a draw range, or a layer change. The
  program-subject hash is still reused until the next microtask, and only
  while the producer manifest string is unchanged (blend, depth test, vertex
  colors, fog, lights, tone map, env map, driver program key). A hidden
  subtree is not entered. `live: true` remains on the receipt walk and no
  longer bypasses a cache, because there is no leaf cache.
- `src/render/partsLibrary.js` — non-ship authored prefetch used to await one
  GLB at a time. It now keeps two loads in flight, the same depth as
  `preloadAuthoredParts`. Ships are unchanged. GPU cook budgets are unchanged.
- `src/systems/combat.js` — a wave of the same archetype rebuilt one faction
  sample, one capability list, and one weapon template per body. Those three
  are reused. Each body still gets its own cooldown, heat, muzzle offset, and
  arc. Faction cache caps at 64 keys; weapon templates cap at 128.

## Test

```
node --check src/render/openingSubmissionPlan.js
node --check src/render/partsLibrary.js
node --check src/systems/combat.js
node --test test/boot-and-fight-entry-repeat-work.test.mjs test/opening-submission-plan.test.mjs test/opening-plan-awaiting-authored-skip.test.mjs test/opening-gpu-admission.test.mjs
```

Result: syntax checks exit 0. Tests 47, pass 47, fail 0, duration_ms 5404.

Pinned counts:

- 24 meshes, one shared material: collect, census, and plan walk three times
  (`leafWalks === 3`, `leafCacheHits === 0`) so a same-turn reveal cannot be
  missed. `subjectHashes === 1`, `subjectCacheHits >= 24`, plan still has 24
  draw leaves. Revealing a hidden child without resetting the counters puts
  that child in the next list. A blend, fog, depth, vertex-color, light,
  tone-map, or driver-key change is a new subject key in the same turn.
- Four prefetch URLs: 2 started and max in flight 2 before any release; all 4
  finish with max in flight still 2.
- 12 `wasp_swarmer` spawns: faction, capability, and weapon-template builds
  are 1 and hits are 11. Guns are distinct objects with distinct muzzle
  arrays, cooldown 0, heat 0, and the same damage. Doctrine row is shared.

The two opening-receipt tests that add a mesh after the plan
(`declared pooled resources…` and `a first-draw census explains queued
admissions…`) pass because the receipt walk is live.

## Rows

| Row | Status | Note |
|---|---|---|
| 33 | DONE | Serial place prefetch is two-wide. Program subjects hash once per unchanged material. The leaf list walks on every read so a same-turn reveal is in the picture. Wall seconds not remeasured. |
| 34 | DONE | Repeated fight-entry allocs. The old 12 fps note was not reproduced on this machine. |
| 57 | NOT DONE | Every PQ-129.11–.17 leaf was skipped. See below. |
| 225 | DONE | Same named repeat work as 33 and 34. Scene quality unchanged. |

## PQ-129.11–.17 skipped

- `.11` submit tighten — `src/render/tabletopPolicy.js` is free, but dropping
  runway submits without a live census pops content. No duplicate-work bug
  there that keeps the same submitted set. Not edited.
- `.12` rigid opaque batching — `src/render/renderer.js` is owned by another
  agent. Not edited.
- `.13` canopy/plume — `src/render/bloom.js`, `renderer.js`, and `src/render/vfx.js`
  are owned by another agent. `canopyMaterialPolicy.js` only matches opacity
  and names; changing it changes pixels. Not edited.
- `.14` tiny-fighter LOD — `src/render/lod.js` is free. Lowering the thresholds
  changes the picture, and the campaign forbids reviving this leaf as a
  cheaper stand-in. Not edited.
- `.15` off-table AI sleep — already shipped in `src/core/activityScheduler.js`
  (`shouldOwnerThink`). Consumers include `src/ai/**` and `src/systems/traffic.js`,
  both owned by other agents. Re-implementing it was rejected on 2026-08-21.
  Not edited.
- `.16` cheaper bloom — `src/render/bloom.js` is owned by another agent, and
  the single-clear plus shadow-refresh slice already shipped. Not edited.
- `.17` autosave off the display callback — `src/save/**` is owned by another
  agent. Autosave already schedules with `setTimeout`, not the display
  callback, and the 2026-08-21 sweep named autosave zero times. Not edited.
