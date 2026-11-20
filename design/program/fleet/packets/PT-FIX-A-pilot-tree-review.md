# PT-FIX-A — Fix the Pilot Tree review's blockers (cards, damage, collisions, run)

> **Pipeline (director, 2026-11-19):** make NO git writes. Edit surgically: other agents keep uncommitted
> work in the same files — never reformat, never normalise line endings (keep CRLF where a file has
> CRLF; check `git diff --stat` shows a small diff for a small edit), never revert a hunk you did not
> write. Several builders work at the same time on other files — respect the **Not** list exactly.

**Context.** The Pilot Tree chain (engine, route, cards, body/gun/rope/power effects, camera gate) is
live in this working tree and parked for landing. An adversarial review —
`.devshots/director/reviews/agy-pilot-tree.md` — found blockers. **Read that file first.** Fix exactly
the items below, the way the review proposes unless you find a better fix (then say why). Each fix gets a
focused regression test that fails before your fix.

## Fix (BLOCKING)

1. **OVH-01b #1 — Esc on the cards does nothing.** `src/ui/pilotCards.js`: drop `locked: true`, add
   `onEscape()` that dismisses ('later') and returns true; update `test/ovh-01b-level-up-cards.test.mjs` to
   drive Escape through the real modal route (`src/ui/input.js` order), not `onKey` directly.
2. **OVH-01b2 #1 — "Pick at once" overlay leaks across pause/draft.** `src/ui/pilotCards.js`
   `createPilotBreathController`: close the overlay on `sim:pause`, run end, `run:draftOffered`, any
   `ui:pushScreen`, and inside `tryBreath()` before pushing the cards; `liveSurvival` also excludes
   `phase === 'victory'`.
3. **OVH-01c1 #1 — Ram Plate / Juggernaut still strip shields, armour, subsystems and `lastDamageT`.**
   `src/combat/damage.js`: decide `pilotTaken` before shield/armour/subsystem routing; when it is 0, apply
   nothing to any layer and do not stamp `lastDamageT`. Add a shielded + armoured player case to
   `test/ovh-01c1-body-effects.test.mjs`.
4. **OVH-01c1 #2 — kick-stamp effects depend on entity-id order.** `src/systems/collisionConsequences.js`:
   snapshot both bodies' kick stamps once at the top of `_resolveContact` and pass them into both
   `_resolveTarget` calls / `_pilotContactEffects`. Test: the same collision with the ids swapped gives the
   same outcome (Newton's Cradle hop count and momentum; Billiards kill or not).
5. **OVH-01c3 #1 — Execution can kill the player.** `src/combat/damage.js`: `gunner_execution` only when
   `target.id !== state.playerId` and `origin.kind === 'weapon'` (combat hulls only). Self-damage
   regression test in `test/ovh-01c3-gun-effects.test.mjs`.

## Fix (worthwhile NON-BLOCKING items from the same review)

6. OVH-01a #1 — player-facing card text: rewrite `Second Line` and `Coupler` sentences in
   `src/data/pilotTree.js` without internal ids or doc references.
7. OVH-01a #2 — the XP curve against the live payouts: the live award sites (`src/systems/survivalRewards.js`
   kill XP, `src/data/swarmMode.js` wave-clear XP) pay far more than the curve assumed, so a run reaches
   level 4–5 in round 1 and >20 by round 10. Retune **only** `RUN_XP_LEVEL_BASE` / `RUN_XP_LEVEL_STEP` (and
   the curve shape if needed) in `src/core/runState.js` so the design checkpoints hold against the LIVE
   payouts: level 2 about 25 s into round 1, about level 14 at the end of round 10 (`04_SWARM.md` §3). Do not
   edit `survivalRewards.js` or `swarmMode.js` (another agent's frozen work). Add a test that models a
   typical run's live payouts and pins the checkpoints.
8. OVH-01b #2 — reset the breath deadline (or rebuild the view) on every `onShow()`.
9. OVH-01b #3 — move `PILOT_REROLL_SCRAP` into `src/data/pilotTree.js`; import it from there in
   `src/systems/runSession.js` and `src/ui/pilotCards.js` (no sim owner in the presentation bundle).
10. OVH-01c1 #3 — Last Stand: pass the player (not the striking body) into `_maybeLastStandRepair` for
    player-caused collisions between other bodies.
11. OVH-01c1 #4 — bosses never die to a Billiards / Wall Splat structural one-shot (cap to a fixed chunk);
    a kick stamp and Stagger need a minimum impulse so Hose/Pew streams do not stun-lock (pick the
    threshold from the gun families: Thump/Needle/Boom kick, Hose/Pew do not).

**Files:** `src/ui/pilotCards.js`, `src/data/pilotTree.js`, `src/systems/runSession.js` (the import only),
`src/combat/damage.js`, `src/systems/collisionConsequences.js`, `src/core/runState.js`, and the tests named.
**Not:** `src/systems/weapons.js`, `src/data/weapons.js`, `src/render/feel.js`, `src/render/camera.js`,
`src/ai/`, `src/systems/aiPorts.js`, `aiFireIntent.js`, `waveMaterialization.js`, `tacticalAI.js`,
`src/ui/hud.js`, `src/presentation/`, `src/systems/powerVerbs.js`, `fields.js`, `bombs.js`,
`impulseCharges.js`, `massSeed.js`, `tetherGameplay.js`, `masslineThrow.js`, `src/combat/attachments.js`,
the input layer (other builders, now), `src/ui/sandbox/`, `scripts/lib/simWorkerHost.mjs`,
`src/render/renderer.js`, `src/systems/survivalRewards.js`, `src/data/swarmMode.js`.

**Run:** `test/ovh-01a-pilot-tree.test.mjs`, `test/ovh-01a2-pilot-route.test.mjs`,
`test/ovh-01b-level-up-cards.test.mjs`, `test/ovh-01c1-body-effects.test.mjs`,
`test/ovh-01c3-gun-effects.test.mjs`, the existing tests of every file you touch, and
`node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --expect test/47a.telemetry.save-v27.expected.json --hash --repeat 5`.

**Report:** per item — done or not, file:line, the regression test name and result; every file you touched.
