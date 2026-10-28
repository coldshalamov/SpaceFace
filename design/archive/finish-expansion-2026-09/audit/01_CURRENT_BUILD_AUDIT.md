# Current build audit: facts, limits and hypotheses

## Scope

This is a targeted static audit. Sources include root policy, build map, queue header/dispatcher, current flight/input and cruise code, mission data, bomb eligibility, architecture/module routing, VFX and Forge direction, frontend authority, dated defect/tuning records, PR metadata and selected PR machine implementation. Full live gameplay, asset appearance, current frame times and the complete dependency graph were **not** inspected by running the game. The large repository was not cloned. See `SOURCES.md` for exact pins/ranges.

Every receiving agent must distinguish:

- **Code observation:** present in the inspected source range; not automatically proved reachable or correct.
- **Source contract:** the intended rule in current authoritative documents.
- **Dated report:** another agent's observation/test claim, possibly stale.
- **Hypothesis:** plausible weakness requiring reproduction.
- **Proposal:** work recommended by this pack, not a fact about the game.

## High-value findings

| Finding | Evidence and confidence | Why it matters | Action |
|---|---|---|---|
| G relative dynamic stick already exists | Code observation: `dynamicFlightStick.js`, bounded pointer accumulation, progressive deadzone and camera-basis projection [S09] | Rebuilding draw-to-fly would undo the user's selected control direction | Calibrate current input at real DPI/viewport and mode transitions; do not replace by assumption |
| Old chip-harassment diagnosis is stale | `TUNING_JOBS` still lists it open, but `cruise.js` now filters meaningful damage and uses a rearm window [S10, S11] | Weak agents can regress correct behavior while chasing obsolete prose | Reconcile active instructions and test residuals rather than reimplementing the old fix |
| Movement tests have evolved | Current Feel Contract speed-normalizes B2/B3; earlier text uses fixed screen-radius/crossing assumptions [S07] | A blanket slow-down to satisfy old numbers would violate the current game | Use the latest source contract and actual cruise/camera values |
| Mission capacity is richer than older maps claim | Current missions data declares 17 types including physical recovery/demolition/rescue/authored/breakaway; older routing prose says 10 [S08, S16] | New “mission system” proposals duplicate existing runtime owners | Reuse actual types and predicates; build scenes and clauses first |
| Bomb eligibility does not cover fauna | Master `bombs.js` candidate sets cover ship/drone/station and asteroid/wreck/pickup/payload, not fauna [S13] | Alien physics claims can fail before effects or balancing even run | Build a target/capability matrix; explicitly add only intended supported interactions |
| Machines are deliberately nonphysical in their initial layer | PR machine spawn sets `collides:false`, `physicsBody:false` [S24] | An attractive robot concept does not yet imply towable actors or real construction | Keep intentional opt-outs; make selected workpieces and applied forces real through authority |
| Machine art is programmatic primitive composition in inspected range | `machineVisuals.js` builds octahedra, tori, spheres and boxes with local material creation [S25] | Visual finish and material/resource lifecycle need audition; source presence is not art acceptance | Review beside current Forge art at gameplay camera; improve functional silhouettes and shared ownership where justified |
| The alien PR is not master | PR 170 was open/unmerged at its audited head [S17] | Plans may reference files missing from a worker checkout | Rebase/reconcile through a selected integration path; don't assume merge or apply a branch wholesale |
| Frontend authority has drifted across docs | Root/current ORRERY supersede Field Hardware, but older registry/finish docs still claim the latter [S01, S05, S18, S19] | Multiple agents can reintroduce incompatible UI designs | Link current direction and retire stale active wording when touching it; no fifth redesign |
| A huge existing work reservoir already exists | Build map, plan registry, directed INFERENCE, AE program and prior planbanks [S02, S04, S05, S17] | Raw new task volume can poison prioritization and duplicate work | Map by outcome and owner; adopt only live gaps and deliberately selected expansion |
| Some severe runtime risks are historical, not newly diagnosed | D24 described fixed resource lifetime work pending re-soak; D36 described contention/scheduling investigations [S20] | Repeating a stale fix wastes effort; dismissing remaining verification also risks regression | Reproduce on the current route with declared host load and inspect actual retaining/scheduling paths |

The bomb/animal mismatch is a concrete source-level incompatibility, not proof that every alien tool interaction fails. The machine spawn contract is not itself a bug: sensors and procedural background machines may intentionally remain kinematic. The gap is between those contracts and stronger promises such as moving wrecks, taking impacts or transporting physical tokens.

## Likely whole-game weaknesses to test, not assert

**Control burden under combinations.** G steering, auto-target, rigs, ordnance and modal transitions may each work separately while competing for the same hand. Test real sequences rather than isolated bindings.

**Promise-to-action gaps.** A tool can be sold or listed without being practically useful in a reachable encounter. Trace acquisition, fitting, input, target admission and consequence together.

**Visual attention saturation.** Bright trails, fields, sky, HUD and impacts can be individually attractive but obscure the next decision. Review moving dense scenes with current effects; do not solve it by erasing the game's bright identity.

**Mission sameness.** Many mission types do not guarantee distinct decisions. Compare geometry, preparation, cost, alternate solutions and failure state before adding another row.

**Long-game coherence.** Industry, progression, contacts and story may accumulate many receipts without explaining what to do next. Play earn-fit-use and failure-recovery routes on a fresh save.

**Persistence seams.** Dynamic objects becoming cargo, fields ending during save, and offscreen site catch-up can lose identity or duplicate outcomes. These need deliberate adversarial tests before content multiplication.

**Ancient machines as scenery.** A repair pose or periodic sound may satisfy a descriptive task while doing no repair. Test actual workpiece/resource/state changes. One convincing local chain is worth more than fifteen new kinds.

**Generic alien escalation.** Higher contamination, more actors and more fog can become noise rather than dread. Escalation should change geometry, instruments, relationships and decisions while retaining recovery routes.

## Prioritization rule

Prefer a current severe defect, then a broken link in an essential loop, then a high-value improvement to a retained experience, then a genuinely distinct expansion. An already-rich subsystem with weak integration is usually a better target than an entirely new subsystem. This is an engineering judgment to revisit with play evidence, not a measured ranking of every file in the repository.
