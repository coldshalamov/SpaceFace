# Adapter

No registration in an existing file is required.

The dock imports the live modules itself:

- `src/contracts/simScenarioSchema.js` (`validateSimScenario`)
- `src/testing/lab/runScenario.js` (`runLabScenario`)
- `src/testing/lab/entityProfiles.js` (`resolveEntityProfile`)
- `src/data/encounters/shape.js` (`validateEncounterShape`)
- `scripts/lib/userContentStore.cjs` plus `src/data/weapons.js`, `modules.js`, `encounters.js`, `sectorZones.js` inside `lib/probeMain.mjs`

It does not add a system to `src/core/registry.js`, does not edit `src/data/userContent.js`, and does not mount a route in `server.js`.

## Withheld loader fix

`src/data/encounters.js` line 184 merges user encounters before `ENCOUNTER_BARKS` is initialized (the table closes at line 469). A user record that sets `bark` throws `Cannot access 'ENCOUNTER_BARKS' before initialization` and aborts the module. Dock encounters omit `bark`, so they load. Do not apply this from the dock. Move the one export to immediately after the bark table:

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
