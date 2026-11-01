# Swarm specialist implementation and validation

Rebuilt and checked on 2026-11-01 against `35b99d8727a21c640e6dca93ef769802c1ed12cf`.
The October 30 working checkout was cleared before publication. Its recorded design was restored
against current source; the results below are fresh checks of that restored implementation.

## Delivered behavior

| Specialist | Power and physical counter | Complete integration |
|---|---|---|
| Warden Escort | Same-wave ward, 300 WU range, 92-point capacity and 40% bounded direct-hit sharing when the guard's body crosses the shot line. Shoot or displace the guard, flank its body, or wait out its window. | One shared custody decision drives real doctrine movement and protection; 30-tick deploy, up to 180 active ticks, 90-tick break recovery and fresh relink tell. Authored split-wing hull, rigid animation and a finite-energy ward marker. |
| Mine-Layer Jackal | Frozen one-sided forecast, three shootable/throwable mines and an open opposite flank. Mines hit one trigger victim; they do not invent an area-damage chain. | Canonical mine owner, stationary initial release, 30-tick tell, 18-tick spacing, 90-tick arming, three-mine cap, 360-tick cooldown, 720-tick lifetime; tagged-only wave/run cleanup. Authored ordnance bay, ejector gates, wake forecast and positional arming audio. |
| Anchor Controller | A finite 220 WU snare with strength 88. Displace it at least 36 WU during spool or hold to cancel the cycle, or stay outside its ring. | Canonical field/impulse owners, initially unarmed, 30-tick spool, up to 180 active ticks, 75–200 recovery ticks plus existing reform. Authored spool and articulated vanes, windup boundary, active boundary and no danger ring during recovery. |

These deepen the existing enemy IDs. The new power rules are gated to ordinary Swarm cohorts;
Adventure keeps its existing specialist behavior. The new authored appearances resolve through
the existing enemy identities. No new registered simulation system, parallel damage authority,
enemy quota or independent physics writer was added.

The [enemy ecology document](../../../design/swarm/ENEMY_ECOLOGY.md) contains the verified current
taxonomy, selection rationale, eight future briefs, prototype tuning, rig requirements, owner paths,
counterplay, caps, cleanup and acceptance criteria.

## Fresh verification

| Check | Result and scope |
|---|---|
| Focused integrated regression batch | **PASS: 28 test files**, including specialist mechanics, real production custody/sensor/doctrine geometry, mine ownership and wave cleanup, existing Adventure behavior, actual field impulses, damage routing, arming audio, worker/read-model transport, preview copy and asset chains. See [focused-tests.txt](focused-tests.txt). |
| Combat grammar and save/reload | **PASS**, including the eight combat grammar checks and combat save/reload persistence. See [combat-check.txt](combat-check.txt). |
| Production AI ports | **PASS**. The new hints are a bounded kind enum and a ward entity ID, never raw entity data. See [production-ports.txt](production-ports.txt). |
| Source syntax and scenario schemas | **PASS**: 2,810 modules parsed at the contract check; all three scenario/tape schema inputs validated. |
| Module preloads | **PASS** after regeneration. See [module-preload.txt](module-preload.txt). |
| New asset chain | **PASS for all three**: ordinary hostile resolver selects the new release body, release hashes and byte counts match, optimized-package provenance matches, motion-bank seal/source hash matches, and each rigid mechanism owns meshes at all three LODs. |
| Selected model-truth census | **PASS** for Warden, Jackal and Anchor, all green with no collider/LOD over-tolerance flags. Only these three semantic rows were regenerated. |

The production presentation regression exercises actual worker replies through structured cloning
and the existing read model. It verifies phase changes on existing entities, nested in-place
geometry/energy changes, no repeated vitals for steady tells, replacement of the fallback with an
authored root of the same child count, world-origin offsets, recovery clearance and deletion of an
actively visible tell. The separate package tests check actual generated GLBs and motion bindings.

## Known limits and baseline failures

`npm run check:contracts` is **not an overall pass**: its source-reachability stage reports ten
existing UI modules. The exact same ten failures occur using unchanged Git-base source through the
same checker. [baseline-reachability.json](baseline-reachability.json) records both lists and their
equality. No exception list or threshold was weakened to conceal this inherited failure.

The repository-wide release-manifest pin command cannot complete in this sparse checkout: its run
reported 414 missing unrelated release files (`ENOENT`), with no other failure type. The three new
packages have their own passing hash/provenance/motion/LOD checks. This is not a claim that every
asset in the repository was audited.

Rendered verification is an explicit game-renderer fixture, not evidence of an ordinary run reaching
waves 6, 9 or 22. Historical October 30 startup attempts did not reach a live encounter, and their
lost screenshots are not reproduced as fresh evidence here. No hardware performance improvement,
full-run balance acceptance or claim of "optimal fun" follows from the focused checks. Those require
representative play on the ordinary route; the implementation and tuning remain directly reviewable.

## Reproduction

```sh
node --test test/swarm-specialists.test.mjs test/swarm-warden-custody.test.mjs \
  test/swarm-specialist-presentation.test.mjs test/swarm-specialist-preview.test.mjs \
  test/swarm-specialist-assets.test.mjs test/ear-mine-armed.test.mjs
npm run check:combat
node scripts/check-sg06-production-ports.mjs
node scripts/model-truth-census.mjs --only=warden_escort,mine_layer_jackal,field_anchor_controller --update-selected --check
node scripts/sync-modulepreload.mjs --check
```

Rebuild the bodies through `tools/blender/forge/publish.mjs` and its three fleet entries. Preserve
source GLBs, release GLBs, optimized packages, motion banks, manifests and selected census together.
The current Forge whole-hull reader recognizes the shared texture-role compatibility metadata
authored on the new textured materials; no global census-reader semantics were changed.
