<!-- LIFETIME: DATED_ANALYSIS — source/probe snapshot; canonical packets own remaining work. -->
# Deep source inspection: production paths and planning corrections

Inspected revision: `a8fcd7d59acb1bd0a0b4a07e907a57bd79e6e455` (2026-09-30).
Follow-up to the initial [production-quality plan](PRODUCTION_QUALITY_COMPOUNDING.md).
This inspection changes priorities; it is not proof that the entire game is verified or optimally designed.

## Scope and evidence standard

A source-only working set of 124 source files plus package metadata was materialized for tracing and
direct module probes. Many of those files are dependencies, not individually exhaustive reviews.
The substantive traces cover runtime selection, player input/targeting/flight, physics activity and
contact, Swarm planning/materialization/shop/reward, environment/traffic, and opening/story ownership.
Large traffic/mission files were followed at the relevant entrypoints and downstream seams; their
complete behavior was not executed.

Production functions were imported directly in Node v24.19.0; no mocked replacement of the offer,
wave planner, surface-response or classification functions was used. These probes are focused
characterizations. They are not a browser playthrough, Rapier collision run, economic campaign,
hardware benchmark or visual/art-quality review. Missing files during source-set assembly were
downloaded at the same revision; those transient import errors were not repository defects.

Evidence labels:
- **Executed:** the stated production function result was observed locally.
- **Source-traced:** caller/consumer/condition inspected, but full behavior not executed.
- **Historical lead:** a report names a problem; current reproduction remains necessary.
- **Design hypothesis:** an improvement whose experiential value still needs agent evaluation.

## 1. The selected production path is substantial

**Source-traced.** `src/core/registry.js:577–600,933–947` selects tactical AI and Flight V3
when the requested backend is Rapier, then resolves the production manifest.
`src/core/gameState.js:16–43` defaults to production/Rapier/V3 and unmuted audio.
The runtime maps and manifest include hullBurst, environmentalMachinery, missions and presentation.

**Planning consequence:** do not fix compatibility flight/AI merely because those older modules
are easy to find. Old notebook claims that audio defaults to muted are not current.
A registered system still needs its mode/feature/state gates traced; registration alone is not a
quality verdict.

## 2. Swarm and the authored arc are different content routes

**Executed + source-traced.** `survivalRun._planCurrentWaveIntro` passes Swarm explicitly.
`src/systems/survivalWavePlanner.js:800–815` returns through `planSwarmWave` before
the authored `recipe` lookup and `composeArcWave` path.

With seeds 47, 4242 and 8008, wave 6 in `helios_core`, a Swarm plan was unchanged when passed an
invalid authored recipe. The non-Swarm path rejected that same recipe. This is deliberate mode
routing, not a planner defect.

**Important strength:** `src/data/swarmMode.js` already has finite cohorts, an armory after
each clear, pressure release, specialist debut timing, boss rotation and mass-gap rounds.
The mass-gap round already uses nine cover rocks, two gaps and a late heavy body. These are current
data rules, not proof the resulting fight feels good.

**Planning correction:** [NXB-017](next-wave-2026-09-28/build/NXB-017.md) names normal Swarm
as its route but points prominently to authored act/recipe files. Its update must explicitly target
the Swarm branch. Do not claim success by changing only `survivalActs.js` or `survivalWaves.js`.
Do not duplicate the existing specialist-debut or mass-gap choreography under a new name.

## 3. Real content exists but the Swarm shelf truncates it

**Executed defect in offer generation; source-traced live caller.**
`src/systems/survivalDraft.js:151,294` requests `count: 100` for Swarm.
`src/data/survivalDraft.js:300–340,356–429` filters the legal set, shuffles it, and slices
to that count. The generated catalog is intended to expose every purchasable fitting.

At wave 1, using the existing preset fittings and seeds 47, 4242 and 8008:

| Existing preset | Eligible fitting offers | Returned at live count |
|---|---:|---:|
| massline_rig | 111 | 100 |
| mirror_demonstrator | 112 | 100 |

A comparison call with count 1000 returned all eligible entries. On seed 47, the mirror preset's
omissions included Grip Bumper, Repulsion Trap and Tractor Beam. On seed 8008, they included Fire
Lance, Storm Carom and Swing Drive. Omission is seed-dependent, not an actual fitting rejection. These named presets are input fixtures;
this probe does not claim they are all offered on the public starter screen or that their normal
acquisition was played. The production caller applies the same limit to matching live loadouts.
A separate empty-fit census exceeded 100 on ten of the fifteen hull definitions; that census is
an eligibility fixture, not an earned player-loadout claim.

**Counterevidence to a tempting wrong diagnosis:** the bumper items are not absent from the shop
catalog. `src/data/swarmCatalog.js` generates them, and `modules.js` attaches meaningful
sentences. A generated-stock probe returned all three rank-1 burst rows. Ordinary starter presets
tested here were below the limit and retained them.

**Selected action:** extend existing [NXB-018](next-wave-2026-09-28/build/NXB-018.md) with a
full-shelf contract and preserve arc three-card behavior. This unlocks already-created breadth.
Do not add more equipment first, or fix this with another larger magic count.
This finding belongs to that existing packet, not a parallel defect/status queue.

## 4. Collision residency is a neighborhood problem, not only a fast-body problem

**Source-traced + limited classifier execution.**
`src/core/physics.js:563–586` supplies Rapier the activity-classified static/dynamic sets.
`src/core/sg02DynamicBodyOwner.js:384–435` removes records absent from those sets.
`src/world/activityRuntime.js:132–145` derives reach from player maxSpeed/camera parameters;
`imminentCollisionFor:328–354` defaults to player-relative collision prediction unless explicit
collision ids are supplied. Projectile target pins and aggro can retain a hull without retaining
every terrain collider along its outgoing path.

A focused configuration (zoom 144, tilt 60, FOV 50, player maxSpeed 195, radius 12) produced reach
1185.077465 WU. Changing the player's actual velocity to 1000 WU/s did not change that function's
result. An unpinned rock at reach + 200 classified S3_DORMANT; supplying imminentCollision classified
it S0_EXACT. This illustrates the available pin mechanism, not a reproduction of a missed fling.

The dated hull-burst report's 850–900 WU failure boundary must not be reused as today's measured
threshold. Camera, maxSpeed and pins matter.

**Architecture correction:** investigate `activityRuntime.js` and `activityClassification.js`
along with the solver. Retaining only the thrown ship or enabling CCD is insufficient when the
potential impact surface is absent. Reproduce the actual trajectory; add bounded consequential
neighborhood demand only if it is missing. Never increase the active universe indiscriminately.

## 5. Rebound Skates needs real contact information

**Source-traced.** The current impact path in
`src/core/sg02DynamicBodyOwner.js:1539–1650` merges contact-force events by body pair and
derives the exposed direction from `event.maxForceDirection()`. Its manifold callback records
a contact point; this inspected path does not expose a persistent begin/stay/end contact episode
with an authoritative surface normal.

`src/core/surfaceContact.js` has a separate authoritative receipt for projectile reflection.
It must not be mistaken for a ready-made ship-surface skating API.

**Planning correction:** the optional skate remains a design hypothesis, and its first implementation
dependency is a minimal stable contact normal/episode contract in the existing physics owner.
Do not steer from force direction, renderer meshes or successive entity-center guesses.
Preserve actual solver impulses, root settle-to-rest behavior and ordinary collision forgiveness.
This makes the earlier broad “use a convex surface” brief more precise without requiring a new solver.

## 6. Material differences are intentional mode/content distinctions

**Executed.** `surfaceResponseFor('rock')` returns `absorb`;
`surfaceResponseFor('bank_stone')` returns `reflect`.
`surfaceContact.js:14–36` explicitly distinguishes campaign rock from Swarm/Survival bank stone.

**Strength:** a shared material response exists and is deterministic.
**Hypothesis to evaluate:** players may need clearer material teaching/recognition for bank-shot
mastery to transfer. No visual confusion was observed in this audit.
**Do not:** make every asteroid reflective merely to fulfill a generic cross-mode consistency slogan.
Use the intended surface material in the selected route and test both supported and unsupported cases.

## 7. Input already separates targeting from movement

**Source-traced.** `src/combat/autoTargetMode.js:140–215` derives weapon lead from the selected
or tethered hostile. Its G-mode flight vector is applied separately; ordinary aim assistance does
not overwrite the physical cursor used for Massline acquisition.
`dynamicFlightStick.js` bounds relative pointer motion and projects through the live camera.
`flightV3.js` delegates force to the propulsion kernel and physics authority.

The newer hull-burst action is rebindable, has Backslash/ISO and middle-button paths, and is unbound
on a standard pad by default in the inspected input code. That is an input-discoverability/reachability
question for the existing modality owner, not permission to steal an occupied binding.

**Planning consequence:** preserve tab-target/power accessibility and trajectory-dependent physical
hits together. Do not replace G steering or add a new obligatory gesture to introduce terrain play.

## 8. World and story have real mechanisms, but their route assumptions matter

**Source-traced.**
- `traffic._onSectorEnter:1522–1570` has a rich Ceres path and a generic activity-pocket materializer
  before ambient traffic. It returns during active Survival runs. Extending Adventure traffic cannot
  substitute for authoring a Swarm scene.
- `environmentalMachinery.update:173–211` selects actual sector-specific currents, apertures,
  crushers, reefs and weather. These effects are not only scenery definitions.
- `encounterDirector._pump:702–782` composes tutorial, tension, progression, proximity and capacity
  gates. Current special handling already prevents the Ceres hauler opportunity from being paced
  away; do not resurrect that historical defect as a new finding.
- `missions._installContract47aColdStart` creates a real sample-recovery contract.
  The B0 story path is ordered sample/mining evidence then dock; B1–B3 advance through embodied
  story missions. `story._releaseDeferredColdStart` listens to tutorial completion.

**Selected existing task:** NXB-046 should exercise each career against these actual prerequisites,
not inject a generic “first kill/trade” event and claim it reached story. If an alternative acquisition
is needed, design it around the real sample/custody contract; do not bypass the spine.
No new quest framework or missing global director was established.

## 9. Avoid confusing catalogs or proxies with player experience

**Source-traced.**
- `newGameDefaults.js` contains the actual Hitch/Pelican/Wasp starter choices.
  `starterBuilds.js` separately describes Hitch career kits. Auditing only one would give a false
  conclusion about hull variety. NXB-030 must name which catalog/route it is comparing.
- `survivalEvolutions.js` contains Storm Carom, consumed held/fitted components, explicit cost
  and slot checks. One synthesis does not prove either adequate depth or a need for many more.
- `techVerbLadder.js` estimates hours using characterized income/RP rates and unlock data.
  Its strict verb classification treats any ship/module unlock as a verb. Those estimates and
  counts are useful planning proxies, not proof of actual travel/earning time or new player actions.
- Existing source documents disagree about frontend authority: root AGENTS names ORRERY while
  the nested UI notes still name Deckplate. This audit does not choose a new style.
  Follow the current root direction and resolve affected routing before a frontend redesign;
  preserve task-needed existing components. Do not create yet another token system.

## 10. Revised order and source-specific work

1. **NXB-018 full-shelf residual:** repair the executed omission, preserving fitting legality,
   transactions and the arc's intentional limited draft.
2. **NXB-017 mode-correct composition:** build the proposed three-round experience through the
   actual Swarm path, preserving existing debut/mass-gap rules and budgets.
3. **Throw-to-world reliability:** reproduce the current residency issue at the exact relevant
   owners. If already fixed, keep its result and proceed; do not make repair theater a dependency.
4. **Optional skate:** only after the contact contract and control behavior are sound; retain the
   selected minimal surface scope and useful route, not a movement-system rewrite.
5. **Ceres district and career continuity:** use current world/mission owners, actual starting hulls,
   normal acquisition and existing settlement paths. Expand only the meaningful missing relationships.

The first two are stronger immediate investments than the initial plan's assumption that a new
movement fitting should necessarily lead. They expose existing content and prevent work landing in
the wrong mode. Presentation, accessibility, saves and frame pacing remain obligations of each delivery.

## Reproducing the most consequential findings

At the inspected checkout, without installing a parallel harness, Node can import the pure production
modules. This is a characterization, not a full game test:

```js
import assert from 'node:assert/strict';
import { planWave } from './src/systems/survivalWavePlanner.js';
import { offerDraft } from './src/data/survivalDraft.js';
import { COMBAT_LAB_STARTER_PACKAGES } from './src/data/combatLabSetups.js';
import { SHIPS } from './src/data/ships.js';
import { buildSlotList } from './src/systems/ships.js';

for (const seed of [47, 4242, 8008]) {
  const base = { seed, arenaId: 'helios_core', wave: 6 };
  assert.deepEqual(
    planWave({ ...base, mode: 'swarm' }),
    planWave({ ...base, mode: 'swarm', recipe: { arenaId: 'invalid' } })
  );
  assert.equal(planWave({ ...base, recipe: { arenaId: 'invalid' } }).ok, false);
  for (const id of ['massline_rig', 'mirror_demonstrator']) {
    const kit = COMBAT_LAB_STARTER_PACKAGES.find(k => k.id === id);
    const hull = SHIPS.find(h => h.id === kit.hullId);
    const fittings = Array(buildSlotList(hull).length).fill(null);
    for (const part of kit.loadout) fittings[part.slotIndex] = part.defId;
    const input = { seed, wave: 1, hullId: kit.hullId, fittings, ruleset: 'swarm' };
    const bounded = offerDraft({ ...input, count: 100 });
    const all = offerDraft({ ...input, count: 1000 });
    assert.equal(all.offers.length, all.eligibleCount);
    assert.equal(bounded.offers.length, 100);
    assert(all.eligibleCount > bounded.offers.length);
    console.log(id, seed, all.eligibleCount, bounded.offers.length);
  }
}
```

Run with `node --input-type=module` and stdin from the repository root. The count-1000 call is a
diagnostic comparator only, not the proposed production fix. After repairing NXB-018, replace the
regression expectation with full eligible-set equality on the normal Swarm path, while keeping a
separate arc-limited-draft control.

Characterizations passed at the pinned revision. No claim here certifies art quality, full production
performance, the entire first hour, or maximum fun. Those remain narrower implementation/agent-review
questions tied to the actual change.
