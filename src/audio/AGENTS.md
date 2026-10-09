# src/audio/

Presentation. Not in the sim update order. `audioSystem.js` runs a gesture-started animation frame. Do not write gameplay outcomes. `state.audioRuntime` is the only bag, and the sim snapshot omits it. Recipes live in `src/data/audioRecipes.js`.

- `audioSystem.js` owns the mix, buses, and gesture gate. `synth.js` owns voices. `sampleLibrary.js` owns the wav manifest and residency tier.
- `combatVerbCues.js` is one recipe or SILENT per player verb. A second subscriber must honor `VERB_CUE_OWNED_BY`. Ammo and target are different recipes.
- `hitVoice.js` admits one layer voice per target per 40 ms. A shield break is not a tick.
- `cuePriorityBus.js` ducks `weaponLoop` and `engineLoop` only, above 0.8.
- `fieldAudio.js` reads `state.fields.active`, cap 6, plus the gyre beds.
- `masslineInstrument.js` is pure. Release and break do not share a recipe.
- `environmentMix.js` is void, hangar, or station. Mine and drill are void.
- `Math.random` is legal for noise buffers and station-ambience timing. It is not legal in any function `systems/` calls during the fixed tick.
- Do not create a second `AudioContext`. Do not start the context before a gesture.
