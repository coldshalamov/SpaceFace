# Regent: piloted production research

Source: PR #942, exact parent `26e5a96c8d101bdadaf081706859f5bde3f150a0`. Research only; no gameplay change.

## Corrected evidence

The previous crossing actor held `Digit0` on every tick. `src/systems/input.js` maps that key to full-stop brake in all three control schemes. The earlier approximately 2.4 WU displacement did **not** establish a propulsion integration defect. Removing that private actor mistake produces ordinary movement.

A full node-safe production manifest, created with `createAuthoritativeRuntime({profileId:'production',nodeSafeOnly:true})` and no selected-system override, was then run with ordinary pointer, turn, forward and strafe events. This was a staged round 25, seed 73311, stock Combat Lab energy-baseline Kestrel at the origin. It is not a normal launch or an earned round-25 build.

- Corrected selected-system trial: at least 836 WU sampled travel; death tick 707.
- Full production-manifest trial: at least 949 WU sampled travel; death tick 677. Crown attack executed at tick 469. This pilot died before furnace execution, so it does not demonstrate the furnace crossing/recovery lesson.
- Instrumented full-manifest repeat recorded 37 `combat:damage` receipts from player 1's ordinary `wpn_pulse_laser_s` to Regent 44, totaling 73.566 shield damage. No armor or hull damage. The unchanged 720 hull was not evidence that guns failed.
- Regent and its existing crown, armor and attack mechanics were not modified. No kills, damage, attachment, poses or impulses were injected after the initial staged setup.

The native runtime is authoritative physics, but no screen pixels were reviewed. These trials establish movement and weapon contact, not fight balance, successful dodging, victory, browser input, full Save/Continue or earned progression.

## Creative decision

Keep the current first-read entrance and existing Mooring Line rounds 26–28. Do not weaken the Regent from a stock staged pilot's defeat. Its current lesson still asks the player to cross the committed furnace bearing, work the stern in recovery, and use available plate. The next useful evidence is a genuinely fitted late-run pilot performing those actions, not another test that treats its intact hull as a failed firing path.

## Toolbox and open goal

- `src/data/encounters/capital-boss/regent.js`: authored three-act crown/furnace score, recovery windows, ballast and stern counterplay.
- `src/runtime/createAuthoritativeRuntime.js`: full node-safe production manifest option; do not mislabel a custom selected-system list as full production.
- `src/systems/input.js`: ordinary event ingress; Digit0 is brake, cursor projection is not a movement command.
- `src/combat/damage.js`: damage receipts distinguish shield, armor and hull; inspect all layers when judging an attack.
- `src/data/combatLabSetups.js`: stock energy-baseline kit is a controlled setup, not earned round-25 progression.

**SF-GAME / SF-WORLD-DIRECTION:** open; owner dot experience integration. Evidence now supports real movement and ordinary laser hits. Next action: recover or earn a late-run loadout and execute crown avoidance, furnace crossing and stern recovery attack under the full manifest, then transition into Mooring. User-dependent operation: none for further source/native investigation; rendered acceptance remains unavailable in this pass.
