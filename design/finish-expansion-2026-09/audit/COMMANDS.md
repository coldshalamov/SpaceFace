# Verified entry points and command safety

These commands were observed in source manifests or tooling. **They were not run against SpaceFace in this audit.** Re-read current help and package scripts before execution; code and ownership may have changed. Run only relevant checks initially, then the current full convergence suite at the appropriate point.

```sh
# Orientation; read-only. Preserve all existing work.
git status --short
git rev-parse HEAD
node scripts/program-dispatch.mjs --ready
node scripts/program-dispatch.mjs --list
node scripts/program-dispatch.mjs --help

# Current server entry points observed in package.json.
npm start
npm run serve

# Relevant existing checks: choose by the changed owner, not all for every tiny leaf.
npm run check:contracts
npm run check:sim:v3
npm run check:sim:v3:compare
npm run check:47a:physical-branches
npm run check:47a:counterplay
npm run check:47a:death-retry
npm run check:crucible:arc
npm run check:attack-spec
npm run check:save-envelope-fidelity
npm run check:asset-runtime-disposal
npm run check:shader-compile
npm run check:known-vs-live-prices
npm run check:alpha:baseline:browser
npm run check:alpha:baseline:electron
```

`program-dispatch --id` expects a current **native PQ packet ID**, not an `SFQ-B`/`SFQ-I` ID and not a guessed leaf ID. No command in this pack writes the repository queue.

## Art entry points

Forge documents the following **patterns**. Replace placeholders with actual existing or newly assigned asset IDs and source files before running. Verify publication ownership first.

```text
blender -b --python tools/blender/forge/ships/<ship>.py
node scripts/fleet-look.mjs --file=assets/ships/forge/preview/<file>.glb --views=inspect,close,top
node tools/blender/forge/publish.mjs <ship>
node scripts/flight-look.mjs --ship=ship_<id>
```

The current UI bench supports named shots and routes; read its current help/native task before choosing IDs. Do not invent CLI flags or write screenshots into the repository as the main deliverable. Actual looking and interaction are required when reviewing visual work.

## Pack validation only

From this ZIP's extracted root:

```sh
python tools/validate_pack.py
python tools/validate_pack.py --repo /path/to/SpaceFace
```

The second command reports candidate source-path existence as advisory. It does not assert those paths are the selected live owners, run game tests, launch the game, install dependencies, merge PRs or change user files.

Sources: S06, S14, S22. API names and test availability may have changed after the inspected pins.
