# PRI-FIX-R1 — Seven findings from the senior review of the PR-intake commits

**Lane 2.** Read `design/program/fleet/PR-INTAKE.md` first (a busy file is never a blocker — use
`scripts/fleet/own-commit.sh`), then the review: `design/program/fleet/reviews/2026-11-14-pr-intake.md`
(R1–R7, each with file:line, the triggering sequence and the smallest fix). The lead has read the
findings and accepts all seven. For each: write the test that fails today first, then the smallest fix
in the owner, one commit per finding.

1. **R1 — only food is food** (`src/systems/faction_frontier.js` `_foodPodVerdict` ~1563). A jettisoned
   pod of iron currently earns the food-delivery reward because `gardenFeedMass` accepts any commodity.
   Require the pod's whole load to be a food commodity (find how commodities are classed as food/provisions
   in `src/data/commodities.js`; if no class exists, use the commodity ids the Frontier data already names as
   supplies/provisions and say which) before the custody check is cached. A non-food pod is left alone,
   unpaid. Test: iron pod held in the ring for 5 s → still alive, no fee, no supplies; food pod → taken.
2. **R2 — custody is re-checked at the handoff** (same file, `_consumeFoodPod` ~1642). A pod caught by an
   outlaw net (`data.caughtByNet`, `src/systems/lootShards.js` `_markCaughtByNet`) after its verdict was
   cached must not be consumed: at the final handoff re-read custody (the same refusal `gardenFeedMass`
   applies) and that the contents are still the qualified whole load; on refusal clear the dwell timer.
3. **R3 — the yard capstan's cable is drawn** (`src/render/combat/npcCableFx.js` ~97). Admit
   `attachment_furnace_capstan` (the gantry → pod line `src/missions/furnaceCapstan.js` creates) to the
   existing NPC service-cable renderer with the same endpoint/life checks as the admitted modes. Add nothing
   else to that file. Test at the renderer's admission predicate (export it if it is not exported).
4. **R4 — a finished Ceres lift stops searching** (`src/systems/ceresAnchorWinching.js` ~267–303, `findAt` ~81).
   When the plate or a mast is terminally lost, or the job is done, no `entityList.filter` runs on the
   half-second cadence: keep a negative lookup and resolve replacement references only on spawn / restore /
   sector-enter transitions. Test: after the plate is destroyed, 600 ticks perform zero `findAt` world scans
   (count calls through a spy or an exported counter).
5. **R5 — the casing retry backs off its scan too** (`src/missions/furnaceCasingReturn.js` ~57–73). The
   missing-body `entityList.find` runs every intake update while the pockets are blocked; gate it behind
   `nextAttemptAt` as well, keeping one reconciliation on restore/spawn transitions. Test: blocked pockets →
   between retries the adoption search is not called.
6. **R6 — one tag per stead** (`src/missions/frontierReceivingTags.js` ~55–118). A stead with several
   reasons wears only the first in the order supplies → aid → claim (key the wanted set by body id +
   generation); when the higher reason closes, the next shows. Test: stranded debtor → one tag, `SUPPLIES WANTED`;
   supply it → the aid tag appears.
7. **R7 — the plate-theft helper unsubscribes** (`src/systems/foundryPlateTheft.js` ~94,
   `src/systems/survivalArena.js` destroy ~1363). Keep the `bus.on('entity:spawned', …)` unsubscribe, expose
   `destroy()` on the helper (clears the event, unsubscribes), call it from the arena's destroy path. Test:
   init → destroy → init leaves exactly one listener's worth of behaviour (spawn after re-init is recorded once).

## Files you may edit
The seven owners named above and their tests (`test/frontier-provision-freight.test.mjs`,
`test/frontier-receiving-tags.test.mjs`, `test/furnace-capstan.test.mjs`, `test/furnace-casing-return.test.mjs`,
`test/ceres-anchor-winching.test.mjs`, `test/crucible-plate-theft.test.mjs`, or one new
`test/pri-fix-r1.test.mjs` if a finding fits none).

## Checks
Each finding's test (red before, green after — say so per finding); then
`node --test test/frontier-provision-freight.test.mjs test/frontier-receiving-tags.test.mjs test/frontier-first-provision.test.mjs test/frontier-aid-and-claims.test.mjs test/furnace-capstan.test.mjs test/furnace-casing-return.test.mjs test/ceres-anchor-winching.test.mjs test/crucible-plate-theft.test.mjs test/crucible-plate-theft-stakes.test.mjs`
(four minutes per file); `npm run check:src-imports`. No game run.

Commits: `fix(PRI review R<n>): <what no longer goes wrong>` ×7.
