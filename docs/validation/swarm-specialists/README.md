# Swarm specialist implementation and validation

Rebuilt on 2026-11-01 against `35b99d8727a21c640e6dca93ef769802c1ed12cf`, then integrated
upstream through `aa212937baaead371a96e4fc059d481bcd5ec0c1` at local merge `59d594c81`.
The latest merge includes shared worker, damage and renderer changes plus Iron Kraken encounters;
the affected specialist and Kraken contracts were rechecked together after that merge.
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
| Latest upstream integration | **PASS: 36 test files** after the `aa212937b` merge: the original 28 plus six Kraken suites, authored worker motion frames and capital-boss score contracts. See [post-merge-tests.txt](post-merge-tests.txt). Combat grammar/save-reload, production ports, module-preload closure (1,095 source imports) and the three release-pin checks also passed again. |
| Final mine throw payoff | **PASS: 12 affected test files** after correcting thrown damage attribution. The real combat kernel damages a different same-wave hostile, preserves the layer's deployment ownership/cap, damages only one trigger victim, and retains the 0.5-second thrower grace and ordinary unthrown hostility. See [mine-throw-tests.txt](mine-throw-tests.txt). |
| Combat grammar and save/reload | **PASS**, including the eight combat grammar checks and combat save/reload persistence. See [combat-check.txt](combat-check.txt). |
| Production AI ports | **PASS**. The new hints are a bounded kind enum and a ward entity ID, never raw entity data. See [production-ports.txt](production-ports.txt). |
| Source syntax and scenario schemas | **PASS**: 2,810 modules parsed at the contract check; all three scenario/tape schema inputs validated. |
| Module preloads | **PASS** after regeneration. See [module-preload.txt](module-preload.txt). |
| New asset chain | **PASS for all three**: ordinary hostile resolver selects the new release body, release hashes and byte counts match, optimized-package provenance matches, motion-bank seal/source hash matches, and each rigid mechanism owns meshes at all three LODs. |
| Focused release-manifest pins | **PASS: all three pilots** consistent with their on-disk release assets. See [release-pins.txt](release-pins.txt). |
| Rebuilt asset and presentation contracts | **PASS** after the fixed-body retro-port correction. Tests verify actual compression, both retro sockets' static ancestry, package hashes, motion bindings and the production worker/read-model path. See [asset-presentation-tests.txt](asset-presentation-tests.txt) and [compression.json](compression.json). |
| Selected model-truth census | **PASS** for Warden, Jackal and Anchor, all green with no collider/LOD over-tolerance flags. Only these three semantic rows were regenerated. |
| Authored model, motion and VFX captures | **PASS: 12 inspected views**: windup, active, recovery and full active tell for each unit. The three active close views were repeated after the latest shared-renderer merge and checked against the optimized-package content hashes. See the [visual receipt and phase sheet](visuals/README.md). |
| Preparation copy and desktop wrapping | **PASS: 6 inspected views** at 1280×720: Armory and Refit before waves 6, 9 and 22. Exact threat/counter text, real preparation-owner wave agreement, viewport bounds, clipping checks and zero uncaught page errors. See the [UI receipt](ui/README.md). |

The production presentation regression exercises actual worker replies through structured cloning
and the existing read model. It verifies phase changes on existing entities, nested in-place
geometry/energy changes, no repeated vitals for steady tells, replacement of the fallback with an
authored root of the same child count, world-origin offsets, recovery clearance and deletion of an
actively visible tell. The separate package tests check actual generated GLBs and motion bindings.

Final counterplay review found that the existing mine trigger admitted a player-thrown mine against
the layer's pack, but its damage request still named the layer as attacker. The canonical
friendly-fire gate could therefore reject the promised payoff. Thrown impacts now use the recorded
thrower for damage attribution while keeping original deployment ownership. The new regression
executes the real combat kernel rather than replacing damage routing with a call-count stub.

## Rendered evidence

![Warden, Jackal and Anchor through windup, active and recovery](visuals/phase-contact-sheet.webp)

The [visual evidence](visuals/README.md) retains twelve full-resolution lossless screenshots,
including each complete active tell, plus actual motion-pivot and overlay-state receipts.
The fixed retro ports remain seated as the Warden wings deploy. Cold frames showing an effect
without its hull were rejected and replaced; none is included in the accepted set.

The [six preparation views](ui/README.md) exercise the real Armory and Refit screen modules.
The initial UI fixture failed because changing `run.wave` alone left the preparation owner's
committed wave unchanged. Reopening that owner before refresh corrected the fixture; the final
screens display the corresponding real offers and the exact configured specialist counter.
No production UI workaround or budget/golden update was required.

## Known limits and baseline failures

`npm run check:contracts` is **not an overall pass**: its source-reachability stage reports ten
existing UI modules. The exact same ten failures occur using unchanged Git-base source through the
same checker. [baseline-reachability.json](baseline-reachability.json) records both lists and their
equality. No exception list or threshold was weakened to conceal this inherited failure.

The repository-wide release-manifest pin command cannot complete in this sparse checkout: its run
reported 414 missing unrelated release files (`ENOENT`), with no other failure type. The three new
packages have their own passing hash/provenance/motion/LOD checks. This is not a claim that every
asset in the repository was audited.

The published PR's mobile-readiness CI passed 153 worker/touch/runtime cases, then failed in retail
packaging because its sparse checkout omits the existing required `assets/characters/ruckus` tree.
[ci-triage.md](ci-triage.md) links the run and proves the workflow, packager and required assets were
unchanged from the base. This inherited build failure remains a failure; subsequent browser
acceptance did not run.

The initial branch's separate retail-smoke build/title-boot workflow passed. Its broader check
workflow remains red in several groups. UI-budget staleness includes 77 inherited files and one
newly changed preparation owner (`crucibleDraft.js`), so it is not wholly inherited.
The [CI triage](ci-triage.md#broader-checks-and-ui-baseline-scope) records the narrower source and
asset evidence; no full-suite, global UI-budget or whole-catalog pass is claimed.

Rendered verification uses explicit game-renderer and UI fixtures, not an ordinary run reaching
waves 6, 9 or 22. SwiftShader capture warnings, including slow cold passes and a separate
line-hardware admission deadline, are retained in the visual receipt. No hardware performance
improvement, full-run balance acceptance or claim of "optimal fun" follows from the focused checks.
Those require representative play on the ordinary route; the implementation and tuning remain
directly reviewable.

## Reproduction

```sh
node --test test/swarm-specialists.test.mjs test/swarm-warden-custody.test.mjs \
  test/swarm-specialist-presentation.test.mjs test/swarm-specialist-preview.test.mjs \
  test/swarm-specialist-assets.test.mjs test/ear-mine-armed.test.mjs
npm run check:combat
node scripts/check-sg06-production-ports.mjs
node scripts/check-release-manifest-pins.mjs --only=swarm-warden,swarm-jackal,swarm-anchor
node scripts/model-truth-census.mjs --only=warden_escort,mine_layer_jackal,field_anchor_controller --update-selected --check
node scripts/sync-modulepreload.mjs --check

# Compatible Chrome in SF_CHROMIUM; full normal boot assets for fleet-look.
node scripts/fleet-look.mjs --specialists --with-overviews --views=close \
  --timeout=150 --out=scratch/swarm-specialists/reproduce
node scripts/capture-swarm-specialist-previews.mjs
```

With Blender on `PATH` and a full asset checkout, rebuild the bodies and their generated motion
banks through the three Forge entries:

```sh
node tools/blender/forge/publish.mjs swarm_warden,swarm_jackal,swarm_anchor
```

The existing publish command also rebuilds package metadata and the census. Preserve source GLBs,
release GLBs, optimized packages, motion banks, manifests and selected census together.
The current Forge whole-hull reader recognizes the shared texture-role compatibility metadata
authored on the new textured materials; no global census-reader semantics were changed.
