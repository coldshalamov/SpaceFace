# Causal Foundry integration patch (not applied)

## Current tool behavior

The generator reports template families separately from seed/numeric variants.
The 115 attempts are 18 template families, not 115 distinct compositions. A
collision atom requires a physics-owner solid-contact observation involving the
player; speed change or projectile drift cannot satisfy it. The read-only witness
runs through the existing internal lab API and remains non-promoting. Fixed
anchors and movable masses are distinct physical supports in novelty signatures.
Fresh output can be directed with `--out=.devshots/causal-foundry`.

Do not apply this while `src/data/encounters/**` and `index.generated.js` are owned by the world/encounter program (open PR #264). Foundry scenes already run through `src/testing/lab/runScenario.js`. They are lab scenarios, not four-axis encounter modules, and they stay out of the default encounter index.

## Do not patch

- `src/data/encounters/index.generated.js` (generated catalog imported by `src/systems/encounterDirector.js`, `src/data/encounters.js`, `src/render/renderer.js`)
- `src/data/encounters/catalog.js`
- `src/core/**`, `src/systems/flightV3.js`, `src/render/**`, `src/ui/orrery/**`, `src/save/**`

## Ready patch — name the contact-damage system in the lab bundle

File: `src/testing/lab/systemBundles.js`

The foundry vocabulary atom `collision.hull` is blocked because a ram in the focused bundle exchanges momentum and does not write hull. `collisionConsequences` is a live system and is absent from `resolveNamedSystems`. After the encounter program is clear, a scene can name it. This does not register encounters.

```diff
--- a/src/testing/lab/systemBundles.js
+++ b/src/testing/lab/systemBundles.js
@@ -8,6 +8,7 @@ import { combat } from '../../systems/combat.js';
 import { tetherGameplay } from '../../systems/tetherGameplay.js';
 import { masslineTelemetry } from '../../systems/masslineTelemetry.js';
 import { save } from '../../save/saveSystem.js';
+import { collisionConsequences } from '../../systems/collisionConsequences.js';
 import { createLabControllerSystem } from '../../../scripts/lib/masslineControlLab.mjs';
@@ -76,6 +77,7 @@ function resolveNamedSystems(names) {
     tetherGameplay,
     masslineTelemetry,
     save,
+    collisionConsequences,
     masslineLabController: createLabControllerSystem(),
   };
```

A scene that needs contact hull then adds `"collisionConsequences"` to its `systems` array after `physics`. Do not add it to the default flight bundle; ordinary rams must keep the current momentum-only contract until a scene opts in.

## Not a patch

Fields, cargo custody, law witnesses, industrial machines, NPC jobs, and cold Massline latch stay non-runnable. The scenario schema cannot initialize them. Adding those systems to the named map without an initializer would be a fake cause. See `tools/causal-foundry/vocabulary.js` atoms with `runnable: false`.
