### ADVERSARIAL REVIEW — PQ-173.00: Crucible Feel Bench

---

### 1. Does this diff actually measure the real game, or is any part of it still a generator?

**Verdict:** The core simulation loop executes the real production path (`createAuthoritativeRuntime` with `profileId: 'production'`, `nodeSafeOnly: true`, `rapier-dynamic` physics, `sg06-tactical` AI, and `flightV3`). The old stand-in combat kernel (`createCombatKernel`), the synthetic knock schedule (`planKnockEncounters`), and manual velocity tampering (`player.vel.x += knock.dVX`) have been removed. 

However, several metrics and trace items are still fabricated or attributed heuristically rather than directly observed from systems:

1. **Direct mutation check:**
   - **Velocity/Position/Rotation:** Nothing in the simulation writes `player.vel`, `player.pos`, or `player.rot` directly. Velocities and positions are updated solely by the Rapier dynamic physics authority. Initial position is set once via spec in `runtime.spawn` ([crucibleBench.mjs:238-245](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L238-L245); diff lines 418-425).
   - **Player State Mutation:** `unlockAllTech` directly mutates `player.researchPoints += rp + 1000` ([crucibleBench.mjs:534](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L534); diff line 779) and calls `economySys.grantCredits` to bypass tech tree gates before the run starts.

2. **Gameplay event bus emissions:**
   - The harness emits **only** `run:beginRequested` ([crucibleBench.mjs:283](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L283); diff line 481) and `run:loadoutReady` ([crucibleBench.mjs:300](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L300); diff line 528) via `harnessEmit`. No other gameplay events are emitted onto the bus by the harness.

3. **Invented numbers, events, and physical effects:**
   - **`bodiesInvolved: 2` (Invented number):** In [crucibleBench.mjs:700, 708](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L700) (diff lines 951, 959), `eventTrace.push({ tick, type: 'combat:collateral', data: { bodiesInvolved: 2 } })` hardcodes the literal number `2` instead of reading the actual collision participants from physics receipts.
   - **`cruiseSpeedOf` default `195` (Invented number):** In [crucibleBench.mjs:1006](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L1006) (diff line 1281), if `player.maxSpeed` is missing, null, or `<= 0`, it falls back to a hardcoded `195` WU/s.
   - **`CRUISE_FRAC = 0.72` (Invented scalar):** Hardcoded constant at [crucibleBench.mjs:60](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L60) (diff line 64) rather than derived from player engine specs.
   - **Knock `headingChangeRad` (Attributed physical effect):** In [crucibleBench.mjs:377, 795](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L377) (diff lines 605, 1046), `headingChangeRad` is computed from `wrapAngle(headingAfter - headingBefore)` across the entire tick. This conflates steering inputs with physical impact rotation and distributes net tick rotation uniformly across multiple impacts on the same tick.
   - **Synthetic `verb:used` events:** In [crucibleBench.mjs:648](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L648) (diff line 893), the harness synthesizes `verb:used` into `eventTrace` from polling `state.input`. This is not an event emitted by the game engine.
   - **Fabricated release intent:** In `drivePilot` ([crucibleBench.mjs:603](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L603); diff line 848), `acts.push('release')` is pushed to the pilot's intent tape without pressing any key or driving any input device.

4. **Pilot intent vs system output in metrics:**
   - Metrics are computed in `summarizeMetrics` ([crucibleBench.mjs:799-845](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L799-L845); diff lines 1050-1104) and `finalizeCombatCounts` ([crucibleBench.mjs:863-883](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L863-L883); diff lines 1135-1153) from `eventTrace` and raw bus events, not from `inputTape`.
   - However, `killCause` ([crucibleBench.mjs:749-756](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L749-L756); diff lines 1000-1007) assigns a kill's `cause` based on `lastActionOn` or `lastAction`, which is updated by polled input states (`sampleIssuedVerbs`).

---

### 2. DETERMINISM

**Verdict:** Determinism is sound. Two runs with the same seed across fresh Node processes produce identical `runHash` values (verified: seed `4242` on arena `helios_core` produces `6c5cbb5fc0171d788d73700dcb7a2f1637d81f35fb324bd52501889da34f2590`).

1. **Ambient sources of randomness and wall-clock time:**
   - **`Math.random`:** 0 calls in the module. Randomness is seeded via `mulberry32((seed ^ 0x9e3779b9) >>> 0)` ([crucibleBench.mjs:306](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L306); diff line 534).
   - **`performance.now`:** 0 calls in the module.
   - **`Date.now` / Wall Time:** Read only in `wallNow` ([crucibleBench.mjs:1058](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L1058); diff line 1333) and `elapsedMs` ([crucibleBench.mjs:1063](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L1063); diff line 1338).
   - **Exclusion from hash:** Verified. Wall times (`wallMs`, `msPerTick`, `durationMs`) are attached to run records ([crucibleBench.mjs:121, 471, 916](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L121)) but are strictly excluded from `hashableMetrics` ([crucibleBench.mjs:885-906](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L885-L906); diff lines 1155-1181) and `hashPayload` ([crucibleBench.mjs:437-453](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L437-L453); diff lines 675-691).

2. **Container iteration stability:**
   - `held` in `sampleIssuedVerbs` ([crucibleBench.mjs:631](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L631); diff line 876) is a `Set` populated sequentially and iterated. JavaScript sets maintain insertion order.
   - `eventTrace` is explicitly sorted before hashing: `eventTrace.sort((a, b) => (a.tick - b.tick) || String(a.type).localeCompare(String(b.type)))` ([crucibleBench.mjs:424](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L424); diff line 656).
   - `computeRunHash` sorts all payload keys alphabetically using `Object.keys(data).sort()` ([runHash.mjs:94](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/runHash.mjs#L94)).

---

### 3. THE FEATURE WINDOW

**Verdict:** The boot feature window correctly encloses all setup routines, but awaiting across an asynchronous operation while holding process-global mutations introduces potential in-process leak exposure.

1. **Every remaining call outside `runtime.step()` reading feature flags or emitting gameplay events:**
   - **Emits gameplay events:**
     - [crucibleBench.mjs:283](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L283) (diff line 481): `harnessEmit(bus, harnessBusEmits, 'run:beginRequested', ...)`
     - [crucibleBench.mjs:300](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L300) (diff line 528): `harnessEmit(bus, harnessBusEmits, 'run:loadoutReady', {})`
     *(Both run inside the boot feature window; zero bus emissions occur outside the window).*
   - **Reads feature flags:**
     - Inside the boot window ([crucibleBench.mjs:216-302](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L216-L302); diff lines 358-530):
       - [crucibleBench.mjs:223](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L223) (diff line 372): `unlockAllTech` calls `shipsSys.researchable` and `shipsSys.unlockTech`.
       - [crucibleBench.mjs:238](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L238) (diff line 418): `runtime.spawn(makeShipEntitySpec(...))`.
       - [crucibleBench.mjs:249](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L249) (diff line 433): `await physicsSys.prepareBackend(state, { reset: true })` reads `combatFlag('weaponImpulseConsequences')`.
       - [crucibleBench.mjs:256](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L256) (diff line 440): `realPathProof(runtime)` reads `massline2Flag('tumble')` and `combatFlag('weaponImpulseConsequences')`.
       - [crucibleBench.mjs:289](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L289) (diff line 488): `applyCombatLabSetup(ctx, setup.value)`.
     - Outside the boot window and outside `runtime.step()`:
       - [crucibleBench.mjs:407](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L407) (diff line 639): `const proof = realPathProof(runtime)`. Calling this after the simulation loop reads `massline2Flag('tumble')` and `combatFlag('weaponImpulseConsequences')` ([realPath.mjs:107-110](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/realPath.mjs#L107-L110)). These read `false` by design to populate `featuresOutsideStep`.
       - No other calls outside `runtime.step()` read feature flags.

2. **Is the window wide enough?**
   - Yes. It covers all pre-step calls that initialize systems, construct SG-02, fit modules, and fire the run-start bus events. All in-flight tick updates run inside `runtime.step()`, which wraps each call with `withFeatureMaps`.

3. **Is it too wide — leak risk across `await physicsSys.prepareBackend(...)`?**
   - **Yes, structurally:** `await physicsSys.prepareBackend(state, { reset: true })` ([crucibleBench.mjs:249](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L249); diff line 433) is an asynchronous yield point. Because `applyFeatureConfigToMaps` mutates Node's process-global flag maps, any other asynchronous task or concurrent runtime running in the same Node process during that tick would observe production feature flags rather than default flags. In this CLI runner, execution is strictly sequential, so no concurrent tasks overlap in practice, but the process-global leak vulnerability exists across the `await`.

4. **Is `restoreFeatureMaps` guaranteed to run on every throw path?**
   - Yes. The inner `try { ... } finally { restoreFeatureMaps(previousFlags); }` ([crucibleBench.mjs:222-302](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L222-L302); diff lines 364-530) starts immediately after `applyFeatureConfigToMaps`. Any error thrown by `unlockAllTech`, `runtime.spawn`, `prepareBackend`, `validateCombatLabSetup`, or `applyCombatLabSetup` is guaranteed to execute `restoreFeatureMaps`.

---

### 4. HONESTY

**Verdict:** Several metrics report passing or clean values when the underlying instrument is disconnected or silent.

1. **`b13Met` passes on complete silence (blank gauge):**
   - [crucibleBench.mjs:840](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L840) (diff line 1099):
     `b13Met: maxPlayerKnockFraction <= KNOCK_MAX_FRACTION_LIMIT && knockRate <= KNOCK_EVENTS_PER_MIN_LIMIT`
   - If zero contacts occur (`playerKnockEvents = 0`), `maxPlayerKnockFraction` is `0` (`<= 0.10`) and `knockRate` is `0` (`<= 2.0`). `b13Met` evaluates to **`true`**. A run where no hostiles were admitted to physics or physics impacts failed to trigger passes B13.

2. **`bodyAdmission` gap does not fail the run:**
   - [crucibleBench.mjs:415-419](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L415-L419) (diff lines 647-651): The harness detects when cohort hostiles lack an SG-02 physics body and writes a descriptive message to `bodyAdmission.gap`. However, this is never asserted, never throws, and does not set `result.ok = false` ([crucibleBench.mjs:120](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L120); diff line 152). A run where 100% of hostiles are bodiless reports `ok: true`.

3. **`finiteOrZero` swallows missing/corrupt fields:**
   - [crucibleBench.mjs:694](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L694) (diff line 945): `deltaV: finiteOrZero(p.playerDeltaV)`. If `p.playerDeltaV` is `undefined`, `null`, or `NaN`, it silently converts to `0` instead of flagging a corrupt payload.
   - [crucibleBench.mjs:819](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L819) (diff line 1070): `deltaV = finiteOrZero(ev.data && ev.data.deltaV)` defaults missing knock deltaV to `0`.
   - [crucibleBench.mjs:871](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L871) (diff line 1143): `amt = finiteOrZero(p.applied != null ? p.applied : p.amount)` silently converts missing damage amounts to `0`.

4. **`cruiseSpeedOf` default hides missing player stats:**
   - [crucibleBench.mjs:1006](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L1006) (diff line 1281): If `player.maxSpeed` is missing or `0`, it returns `195`. This masks broken ship definitions and calculates knock fraction against an imaginary speed.

5. **`measureQuietSeconds` reports 0 for a dead run:**
   - [crucibleBench.mjs:854](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L854) (diff line 1126): `if (dense.length < 3) return 0;`. If a run has fewer than 3 events across all 5400 ticks (i.e. virtually nothing happened), it reports `nothingHappenedSeconds: 0`, falsely indicating constant action.

6. **`hitAccuracy` returning 1 when there are no shots — IS THAT A LIE?**
   - In `crucibleBench.diff` ([diff line 1151](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.diff#L1151)):
     `metrics.hitAccuracy = metrics.totalShots > 0 ? hits / metrics.totalShots : 1;`
     **Yes, this was a lie.** Returning 1.0 (100%) accuracy when 0 shots were fired rewarded an idle or unfitted weapon with perfect accuracy.
   - In `crucibleBench.mjs` ([crucibleBench.mjs:881](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L881)):
     `metrics.hitAccuracy = metrics.totalShots > 0 ? hits / metrics.totalShots : null;`
     This has been corrected to `null` to represent an unmeasurable ratio.

---

### 5. What does the code NOT do that the file's own comments claim it does?

1. **Massline "release" action is never driven on the input device:**
   - **Comment:** "scripted pilot (drives the REAL input device state, never state.input)" ([crucibleBench.mjs:552](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L552); diff line 796) and "Distinct verbs the REAL input system produced this tick (axes + actions.*), not the pilot's intent list" ([crucibleBench.mjs:624](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L624); diff line 869).
   - **Reality:** In `drivePilot` ([crucibleBench.mjs:603](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L603); diff line 848):
     `if (phase === verbCadence + 40) { acts.push('release'); }`
     It pushes `'release'` to `acts` (which reaches `inputTape` and the hash payload), but **never calls `press(inputSys, ...)`**. `BIND` ([crucibleBench.mjs:53-56](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L53-L56)) does not define a release binding. The pilot claims it releases the tether, but the physical input device is never touched.

2. **Unused control bindings:**
   - `BIND` ([crucibleBench.mjs:53-56](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L53-L56); diff lines 57-61) defines `reverse: ['KeyS']`, `strafeLeft: ['KeyQ']`, and `strafeRight: ['KeyE']`.
   - **Reality:** `drivePilot` ([crucibleBench.mjs:553-607](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L553-L607)) never references or presses `reverse`, `strafeLeft`, or `strafeRight`.

3. **"Credit-neutral by construction":**
   - **Comment:** "Walking the real tech tree through ships.unlockTech is credit-neutral by construction" ([crucibleBench.mjs:367-369](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L367-L369); diff lines 367-369).
   - **Reality:** [crucibleBench.mjs:530-534](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L530-L534) (diff lines 776-779) in `unlockAllTech` artificially creates and injects credits via `economySys.grantCredits(credits, 'bench:tech-budget')` and artificially grants `player.researchPoints += rp + 1000`. It is subsidized, not neutral by construction.

4. **"Fun metrics are derived from the real event bus":**
   - **Comment:** "Fun metrics are derived from the real event bus into the vocabulary funMetrics.mjs already reads" ([crucibleBench.mjs:6-7](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L6-L7); diff lines 6-7).
   - **Reality:**
     - `verbsUsedCount` and `verbsPerMinute` are derived from polling `state.input` and `state.input.actions` via `sampleIssuedVerbs` ([crucibleBench.mjs:628](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L628); diff line 873), not from the event bus.
     - `nothingHappenedSeconds` is calculated from tick deltas in `measureQuietSeconds` ([crucibleBench.mjs:847](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L847); diff line 1119), not from bus events.
     - Knock `headingChangeRad` is derived from comparing `player.rot` before and after `step()` ([crucibleBench.mjs:605, 795](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L605)), not from any bus event payload.

5. **`headed` option:**
   - **Comment/JSDoc:** Accepts `@param {boolean} [options.headed]` ([crucibleBench.mjs:78](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L78); diff line 90).
   - **Reality:** [crucibleBench.mjs:83](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/lib/bench/crucibleBench.mjs#L83) (diff line 96) executes `void headed;` and discards the argument completely.
The review is complete and all background verification tasks have concluded cleanly. No files were created or modified.
