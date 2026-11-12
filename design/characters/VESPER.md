# Vesper / SV-3 — the kinetic choir

**Implemented:** an optional Helios encounter delivered as source, not a plan-only character. Source baseline:
`26c4e0e6dca581a423be5ad43a2a004c875cc29e` (2026-10-02). No old character, mission, UI,
ship asset, existing sound or player control is replaced.

## The reason to make this

SpaceFace already has Morrow's momentum-rescue encounter and a developing hostile/adaptive cast.
Vesper fills a different space: a stranger worth playing with, using the actual physics toys rather
than another shop, combat buff or dialogue menu. A retired survey machine has repurposed its three
calibration resonators into a band. It does not understand why this matters. It is certain it does.

The character's silhouette is a damaged mechanical moth: four hinged, louvred listening sails,
a binocular sensor head with one replaced lens, copper tuning prongs, ivory ceramic shoulders,
open charcoal trusses and narrow jade light inlays. One repaired sail is deliberately copper.
Nothing needs a texture, downloaded model, sprite sheet or paid asset. The authored geometry
factory **is** the production rig; source produces the model and its articulated animation.

## Find and play

Adventure/campaign, **Helios Prime, X 720 / Z 250**, chart entry **Vesper's Rehearsal**. The chart
marks the original meeting place, not a tracker stuck to the moving machine. There are four
solver-owned dynamic bodies: Vesper and three loose resonators. `runtimeOwner: 'vesper'` prevents
the catalog point from spawning a second generic anomaly on top of them.

Scan within 195 WU. Vesper wakes, unfolds, and demonstrates **LOW → HIGH → MIDDLE**. The LOW
instrument is a round, open barrel; HIGH is a three-pronged crown; MIDDLE is an open tuning fork.
Pitch is encoded in geometry, scanner names and text, not color alone. Target a bell with the
existing Massline, move it at least 7 WU, and release at 9 WU/s or more. The rules inspect actual
post-solver positions and velocity; holding a button while stationary does not win. Useful
player-caused physical impacts can also play a phrase. Ambient collisions ring but do not earn it.

There are 24 seconds between phrase notes, no penalty, no inventory price and no precision rhythm
window. A wrong note resets the phrase prefix, not the world. A scan repeats the demonstration
until the first success. Existing toast feedback names the next required instrument.

Complete the phrase: Vesper answers, its sails open, and a folded five-petal harmonic surface grows,
holds, and dissipates around it. After the first success, scan toggles **follow around Helios** /
**settle here**. This is not a cross-sector companion. Its position and the three bells' actual motion
persist on saves and sector visits. Following is intentionally not restored from a load.

The bells really are loose. Pull one away, throw it, strike something with it. Return motors wait
four seconds after release/contact before applying at most 4.5 WU/s². They never teleport home or
fight a player's active tether. Vesper follows with at most 6 WU/s², staying about 82 WU behind
travel direction; it cannot grab, steer, heal or accelerate the player's ship. The response is an
additive impulse through the existing physics membrane, not an independent physics engine.

Shoot the conductor and it closes up and stops conducting/return motors for 14 seconds. It does
not retaliate or award pity loot. Kill a bell and its bridge window goes dark. Kill the conductor
and surviving bells remain loose playable matter. Destroyed bodies stay destroyed after load.
No money, consumables, achievements, faction reputation or progression rewards are minted.

## Personality and small discoveries (spoilers)

Vesper is precise, courteous, quietly delighted and a little lonely; never a joke dispenser.
Its attention tracks the ship rather than the camera. Idle breathing and sail flex are slow;
state changes interpolate rather than snapping. It speaks through the existing voice arbiter.

- Play **MIDDLE → HIGH → LOW**: it hears the other side of the memory and answers backwards.
- Ring all three physically within 1.35 seconds: an unprofessional chord earns an amused reply.
  A scheduled demonstration cannot trigger this, and this Easter egg grants no progression reward.
- Stay quietly near it for 19 seconds: a small observation about the distances between things.
- Leave and come back: it kept your part. Each Easter egg is saved and only discovered once.

> Calibration cancelled. Music remains.
>
> That was not in the manual. Keeping it.
>
> We were built to measure the distance between things. Nobody specified which things.

## Ownership and integration map

| File | Responsibility |
|---|---|
| `src/data/vesper.js` | Tunables, dialogue, three authored synthesis recipes, versioned bounded save whitelist |
| `src/systems/vesper.js` | Four entities, scan/physical interaction, steering commands, visit memory and lifecycle |
| `src/render/characters/vesperModel.js` | Authoritative production geometry, rigid joints, time-driven materials, disposal |
| `src/core/registry.js` | Browser system registry |
| `src/runtime/nodeSystemFactoryTable.js` | Node/worker factory parity |
| `src/runtime/authoritativeSystemManifest.js` | Init and update once, before physics consumes commands |
| `src/save/saveSystem.js` | Async capture, synchronous export and dependency-ordered restore |
| `src/render/visualFactory.js` | Special authored drone visual branch before ordinary drone fallback |
| `src/data/sectors.js` | Runtime-owned discoverable meeting-place entry |
| `src/data/audioRecipes.js` | Existing spatial mixer's recipe table; no second audio engine |

Consumed events: `scan:pulse`, `tether:latched`, `tether:released`, `tether:cut`, `tether:broken`,
`physics:impact`, `combat:damage`, `entity:killed`, `sector:exit/enter`, `save:restoring/loaded`,
`game:newGame`. Cut/released dual receipts are consumed once. Scans validate source, scanner
identity, sequence, range, position, current mode and docking/pause state.

Published observational events: `vesper:met`, `vesper:note`, `vesper:phraseProgress`,
`vesper:performance`, `vesper:voice`; normal `audio:cue`, voice helper, toast and memorial comms.
Observers must not use these to counterfeit damage, economy or note inputs.

`state.vesper` schema v1 includes only met/visits/performances, one-time memories, mute deadline,
and four finite physical body records. No Three objects, functions or transient entity IDs are
serialized. The per-body `data.vesperPose` is a presentation snapshot. Motion/render clocks use
published sim time; wall time never changes gameplay. No RNG is consumed. Owned-body cleanup,
subscription teardown, save migrations and duplicate reconciliation do not touch unrelated bodies.

## Art, hearing, collision and performance boundaries

All four source assets together: **64 meshes / 19,796 triangles**, including transient harmonic
surfaces. The conductor is **43 meshes / 9,044 triangles**. Rigid mesh pieces are merged by material
inside each independently articulated assembly. No added textures, lights, asset-loader requests,
full-screen passes, shadow maps, workers or external packages. A four-body scan reconciles only
once per simulation second. Near-zero station-keeping does not queue wake-up impulses.

The conductor has an 11-WU central physical hull. Its listening sails are flexible/non-colliding
appendages, not promised compound hard colliders; bells have explicit 4.5-WU spherical proxies.
The physical proxy does not expand to include the VFX radius. These are deliberately declared
substance choices, not a hidden collider inferred from glow size.

Three pitch recipes use the existing oscillator synth and spatial `audio:cue` contract. The game
mixer retains gesture unlock, settings mute/category volume and spatial attenuation. The bench
also calls the production `playRecipe` synth, but is not an end-to-end test of the complete mixer.
Visual notes remain usable without sound. Reduced motion removes idle movement; reduced flash
reduces emissive modulation and harmonic energy. There are no high-frequency flash effects.
The 6-second celebration and 2.4-second note response each have emergence, persistence and decay.

Do not infer a whole-game frame rate from triangle counts or a standalone bench: shared lighting,
shadow policy, all the other entities and the user's GPU still determine runtime cost.

## Reproduce and review

```sh
node --test test/vesper.test.mjs test/vesper-model.test.mjs test/morrow.test.mjs test/morrow-model.test.mjs
node server.js 8123
# Open /scripts/characters/vesper-bench.html on that local server.
node scripts/characters/check-vesper-browser.mjs
node scripts/characters/export-vesper-models.mjs .devshots/vesper/interchange
```

The bench uses the production model factory, simulation, Rapier owner, impulse membrane and synth.
Its test grip applies a physical force; the in-game interaction still uses the actual Massline.
Model-study poses are explicitly presentation-only and are never offered as gameplay acceptance.
The browser checker plays via public pointer controls, then captures stills, tests pause/reset,
checks narrow layout and teardown, and writes `.devshots/vesper/browser-report.json`.

The GLB exporter preserves the exact static geometry, materials and rigid-joint hierarchy for DCC
review. Procedural shader overtones and animation code stay in the source rig; no baked animation
clips are claimed. Generated GLBs are optional interchange and are not extra runtime downloads.

At authoring time **49 focused local tests passed**, including real Rapier tests and the existing
Morrow regressions. The authoring VM browser refused WebGL context creation. The final GitHub delivery operation was blocked, so that optional remote browser validation
was not executed. The included checker remains available for an environment with WebGL.
Full-game acceptance with the repository's omitted multi-GB art is **not claimed**.

## Reserved extensions for later agents — not required for this encounter to work

**Lost listening station.** A hand-placed salvage job uses the existing job/contract authority to
transport one already-existing resonator to a survey receiver. Read the live body ID from the
character owner; never clone it or make a second inventory version. Acceptance: the same moving
body completes the delivery, save/load during towing preserves it, and abandonment leaves the
physical object where it was. No automatic respawn after a combat death.

**A duet scored from real impacts.** Subscribe to `vesper:note` for a post-encounter codex entry
that records a short bounded list of actual notes and source kinds. Do not bind generated rewards
or route observer data back into `physics:impact`. Acceptance: a demonstration cannot claim a
player stunt; muted/audio-disabled users receive the same textual record.

**Survey memory, not a new alien faction.** One existing quest can reveal a short, uncertain survey
record through Vesper after an actual physical performance. Fit it to existing Vethari/ancient
machine lore with the narrative owner's review. Do not invent a second fungus, rewrite the alien
arc, gate core progression on hearing pitch, or replace this quiet encounter with a mandatory boss.

**Measured far-view optimization.** Capture the full scene at normal chase distance on integrated
graphics before editing geometry. If it matters, merge more rigid cage detail without losing the
three silhouettes, and compare the same scene/camera/hardware. Do not replace physical bells with
sprites, particles or scripted orbits, and do not redesign ORRERY while doing this work.
