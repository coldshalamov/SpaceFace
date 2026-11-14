# PRI-08b — Ceres: the Ninth Mouth. Nine went in; bring the ninth out (#945, part 2)

**Lane 2. After PRI-08a has landed.** Read `design/program/fleet/PR-INTAKE.md`; the "#945" section of
`.devshots/pr-intake/reviews/grunt-ec-a.md`; `design/game/13_JOBS_AND_HEISTS.md` **Job: The Ninth Mouth**; and the
director's card in `design/program/experience-commissions/commissions/sectors/EC-S02-ceres-belt.md`.

The design, exactly: *the headcount board reads 9 IN / 8 OUT. Dessa Kroll has stopped the shift. One barge
is still inside, in the mouth nobody uses, and its lamp line is dead. Two ways: go in dark and feel your
way — or tow a string of lamps in ahead of you and relight the line as you go. What goes wrong: the barge
is wedged; pull the wrong way and the rock comes with it. What is left: 9 OUT. The Ninth Mouth lit,
permanently, with your tag at the lip. Kroll: "Nine went in. Nine come out."*

## Build
Three-way merge from PR #945 the Ninth Mouth half:
- `src/data/ceresNinthMouth.js`, `src/systems/ceresNinthMouth.js`, `src/world/ceresNinthMouthBodies.js`,
  `src/ui/ceresNinthMouthPrompt.js`, `src/render/ceresNinthMouthVisuals.js` (all new)
- `src/systems/npcJobsRuntime.js` (install / step / serialize the Ninth Mouth), `src/systems/world.js`,
  `src/world/worldRecords.js`, `src/world/worldCatchup.js`, `src/ui/masslineCadenceReadout.js`,
  `src/features/proExperiencesBrowser.js`, `scripts/lib/ceresNinthMouthMirror.mjs` (new),
  `scripts/lib/simReadModel.mjs`, `scripts/lib/simWorkerHost.mjs`
- `ceresNinthMouth:action` crosses to the simulation: regenerate `src/core/mainToSimEventSurface.js`
  (`node scripts/lib/eventSurfaceCensus.mjs --forward-set`)
- Tests: `test/ceres-ninth-mouth-*.test.mjs`

**Do not port the shader work:** `src/render/illustratedSurface.js` and `src/render/nocturne/shadeRegions.js`
stay as master has them (the lead's look pass owns that shader this week). `ceresNinthMouthVisuals.js`
must work without `claimShadeRegion` / `installShadeRegionShader`: the dead mouth reads dark because its
lamps are unlit, and reads lit when they are relit — use the lamp bodies' own emissive/light the way other
lamp props on master do (`grep -rn "worklight\|lampLit\|emissiveIntensity" src/render | head`). Remove the
imports of the shade-region module. Say in the receipt what the mouth looks like without it.

## Required corrections
1. **The words are the design's.** Kroll's lines, exactly, and no others from her in this job:
   job offered `Nine in. Eight out. Shift's stopped.` · player enters the mouth `Mind the ribs.` ·
   barge pulled the wrong way (rock shifts) `Other way. Other way!` · barge clear `Nine went in. Nine come out.`
   The headcount board is a world tag: `9 IN / 8 OUT` until the barge is out, then `9 IN / 9 OUT`.
   Everything else the PR says in sentences becomes a prompt key or a tag of at most four words
   (`RELIGHT`, `TOW · BERTH`, `LAMP 2 / 3`), or is cut.
2. **Two ways, both real.** Going in dark must work (no lamp required to reach and free the barge);
   towing lamps in relights the line one lamp at a time. Prove both in tests through the real owner.
3. **What goes wrong.** Pulling the wedged barge along the wrong axis has a physical consequence the PR's
   owner already models or must gain: loose rock bodies released from the wall near the barge through the
   existing debris/asteroid spawn seam (bounded: at most six, once per attempt). No scripted damage numbers.
4. **What is left.** After the rescue: the lamp line stays lit and a tag `<pilot name or "you">` sits at the
   lip, as durable world records (the PR's `worldRecords` path), surviving save, Continue and leaving the
   sector. The headcount board keeps `9 IN / 9 OUT`. Never re-offered, never re-paid.
5. **Cost.** With no Ninth Mouth job live and the player outside `sector_ceres_belt`, `stepCeresNinthMouth`
   returns after one check. With it live: no array allocation and no whole-entity-list scan per tick.
   `masslineCadenceReadout.js` re-validates the tow guidance only when the attachment or the published
   offer changes, not every frame.
6. **Saves.** Old saves load with no Ninth Mouth state; the eight original bodies are not duplicated on
   Continue (keep the PR's identity tests).

## Files you may edit
Those named above (not `illustratedSurface.js`, not `shadeRegions.js`). Foreign changes in a file: do the
others, re-check every ten minutes for up to thirty, then report Blocked.

## Checks
`node --test test/ceres-ninth-mouth-*.test.mjs`, then in one call the existing tests of what you touched
(`grep -ln "worldRecords\|worldCatchup\|npcJobsRuntime\|masslineCadenceReadout\|simReadModel" test/*.mjs`) —
report pass/fail counts; reds already failing on untouched master are reported, not "fixed".
`npm run check:src-imports`. One look through the lock at the mouth before and after relighting, PNGs into
`.devshots/fleet/pri-08b/` (ten-minute limit; say so if you could not).

Commit: `fleet(PRI-08b): Ceres — the Ninth Mouth: go in dark or relight the line, and bring the barge out`.
