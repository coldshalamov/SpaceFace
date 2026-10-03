# RAVEL — The Unraveller

An original SpaceFace character and optional Pallas Drift encounter. This is an implemented
encounter, not a request for a later agent to invent one. The live systems, factory and save
routes register it without a feature flag. Baseline: `1e0cf9499613b7c3acad10f34739278136d3d469`.

## The character

Ravel is a gravity loom made by an absent civilization. It once held a fractured moon together.
The moon has been gone for a very long time. It is still doing the work. It mistakes tension for
purpose, and anything returning to it for proof that it was right to hold on.

A compact fossil-ivory, carbon and worn-brass mechanism sits inside three curved load-bearing
jaws. A violet crystal turns inside the recessed spindle. Three independent, forked counterweights
orbit outside it, joined by lifting, channeled force ribbons. They have one, two and three physical
notches: their identities do not depend on color. A damaged fourth socket never gets a weight.

The counterweights are real dynamic bodies, not decorative moons. They collide, can be caught
with Massline, and leave the mechanism permanently when the player carries them out. Its silhouette
changes with the outcome. The body is built synchronously from original authored mesh geometry;
there are no remote models, textures, procedural-fallback waits, or new packages.

## Find and play

Adventure/campaign: **Pallas Drift**, charted anomaly **RAVEL · The Unraveller**.
Sector-local coordinates **(-940, 620)**; the coordinate membrane places the actual body at
**(-21420, 21100)** in galactic-global XZ. It is not added to Helios or random Crucible waves.
The chart row has `runtimeOwner: 'ravel'`, so the world does not spawn a duplicate anomaly body.

Approach and use the ordinary scanner. The first pulse is a greeting and instructions. A second
pulse within 300 units accepts the challenge. The existing scanner cooldown remains intact.
Another pulse withdraws consent. Leaving 520 units away or docking cancels it; it never chases.

Each cycle has a **2.1-second locked warning**, **1.5-second physical cast**, **4.2-second exposed
spindle**, and **1.8-second recovery**. Aim is sampled once, slightly ahead of momentum. It does not
track a dodge after warning. The warning edges, crescent and combat geometry share the same data.
The expanding crescent deals a small kinetic hit and bounded impulse once per cast; it uses the
existing shield/armor/hull damage router, not its own HP writer. Actual counterweights are also cast.

Two meaningful answers are available. Shoot the exposed spindle to destroy it, or pull all three
counterweights beyond the sparse extraction teeth at radius 128. A player-owned, live, generation-
validated Massline attachment (or a recent release from one) is required; an unrelated explosion
cannot accidentally complete the peaceful route. Hold each outside for 0.35 seconds. Shooting
weights apart is also allowed and gives a scarred version of the resolution. No payout, cargo,
faction or economy mutations are introduced; leaving/reloading cannot farm an encounter reward.

## Personality and secrets

Ravel is not a quest dispenser, pet or comedian. Its speech is precise, faintly proud, and literal
until its usual explanation stops working. It only speaks at meaningful events, through the
existing voice channel and cooldown, with five original spatial synth cues.

After a nonviolent resolution: “Nothing is holding me together. I am still here. That is... new.”
Linger nearby, nearly still, for eighteen simulation seconds: a slender light appears at the empty
fourth place and it admits what is missing. Bring a freed weight back voluntarily, using Massline:
it recognizes the difference between a gift and compulsion. On a third visit it stops calling the
player an intrusion. These memories survive saves. Do not turn these moments into loot popups.

## Engineering ownership

`src/data/ravel.js` owns tuning, dialogue, five synth recipes and the versioned memory whitelist.
`src/characters/ravelRules.js` owns pure geometry, bounded servo and attachment ownership checks.
`src/systems/ravel.js` owns four entities, its state machine and memory. It queues impulses through
physicsAuthority; the production Rapier owner moves bodies. Combat owns damage. Simulation code
imports neither Three.js nor wall-clock or ambient-random state.
`src/render/characters/ravelModel.js` owns the original asset, smooth articulation and force
surfaces. Render animation reads the simulation pose and never writes back. Pose time freezes with
simulation time; reduced motion suppresses cosmetic motion without hiding an attack. Reduced flash
caps emission and wave opacity. Materials/geometry have an idempotent disposal path.

The production factory accepts this synchronous authored-native body as complete. Both browser and
Node authoritative registries contain the system; its update runs before physics. Both save capture
routes and restore call it. Saved state includes hull, destruction, disassembly masks and remembered
encounters, **not a half-fired attack**. Freed weights remain free; destroyed weights do not respawn.
Loaded unfreed/freed bodies begin at the authored orbit; arbitrary free-floating poses and old lines
are intentionally not reconstructed from this small character memory.

## Test and review

Run `node --test test/ravel.test.mjs test/ravel-model.test.mjs` and
`node scripts/sync-modulepreload.mjs --check`. Tests cover registration, global placement, real Rapier
casts and real Massline towing, damage windows, shield routing, scan validation, swept collisions,
peace/destruction persistence, stale bindings, lifecycle cleanup, deterministic transcripts,
asset readiness, geometry budgets, render-only animation, pause and accessibility.

Open `tools/ravel/bench.html` from the normal local server. This isolated encounter uses the actual
production character, combat kernel, attachment service and Rapier. Its training pointer and simple
WASD controller are bench-only; it is not a replacement game mode. C hails/challenges, M grips/cuts
the nearest weight within 100 units, click selects a body, Space fires, and P pauses. The study
button brings the actual model close. Desktop keyboard input is required for flying; narrow-screen
layout is supported for reviewing the model, not claimed as a touch flight implementation.

`tools/ravel/review.mjs` captures real Chromium images and exercises the controls. Set
`RAVEL_PLAYWRIGHT` to a Playwright module and optionally `RAVEL_CHROME` to a Chrome executable.
The focused workflow preserves its report and screenshots. A successful isolated bench is not a
claim that the full world, Electron packaging, all assets, or integrated-graphics performance passed.

## Expansion instructions for the build map

Preserve Ravel as one named encounter; do not turn it into a random enemy reskin. Useful next units:

1. **Sector journey:** add a Pallas station rumor/short navigation lead using the existing missions
   system. Acceptance: ordinary navigation reaches the existing Ravel POI; no second spawn path.
2. **Combat clarity review:** play with production ship sizes, Massline heads, projectiles, camera
   and audio in the complete Pallas world. Acceptance: the smallest and largest pilot can read the
   warning and withdraw; shots hit the exposed spindle; safe players are not drawn into the duel.
3. **Narrative continuation:** a later scrap of the absent moon's history can change one line, not
   retcon Ravel into a Vethari hive or the off-screen doom species. Keep its origin ambiguous.

Do not add generic wave summons, material rewards for repeated scans, a mandatory kill, a screen-
filling boss panel, camera-facing glow discs, random aim, direct velocity writes, or a replacement
GLB loader that reintroduces startup waiting. Changes must keep the peaceful route physically real.
