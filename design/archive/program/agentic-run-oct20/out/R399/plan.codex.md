## 1. GOAL

The player discovers memorable objects before their starter fit can handle the named tow, slam, line or field challenge, then returns with a fit that can. Row 399 ultimately requires at least eight such one-offs, including three opportunities reached during hours 10–25 and the Great Tanker as a capital tow.

## 2. ALREADY TRUE

- `src/data/worldOneOffs.js:WORLD_ONE_OFFS` already authors three explicit doors: Great Tanker `{ kind: 'tow', massT: 800 }`, Runaway Ladle `240 t`, and Erased `260 t`. Their physical masses match their requirements. Preserve these records.
- `src/systems/shipCapabilities.js:revisitDoorState` already evaluates tow, slam, line and field requirements using the live capability calculations. Do not replace these calculations or retune their constants.
- `src/systems/scanReveal.js:capabilityLesson` resolves requirements from `data.oneOffId` back to the authored catalog. Physical one-offs therefore do not need `revisitNeed` stamped onto their entities.
- `src/systems/scanReveal.js:_scanWrecks` attaches the lesson to the wreck’s scan result. `src/systems/scanner.js:_scanSignals` carries its sentence into the public result; `src/ui/signalInvestigationPrompt.js:createSignalInvestigationPrompt` displays that detail through the existing flight decision deck.
- `src/systems/world.js:_spawnWorldOneOffs` already creates physical one-offs as visible, colliding, tetherable wrecks. Its durable-record path preserves identity and moved poses; destroyed records prevent respawning.
- AL-LG-01/02/03 are recorded as shipped, with coverage in `test/al-lg-capability-doors.test.mjs`. Extend their work.
- The actual default Kestrel fit, resolved from `NEW_GAME.fittedModules`, has approximately **65.625 t tow class** and **53.08 WU/s slam survival**. Do not use an empty Kestrel as the starter fixture.
- The ordinary starter line already passes effectively unlimited load requirements. A larger numeric line requirement cannot honestly create the missing starter-to-upgrade door.

## 3. SCOPE THIS SITTING

Implement one complete **eight-object capability-revisit slice**, using existing physical bodies, positions and presentation. Cover all four capability kinds, actual starter refusal, legal upgraded-fit acceptance, rescanning after refitting, physical capability checks and durable object identity.

**Keep row 399 open after this slice.** Defer precisely the requirement that three opportunities—including the Tanker—are first attainable during hours 10–25 through an earned progression route. The existing ladder places the Colossus **licence** at 24.31 hours, but the hull costs another **456,000 credits**; licence timing does not establish ownership timing. The economy also has later opportunity phases, so neither a flat starter-income extrapolation nor a freely supplied capital proves that requirement.

Closing that remainder requires a concrete earned progression route and, if it fails, work in progression owners outside this seam. Do not add time locks, invent income rates, modify those owners, or claim closure from fixtures that simply grant a capital.

The eight-object slice is feasible within one long sitting. Replace browser/GPU acceptance with the deterministic Node checks below; describe their evidence as simulation and scan-route verification.

## 4. FILES

Edit only these clean, unprotected production files inside the `run-memory` boundary:

| File | Exact changes |
|---|---|
| `src/data/worldOneOffs.js` | Add `revisitNeed` to the five existing records specified below; add brief comments identifying the intended return action. Preserve every existing physical/art/placement value. |
| `src/systems/shipCapabilities.js` | Extend only `revisitDoorState`’s line branch with an optional Elastic Whip head requirement and runtime-feature admission. Preserve existing speed-only door behavior. |
| `src/systems/scanReveal.js` | Pass runtime features into `revisitDoorState`; update authored tow readiness and head-qualified line copy inside `capabilityLesson`. Preserve legacy bare-mass/tug behavior. |
| `test/al-long-1-revisit-4242.test.mjs` **NEW** | Focused seeded tests covering authored records, public scan transitions, real capability actions and persistence. |

Read before editing: root `AGENTS.md`, `ARCHITECTURE.md`, `src/AGENTS.md`, `src/data/AGENTS.md`, `src/systems/AGENTS.md`, and `test/AGENTS.md`.

Do not edit protected files, existing tests, manifests, package files or planning ledgers. Do not run mutating git commands.

## 5. STEPS

1. **Recheck exact ownership.**

   Run read-only `git status --short` and `git diff --` for the three production files. They were clean during planning. Preserve any newer foreign changes; if one becomes protected, report the exact collision instead of substituting another production file.

2. **Author five additional requirements on existing physical objects.**

   Keep the existing three explicit tow doors unchanged. Add:

   | Existing record | Exact `revisitNeed` | Intended return action |
   |---|---|---|
   | `oneoff_spare_keg` | `{ kind: 'tow', massT: 90 }` | Get the 90 t keg under way. |
   | `oneoff_impound_shelf` | `{ kind: 'slam', speedWuPerS: 75 }` | Survive a committed contact with the 150 t impounded bulk. |
   | `oneoff_the_pour` | `{ kind: 'slam', speedWuPerS: 90 }` | Survive contact with the 240 t frozen-pour tank. |
   | `oneoff_tethys_tally_keg` | `{ kind: 'line', speedWuPerS: 100, headId: 'elastic_whip' }` | Load and release an Elastic Whip on the disputed keg. |
   | `oneoff_held_note` | `{ kind: 'field', fieldKind: 'decoy', radiusWu: 620 }` | Put a Signal Decoy Buoy beside the waiting delivery. |

   Freeze the new requirement objects like the existing ones.

   These additions produce **eight explicit requirements** without creating bodies or changing collision density. Both slam subjects already meet `HEAVY_AS_TERRAIN_MASS = 150`, so the existing terrain-contact consequence law applies. The field requirement names a decoy deliberately: the live countermeasure owner permits proactive decoy deployment, whereas chaff and ECM require an inbound seeker.

   Comments and scan copy must describe the named action accurately. Do not imply the decoy moves cargo, the whip is required for ordinary towing, or these records introduce rewards.

3. **Add the genuine line capability qualifier.**

   In `shipCapabilities.js`:

   - Import the existing `massline2Flag` reader.
   - Extend the input shape to `revisitDoorState({ derived, fittings, features } = {}, need)`.
   - Preserve the current numeric line verdict.
   - When `need.headId === 'elastic_whip'`, additionally require:
     - `derived.masslineHeadId === 'elastic_whip'`;
     - `massline2Flag('masslineHeadElasticWhip', features) === true`.
   - Return the existing fields plus `requiredHeadId`, `haveHeadId` and `headReady` for a head-qualified line.
   - Unknown nonempty head qualifiers fail closed.
   - Requirements without `headId` retain their current behavior, including the ordinary line’s “holds any swing” result.

   This reads a real existing verb. Do not alter head policies, tension ratings, propulsion or feature defaults.

4. **Keep the public lesson truthful.**

   In `scanReveal.js:capabilityLesson`:

   - Pass `state.runtime?.features` as `features`.
   - For a head-qualified line, name **Elastic Whip** and the **100 WU/s** requirement.
   - If the head is absent or disabled, say the fit lacks the named head and ends with **“not yet.”**
   - If the head is available but its rating is insufficient, retain a load-rating refusal.
   - On acceptance, end with **“ready.”**
   - Keep `kind`, `ready`, `verdict`, `pos`, `trackable`, `paid: 0`, `interactionLocked: false` and `rewardReset: false`.

   For **authored, kinded tow doors**, use `door.ready` exclusively. Currently `improvisedHitch` treats any sufficiently heavy nearby body as an accepting hitch, despite not establishing an attachment; that can falsely announce starter readiness for the Tanker. Remove that override only from this authored branch and return `improvised: false`.

   Preserve `improvisedHitch` and the legacy bare-`{ massT }` tug branch unchanged.

5. **Use the existing live wiring.**

   No new system, event or UI is needed:

   - `world._spawnWorldOneOffs` materializes each existing body.
   - `scanner` consumes `state.input.actions.scanPulse` on its fixed-step update and emits `scan:pulse`.
   - Registered `scanReveal` receives that event and computes the current fit’s lesson.
   - Scanner emits `signal:scanResults`; its public `detail` reaches the existing prompt deck.
   - Actual towing, collision consequences, Elastic Whip and decoy deployment continue through their existing owners.

   Fit readiness is recomputed on a subsequent scan. Do not add a per-frame scan, notification system, unlock flag or interaction lock.

6. **Keep persistence derived from existing owners.**

   Add no persistent state. Requirements remain catalog data; readiness comes from the restored fit, and body poses remain in world records. Do not serialize cached readiness or introduce a “visited/unlocked” save field.

## 6. TEST

Create **only** `test/al-long-1-revisit-4242.test.mjs`.

Use seed **4242**, `DT = 1 / 60`, production runtime features and legal fittings resolved through `fittingsFromDefaultModules`. Adapt the existing scanner/world harness patterns without changing their files.

Include these cases:

1. **Eight authored, physical opportunities.**

   Assert the eight specified IDs have the exact requirements above or their unchanged existing tow requirements. Assert coverage includes all four kinds.

   Materialize their sectors through `world._spawnWorldOneOffs`. Locate bodies by `data.oneOffId`; assert each exists before obtaining its capability, is a tetherable wreck, and retains its catalog mass, position and place ID. Do not pin unrelated entity totals.

2. **Actual starter refuses every named requirement.**

   Resolve `NEW_GAME.shipId` and `NEW_GAME.fittedModules`. For each object in an isolated scanner simulation:

   - Spawn/materialize the real object and scan from 40 WU away.
   - Drive `scanPulse` and fixed ticks.
   - Find that object’s public `signal:scanResults` entry.
   - Assert `SF-174.ready === false`, `verdict === 'not yet'`, and public detail contains the refusal.
   - Assert the body remains present and trackable, with `paid === 0` and `interactionLocked === false`.

3. **Legal fits open the corresponding doors.**

   Use:

   - Hawser for the 90/240/260 t tow requirements.
   - Colossus for the unchanged 800 t Tanker requirement.
   - Mule for both slam requirements.
   - Hawser fitted with `mod_elastic_whip_m` for the line requirement.
   - Kestrel fitted legally with `mod_decoy_buoy_s` for the decoy requirement.

   Assert all requested modules survive slot resolution. Assert `revisitDoorState.ready` and the public scanned verdict both become true.

   For at least the line and field cases, refit and rescan the **same entity in the same simulation**, advancing fixed ticks past the scanner’s existing cooldown. Assert the latest public detail changes to “ready.” Reverting the fit and rescanning must restore “not yet.”

4. **No false line or tow acceptance.**

   - Starter standard line: numeric load capacity alone cannot satisfy the Elastic Whip-qualified requirement.
   - Correct head with its production feature disabled: denied.
   - Correct enabled head: accepted.
   - Unknown head qualifier: denied.
   - Existing speed-only line requirements retain their established semantics.
   - Put an unrelated 900 t wreck within 60 WU of the Tanker. The starter still receives “not yet.”
   - Preserve the existing legacy improvised-tug behavior through its existing regression test.

5. **The accepted verbs have physical effects.**

   - Tow: adapt the independent propulsion-kernel sampling in `lg-tow-predict.test.mjs`. At 60 Hz over 1.5 seconds, the ready fit gets the authored tow load to at least the existing 60 WU/s under-way bar; the starter does not. Test the Tanker with Colossus, too.
   - Slam: call `resolveCollisionConsequence` against each real heavy subject at its authored speed. Apply the fit’s damage reduction as the capability owner does; starter structure is exhausted, while the ready Mule retains structure. Do not use shield capacity to redefine the threshold.
   - Line: adapt the existing Elastic Whip physical harness using the disputed keg’s **140 t** mass. Assert a stretched live attachment stores positive spring energy and its deliberate release produces a nonzero physical response. Reuse existing release behavior; add no impulses in the test.
   - Field: drive the actual `countermeasures` owner through `state.input.deployCountermeasure`. Without the module, no deployment occurs; with the legal decoy fit, assert `countermeasure:deployed` has `kind: 'decoy'`, radius `620`, and a live timed decoy effect.

6. **Persistence and visibility do not become unlock gates.**

   For the Tanker and each newly annotated object:

   - Move the body, capture its durable record, JSON-round-trip the record bag, restore and rematerialize through the existing world methods.
   - Assert stable record identity, moved XZ pose, mass and exactly one matching body.
   - Rescan under starter and upgraded fits; readiness follows the current fit.
   - Restore an older body record without new requirement/head fields; catalog lookup still supplies the requirement.
   - Changing `simTime` alone never changes readiness.

   These assertions prove persistence and absence of time locks. They **do not prove earned access during hours 10–25**.

Run the new file first:

```powershell
node --test test/al-long-1-revisit-4242.test.mjs
```

Then run the existing focused regressions found in the owner searches:

```powershell
node --test test/al-lg-capability-doors.test.mjs test/grok-disc-discovery.test.mjs test/seam-scan-reveal.test.mjs test/scanner-signal-investigation.test.mjs test/world-one-offs.test.mjs test/lg-tow-predict.test.mjs test/massline-elastic-whip-head.test.mjs test/massline-elastic-whip-snap.test.mjs test/countermeasure-denied-readiness.test.mjs test/m2-world-records.test.mjs
```

Do not run `m3-career-cohorts.test.mjs`: its gate writes the protected cohort report. Do not run browser, Electron, GPU or player-truth capture commands. Report any existing regression failure separately; never weaken its assertions.

## 7. RISKS

- **Timing remains unresolved:** fit fixtures establish capability, not when a player earns that fit. The hour-10–25 requirement, including earned capital access, remains the explicit remainder.
- **Capability advice versus locks:** these lessons describe specific actions. They must not prohibit creative interaction with the visible bodies or claim a new puzzle/reward mechanism.
- **Determinism:** use fixed ticks and simulation time only. Pass instance runtime features; avoid global flag mutation, ambient randomness, wall-clock waits and Three.js imports in sim owners.
- **Save compatibility:** no new saved state is required. Keep IDs, masses and positions stable; reconstruct readiness from catalog requirements and restored fittings.
- **Foreign work:** `ships.js`, `modules.js`, `tetherGameplay.js` and `missions.js` are protected. Import their public behavior for tests without editing them. If a focused check exposes a defect requiring those owners, report the exact dependency instead of expanding the write boundary.
- **Completion reporting:** report the eight-object slice as implemented and Node-verified only after its checks pass. Do not mark row 399 closed, edit any ledger, or perform git publication under this task’s restrictions.