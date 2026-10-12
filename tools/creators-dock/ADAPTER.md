# Adapter

No registration in an existing file is required.

The dock imports the live modules itself:

- `src/contracts/simScenarioSchema.js` (`validateSimScenario`)
- `src/testing/lab/runScenario.js` (`runLabScenario`)
- `src/testing/lab/entityProfiles.js` (`resolveEntityProfile`)
- `src/data/encounters/shape.js` (`validateEncounterShape`)
- `scripts/lib/userContentStore.cjs` plus `src/data/weapons.js`, `modules.js`, `encounters.js`, `sectorZones.js` inside `lib/probeMain.mjs`

It does not add a system to `src/core/registry.js`, does not edit `src/data/userContent.js`, and does not mount a route in `server.js`.

## Integrated loader fix

The `ENCOUNTERS` merge now runs after `ENCOUNTER_BARKS` is initialized. Exported encounters may reference shipped bark ids; the real loader probe covers this path. The local workstation also refuses foreign Host/Origin requests and validates documents before saving them.

```diff
--- a/src/data/encounters.js
+++ b/src/data/encounters.js
@@ -181,7 +181,6 @@ function mergeUserEncounters(base) {
   return Object.freeze(merged);
 }
 
-export const ENCOUNTERS = mergeUserEncounters(SHIPPED_ENCOUNTERS);
 
 /** Persistent named captains (the seed roster). State lives in state.encounterDirector.named:
@@ -467,6 +466,8 @@ export const ENCOUNTER_BARKS = Object.freeze({
   whisper_scan_hint: 'Signal has a source, {range} out. Hold it on your scanner.',
   whisper_broken:    'The source is wreckage now. Partial data recovered.',
 });
+
+export const ENCOUNTERS = mergeUserEncounters(SHIPPED_ENCOUNTERS);
 
 /** CHN UNKNOWN whisper pool (anomaly ambience — lowercase on purpose; seeded pick). */
 export const WHISPER_LINES = Object.freeze([
```

Run it from the repo root:

```
node tools/creators-dock/cli.mjs serve --port 8765
node tools/creators-dock/cli.mjs validate --example dock.intercept-cargo
node --test tools/creators-dock/test/*.test.mjs
```

Optional, not applied. A later landing can add a package script. This file is the patch, and it is not required for the tool to run:

```diff
--- a/package.json
+++ b/package.json
@@
     "lab": "node scripts/sf.mjs lab",
+    "dock": "node tools/creators-dock/cli.mjs",
```
