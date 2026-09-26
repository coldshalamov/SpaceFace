<!-- LIFETIME: RECEIPT -->
# PQ-140 — wave-catalog lane: every wave's question is true, closable, and named

```text
DONE  PQ-140 wave-catalog lane. All 70 authored recipes now carry a machine-checked promise that
the physical problem they name is TRUE of their composition (SURVIVAL_QUESTION_PROPS +
questionPropsIssues, enforced inside catalogQuestionIssues), the named answers are proven to
CLOSE with the live collision law at starter-kit impulse budgets (shove pairs, thrown lights,
heavy terrain), and the combat net SPEAKS the wave's problem as its own one-line beat. 16 new
focused tests, deterministic, seed 14001.

WHAT I FOUND     The question data (PQ-174.03/PQ-175.00) was already authored per wave, but nothing
                 checked that a composition still answers its question, nothing proved the named
                 verb closes as physics rather than as a hope, and the questions had NO runtime
                 consumer — the player never heard them. survivalAnnounce named body counts and a
                 lead archetype, never the physical problem.

WHAT I CHANGED
1. src/data/survivalWaves.js — SURVIVAL_QUESTION_PROPS: per template wave, the bodies the question
   names, the shoved pair and its mover-mass bound (starter concussion budget ≤ 96), the co-gate
   cluster minimum, throwable-class presence (mass ≤ 32), and heavy-terrain presence (≥ 150).
   questionPropsIssues() enforces it; catalogQuestionIssues() runs it for all 70 recipes.
   physicalProblemFromPackages exported (the package-level problem reader). The PQ-133.04 Foundry
   wave-ten override is named once (WAVE_10_FOUNDRY_QUESTION + shippedQuestionFor) instead of
   inline in waveRecipe. Two derived problem rows made self-contained ('screened_pack',
   'bare_mass') so a swapped composition never barks template clauses that name absent hulls.
2. src/systems/survivalAnnounce.js — after a wave's opener, the net says the wave's problem as its
   own one-line objective beat (id survival:wN:why, inside the 5-line budget; the arc boss wave is
   the worst authored case at exactly 5). Act I reads the shipped row; act II/III, endless,
   heavies_only and swarm read it from the packages actually fielded; the boss circuit stays
   silent (its boss names itself).
3. src/systems/survivalWavePlanner.js — plan.heaviesOnly flag under the heavies_only mutator, so
   the announcer knows the mass slots were rewritten. Present ONLY under that mutator: plan shape
   is unchanged for every ordinary wave (the foreign seed-47 full-plan snapshot still passes).

THE NUMBERS      (live law resolveCollisionConsequence, reduced-mass exchange J = mu*v, seed 14001)
                 wave 2 shove: reaver(60) into wasp(16) at 80 wu/s kills the wasp on ONE contact
                 (161 >= pool 88); the reaver rides on (15 of 200). Loop closes at 62 wu/s.
                 wave 4 shove: jackal(58) into brawler(70) at 80 wu/s — the miner DIES in the
                 exchange (196.5 capped >= pool 183) and the brawler goes hollow (163 >= shield 90
                 + 90% armor). Loop closes at 71 wu/s, under governed cruise 105.
                 arming budget: starter concussion S alone (520 x 1.2 = 624/s) arms both pairs
                 faster than the starter pulse grinds the same pair (6.6s vs 21.1s; 5.9s vs 7.2s).
                 wave 10: a thrown escort dies ON the fortress (crumple cap 400 >= pool 88); the
                 fortress takes 0 — gun-scale impulses do nothing to a heavy (B11, PQ-140.01).
                 wave 5: a rope-flung light at 150 wu/s (inside TANGENT_MEETING_MAX_SPEED 180)
                 strips the corsair's shield + armor (187 >= 125).
                 gun floor: every non-heavy body in the catalog is a bounded starter-pulse kill
                 (max 16.4s single, 61.6s worst wave); heavies are exempt — the packet forbids
                 grading them by HP. No wave requires a gun-only DPS check above the floor.

PRE-EXISTING RED (recorded, not mine, unchanged by this lane)
                 check:baseline: pq020-ceres-topology FAIL; sim 47a / sim-v3 / sim-v3-compare
                 telemetry-hash drifts. test/pq-174-01-harvest-waves.test.mjs 5 fails: HEAD
                 committed swarm completionRules.kind 'cohort' (survivalWavePlanner.js:377) while
                 the clean harvest test pins 'duration' — the swarm-clock lane's seam.
                 POST-EDIT FLAKE, NOT A REGRESSION: the massline aggregate timed out two children
                 (check:47a:civilian-priority, check:47a:physical-branches) after these edits.
                 Both children PASS alone (civilian-priority 115.8s vs a 150s budget — the edge
                 was always thin), the timed-out set varies run to run (3/2/2), and this lane's
                 diffs are provably off the 47a route: the checks import none of the touched
                 files, the route carries no survival run (the announcer guard is silent), and the
                 planner flag exists only under heavies_only.

Checks
| Check | Result |
|---|---|
| node --test test/pq-140-wave-physical-problems.test.mjs | 16 pass |
| node --test test/pq-175-00-wave-questions.test.mjs | 5 pass (incl. new props gate) |
| node --test test/crucible-announce.test.mjs | 26 pass |
| node --test test/crucible-wave-planner.test.mjs (foreign) | 10 pass |
| node --test test/crucible-wave-schema.test.mjs (foreign) | pass |
| node --test crucible-{no-hp-scaling,thirty-wave-arc,ten-wave-shell,survival-run,wave-materialization,swarm,swarm-bars} | 92/98 pass; 5 fails = pre-existing pq-174-01 seam above |
| npm run check:baseline | same reds before and after; nothing new red |

Queue unit state: PQ-140 stays with its leaves .00-.03 receipted; this receipt closes the packet's
wave-catalog grading lane. Not set to done — integrator owns queue state.
```
