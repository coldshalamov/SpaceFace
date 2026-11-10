# RU-7 / RUCKUS — Open Work Order

A demolition retriever whose crew never came back. It has retained one battered pressure core and an unfinished work order. The player gives the order a different meaning: play.

RUCKUS is a neutral, physically present character in **Ceres Belt**, at sector-local **(680, 640)**. The chart names the site **RUCKUS · Open Work Order**. The world converts that local anchor through `sectorLocalToGlobalForSector`; the owner never confuses it with Helios coordinates. A 480-unit dressing exclusion reserves the work yard.

## The encounter

Approach the machine and use the ordinary scanner to hail it. Put the existing Massline on its caged core, then throw it at least 38 units at 16 units/second or more. RUCKUS chases only a recent, authenticated player-handled throw, matches its drift, catches it and physically returns it. Both the retriever and core remain real Rapier bodies. The core's spring hold applies an equal opposite reaction to the retriever, rather than parenting a decorative ball to the model or teleporting it home.

The drop waits until both bodies slow down. First return: “Retrieved. No structural losses. Again.” Second: “This work order can stay open.” Third: **“Crew count amended. Two.”** The tail makes the same transition before the text does.

From the third return onward, the core becomes a pressure present. There is a short presentation beat, a large amber safety circumference, three visible fuse ticks and a three-second countdown. A player-held Massline pauses the fuse. Releasing restores at least 1.2 seconds of safety time. The burst imparts a distance-faded impulse to at most 24 nearby loose bodies, excludes RUCKUS and the core, and applies **no direct hull damage**. Consequential collisions remain ordinary game physics. This is not a credit, repair or loot faucet.

Scan again to suspend the work order. Damage causes a retreat and disarms the gift; it is not interpreted as another play signal. Destroying RUCKUS leaves a persistent, inert memorial. A new game resets that memory. After bonding, stay quietly nearby to hear what happened to the old crew.

## What ships

* Forge-built original body, pressure core, editable `.blend`, three body GLB detail levels and a reproducible Blender authoring script. No purchased meshes, image textures, fonts, CDN assets or decoder download.
* Jointed clamp jaws, four thruster-foot gimbals, pressure flywheel, tail aerial, sim-timed breathing, sleep/death lighting and reduced-motion/reduced-flash behavior.
* A synchronous generated accessor module compiled from the **same checked-in GLBs**. The live visual factory gets the authored silhouette immediately, with no placeholder model or late attachment race. Geometry is cached and shared; instance materials are owned and disposed separately.
* Bounded force-level interception, obstacle diversion, spring carry, return/drop, gift impulse, scanner and Massline provenance checks, persistent friendship and death, mode isolation, cooperative sector cooking and near/far residency.
* Browser and Node production factories, the authoritative clock roster, all three save integration points, chart entry and synthesized audio recipes.
* A focused playable workshop at `tools/ruckus/`. Its pilot controller and empty presentation stage are test adapters. The character owner, models, attachment and Rapier implementation are production modules, not a parallel fake game.

## Reproduce

From the SpaceFace repository root, after its locked dependencies are installed:

```sh
node tools/ruckus/integrate.mjs
node --test test/ruckus.test.mjs test/ruckus-model.test.mjs
python -m http.server 8123
```

Open `http://localhost:8123/tools/ruckus/`. Hail, throw or drag from the core, and use WASD/arrows to fly. The workshop's H / Space / V shortcuts are workshop controls; the campaign keeps its existing configurable scanner and Massline bindings. The workshop has hold/release, pause, inspection, sound, reset and responsive touch buttons.

To rebuild the art with the provided Blender or a compatible installed Blender 4/5:

```sh
blender -b --python tools/blender/characters/ruckus.py -- --render
node tools/ruckus/pack-model.mjs
node --test test/ruckus-model.test.mjs
```

`pack-model.mjs` welds/deduplicates the GLBs, verifies the supported rigid subset, regenerates the runtime module and records sizes, triangle counts and draw calls in `assets/characters/ruckus/manifest.json`. Do not hand-edit the generated buffer module. Source GLBs and `.blend` are editing/interchange assets; retail geometry rides the JavaScript build and does not depend on a new runtime asset-copy mapping.

Browser proof on a WebGL-capable machine:

```sh
npx playwright install chromium
node tools/ruckus/playtest.mjs
```

The browser probe boots the actual workshop, performs three real-physics returns, checks the held fuse and released pulse, captures inspection/chase/gift/mobile images, checks horizontal overflow, and records page errors. Evidence goes to `artifacts/ruckus/browser/`. A browser without a working WebGL context must report that failure, not substitute a DOM-only pass.

## Contracts and maintenance

`src/systems/ruckus.js` owns state and publishes read-only `ruckusPose` facts. Rendering never advances the encounter. Public receipts are `ruckus:state`, `ruckus:retrieved`, `ruckus:pulse` and `ruckus:voice`. `state.ruckus` is a bounded version-1 memory; entity IDs, fuse timers and current physical carry are deliberately transient. A restored pending-stunt core is adopted before spawning a new one, preventing an anonymous duplicate. Hull damage and friendship emit the existing dirty-save receipt.

Every live velocity change uses `physicsAuthority`. No ambient random draws, wall-clock deadlines or player/economy mutations occur in the owner. Cooperative cooking and table-clock registration are shared with the existing characters. The encounter runs in adventure/campaign only, never Crucible, swarm, survival or isolated scenario runs.

The numerical collision hull is a deliberately simple ball around the main chassis. The projecting jaws, antenna and decorative thruster fittings are not separate collision bodies. The core seats ahead of that ball, inside the visual jaws. It is a readable arcade proxy, not articulated-jaw rigid-body simulation.

## Optional extensions, not missing implementation

A mission can listen for `ruckus:retrieved` without owning the core, issuing money or moving the player. Another writer can add a former crew's log to the existing chart/discovery system. Keep the three-return bonding moment, absence of farmable rewards, neutral stance and permanent consequences. Do not duplicate its state machine or add a second physics writer.

For campaign release acceptance, fly to the yard from both Ceres gates on representative low-end hardware and check the authored clearance, ordinary enemy traffic and UI layers at the user's preferred zoom. The focused laboratory proves the encounter, not every unrelated asset or loading path in the multi-gigabyte campaign.
