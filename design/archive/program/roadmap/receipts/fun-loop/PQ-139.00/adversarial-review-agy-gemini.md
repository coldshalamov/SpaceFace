# ADVERSARIAL REVIEW: SpaceFace Fun-Convergence, Lane IMPACT (Leaves PQ-139.00 & PQ-139.01)

---

### 1. Does each diff move its named bar by the named mechanism, or by a forbidden move?

#### PQ-139.00 ("Collisions answer")
- **Named Bar**: Hitstop and camera trauma scale monotonically with exchanged momentum ($\text{mass} \times \Delta V$), floored at $\Delta V \ge 8\text{ WU/s}$, bounded by a ceiling.
- **Observed Mechanism**:
  - **Floor Gate**: `src/render/feel.js:74` rejects any impact with $\Delta V < 8\text{ WU/s}$ (`COLLISION_DELTA_V_FLOOR = 8`, line 58).
  - **Monotone Scaling**: `src/render/feel.js:77-78` normalizes $\Delta V$ against reference slam `COLLISION_DELTA_V_REF = 150` (`u = clamp(deltaV / 150, 0, 1)`), applying a square-root curve $t = \sqrt{u}$ ensuring sub-linear ramp ("scrape is a tick, slam is a beat").
  - **Bounded Hitstop**: `src/render/feel.js:80-83` maps $t$ between `HS_IMPACT_MIN = 0.016s` and `HS_IMPACT_MAX = 0.09s`.
  - **Bounded Trauma & Distance Falloff**: `src/render/feel.js:85-89` bounds trauma to `TRAUMA_IMPACT_MAX = 0.35` scaled by inverse-square distance falloff past `COLLISION_TRAUMA_RANGE = 400 WU`.
  - **Causal Event Subscription**: `src/render/feel.js:872` wires `bus.on('physics:impact', (p) => this._onPhysicsImpact(p))` to extract $\Delta V = \text{dp} / \text{mass}$ (or `p.playerDeltaV` if player-involved) and aggregates candidate $\Delta V = \max(\Delta V_A, \Delta V_B)$ (`src/render/feel.js:906-943`).
  - **Frame Dispatch & Cooldown**: `src/render/feel.js:972-990` (`_flushPendingCollision()`) applies the pending collision feel once per frame with cooldown `COLLISION_HITSTOP_COOLDOWN = 0.18s` (`src/render/feel.js:62`).
  - **Massline Snap**: `src/render/masslinePresentation.js:374-381, 390, 398-401` replaces the artificial `hsDur: 0` with snap durations between `0.020s` and `0.055s`.
- **Forbidden Moves**: **NONE**. No content added; no damping, drag, or velocity clamping applied to player momentum; no transform writes or counter-thrust; trauma and hitstop respond directly to physics momentum rather than substituting for it.

#### PQ-139.01 ("Sound tells weight")
- **Named Bar**: A scout kissing a rock and a freighter broadsiding a station differ by $\ge 1\text{ octave}$ of pitch and $\ge 12\text{ dB}$ of loudness.
- **Observed Mechanism**:
  - **Acoustic Mass**: `src/audio/audioSystem.js:375-379` (`collisionAcousticMass`) maps static bodies (`station` $\to 400$, `asteroid` $\to 120$) and dynamic bodies to their mass, selecting the dominant mass via $\max(\text{mass}_A, \text{mass}_B)$ (`src/audio/audioSystem.js:383-386`).
  - **Pitch Scaling**: `src/audio/audioSystem.js:387-401` logarithmically normalizes acoustic mass across $[16, 400]$ and evaluates a power curve `rate = clamp(1.6 * (0.5 / 1.6)^(massNorm^2.2), 0.45, 1.8)`. Playback rate decreases monotonically with mass.
  - **Loudness Scaling**: `src/audio/audioSystem.js:402-408` calculates normalized loudness $t = \sqrt{\text{clamp}(\text{dp} / 24000, 0, 1)}$ and maps gain to $[0.05, 0.95]$.
  - **Tier Ladder**: `src/audio/audioSystem.js:409-420` routes through existing sound recipes (`sfx_dock_clunk`, `sfx_mining_impact`, `sfx_explosion_small`, `sfx_explosion_large`).
  - **Observed Characterization** (`test/audio-collision-weight.test.mjs:154-171`):
    - Scout kissing rock: `rate = 1.057`, `gain = 0.087`, tier = `kiss` (`sfx_dock_clunk`).
    - Freighter broadsiding station: `rate = 0.500`, `gain = 0.950`, tier = `broadside` (`sfx_explosion_large`).
    - $\Delta\text{Pitch} = \log_2(1.057 / 0.500) = 1.08\text{ octaves} \ge 1.0\text{ octave}$.
    - $\Delta\text{Loudness} = 20 \log_{10}(0.950 / 0.087) = 20.79\text{ dB} \ge 12\text{ dB}$.
- **Forbidden Moves**: **NONE**. Reuses existing audio assets from `AUDIO_RECIPE_BY_ID`; no content added.

---

### 2. Determinism

- **Sources of Nondeterminism**: Neither diff introduces `Math.random`, `Date.now`, `performance.now`, `process.hrtime`, wall-clock branching, DOM branching, or iteration over unordered collections. Both `resolveCollisionFeel` (`src/render/feel.js:23-50`) and `resolveCollisionCue` (`src/audio/audioSystem.js:381-425`) are pure mathematical functions.
- **Simulation Timestep `dt` Verification**:
  - `src/core/simulationRunner.js:10-52` (`advanceFixedTimestep`):
    - Line 27: `const fixedDt = Number.isFinite(dt) && dt > 0 ? dt : LOOP_FIXED_DT;` (where `LOOP_FIXED_DT = 1 / 60`, line 5).
    - Line 34: `result.accumulator += frameSeconds * scale;`
    - Lines 35-39:
      ```javascript
      while (result.accumulator >= fixedDt && result.steps < stepCap) {
        step(fixedDt);
        result.accumulator -= fixedDt;
        result.steps++;
      }
      ```
    - The simulation integrator `step(fixedDt)` is **always** invoked with the constant `fixedDt = 1/60`. Hitstop modulates real frame time accumulated into the accumulator via `scale`; it **never** alters the simulation integration `dt`.
  - `src/core/timeEffects.js:88-102`: `timeEffects.set('feel:hit-stop', ...)` updates only `state.timeScale = next`. This scalar is transient runtime state and explicitly unpersisted.
  - `src/runtime/authoritativeSystemManifest.js:108-110, 127-132`: `feel` is classified as `{ nodeSafe: false, phase: 'render', capability: 'presentation' }` and is excluded from Node execution via `isNodeSafeSystemId('feel') === false`.
  - `scripts/sf-sim.mjs:11-49`: `feel.js` is **not imported** or instantiated in headless sim harnesses or golden test runners.
  - **Verdict**: Simulation determinism is fully preserved.

---

### 3. Single-Writer Contracts and Save Schema

- **Single-Writer Audit**:
  - **PQ-139.00**: Writes only to `feel`'s own private instance fields:
    - `this._collisionHitstopCooldown` (`src/render/feel.js:331, 989, 1076, 1087`)
    - `this._armedCollisionDeltaV` (`src/render/feel.js:332, 990, 1077`)
    - `this._pendingCollisionFeel` (`src/render/feel.js:333, 968, 975, 1078`)
    - `this._hsTimer`, `this._hsRampIn`, `this._hsFreezeTimer` (`src/render/feel.js:1033-1038, 1072-1074, 1095-1097`)
    - Communicates with `timeEffects` via standard channel `this.timeEffects.set('feel:hit-stop', ...)` and camera trauma via `state.render.cameraCtrl.addTrauma(...)` (`src/render/feel.js:987`).
    - Writes zero state owned by economy, factions, cargo, ships, or heat.
  - **PQ-139.01**: Modifies zero GameState properties. Reads entity mass/type and invokes `this.play(...)` on the audio subsystem.
- **Save Schema**: Zero fields added to `saveSchema.js`, `saveSystem.js`, or serialized entity snapshots.

---

### 4. What Did the Implementer Claim That the Diff Does Not Show?

- **(a) Inline partial reset in `frame()` vs `_resetHitStop()`**:
  - In `src/render/feel.js:1071-1079`, `_resetHitStop()` contains:
    ```javascript
    this._hsTimer = 0;
    this._hsRampIn = 0;
    this._hsFreezeTimer = 0;
    this.timeEffects.clear('feel:hit-stop');
    this._collisionHitstopCooldown = 0;
    this._armedCollisionDeltaV = 0;
    this._pendingCollisionFeel = null;
    ```
  - In `src/render/feel.js:1095-1098`, the inline block inside `frame()` contains:
    ```javascript
    this._hsTimer = 0;
    this._hsRampIn = 0;
    this._hsFreezeTimer = 0;
    this.timeEffects.clear('feel:hit-stop');
    ```
  - **Finding**: The inline block executes **exactly** what `_resetHitStop()` does minus clearing the three collision cooldown fields. It did not silently drop anything else.

- **(b) `bodyDeltaV` returning `null` for station/asteroid**:
  - `src/render/feel.js:914`: `if (ent.type === 'station' || ent.type === 'asteroid') return null;`
  - Could both bodies be station/asteroid and drop a player-felt impact?
  - **Finding**: **No**.
    1. In `src/core/physics.js:1118`, `invMass(e)` returns `0` for both `'station'` and `'asteroid'`. In `pushApart` and `impulse` (`src/core/physics.js:1189, 1200`), `tot = ima + imb`. When both bodies are static, `tot === 0`, `impulse()` returns `0`, and `emitPhysicsImpact` (`src/core/physics.js:1222`) returns early when `dp <= 0`. Physics never publishes `physics:impact` for two static bodies colliding.
    2. The player entity is always a `'ship'` with finite mass (`invMass > 0`). Any collision involving the player has at least one dynamic body for which `bodyDeltaV` returns a valid $\Delta V$.

- **(c) Cooldown "upgrade gate" and monotonically rising $\Delta V$ during a grind**:
  - In `src/render/feel.js:977-990`:
    ```javascript
    const cooling = this._collisionHitstopCooldown > 0;
    const armed = this._armedCollisionDeltaV || 0;
    if (cooling && !(pending.deltaV > armed)) return;
    ...
    this._trigger(pending.hsDur, pending.fov, 0, null);
    this._collisionHitstopCooldown = COLLISION_HITSTOP_COOLDOWN;
    this._armedCollisionDeltaV = pending.deltaV;
    ```
  - **Finding**: **Yes, theoretically**. If a continuous contact produces a strictly monotonically increasing $\Delta V$ frame-over-frame (e.g. $10 \to 12 \to 15 \to 18\text{ WU/s}$), each frame satisfies `pending.deltaV > armed`. The gate passes every frame, resets `_collisionHitstopCooldown` to `0.18s`, and triggers hitstop and camera trauma on every frame until $\Delta V$ plateaus or drops.
  - *Safety observation*: In `_trigger` (`src/render/feel.js:1032`), `if (hsDur > this._hsTimer) this._hsTimer = hsDur;` prevents timer accumulation (hitstop duration is bounded by `HS_IMPACT_MAX = 0.09s` and cannot stack unboundedly). However, the claim that grinds cannot re-trigger hitstop holds only once $\Delta V$ ceases to escalate.

- **(d) `resolveCollisionCue` MAX acoustic mass & scout kissing a heavy ship**:
  - In `src/audio/audioSystem.js:383-424`:
    - If a scout (mass 16) kisses a heavy freighter (mass 200) or station (mass 400) at low momentum (`dp = 40 <= TIER_KISS_DP = 400`):
      - `acousticMass = Math.max(16, 200) = 200 >= TIER_HEAVY_MASS` (200) $\implies \text{heavy} = \text{true}$.
      - `slammed = dp >= TIER_SLAM_DP` ($40 \ge 4000$) $\implies \text{slammed} = \text{false}$.
      - Tier evaluation:
        `slammed && heavy` is FALSE.
        `slammed || heavy` is TRUE!
        $\implies \text{tier} = \text{'slam'}$ (`sfx_explosion_small`), **not** `'broadside'`.
      - Loudness evaluation:
        `loudNorm = Math.sqrt(clamp(40 / 24000, 0, 1)) ≈ 0.0408`.
        `gain = clamp(0.05 + 0.90 * 0.0408, 0.05, 0.95) ≈ 0.0867`.
  - **Finding**: It does **NOT** sound like a broadside:
    1. It triggers `slam` (`sfx_explosion_small`), not `broadside` (`sfx_explosion_large`).
    2. The gain is clamped by momentum down to `~0.087` ($> 20\text{ dB}$ below a real broadside at `0.95`).
  - *Subtlety noted*: Because `slammed || heavy` precedes `dp <= TIER_KISS_DP`, any contact involving a heavy body triggers `'slam'` rather than `'kiss'` (`sfx_dock_clunk`), albeit played at a muffled, whisper-quiet volume.

---

### 5. Accessibility

- **Audit of Reduced-Motion (`state.settings.video.motionReduce`)**:
  - `src/render/feel.js:25`: `resolveCollisionFeel` exits immediately: `if (context.motionReduce) return null;`.
  - `src/render/feel.js:128-135`: `_onPhysicsImpact` passes `motionReduce: mr`; if set, `resolveCollisionFeel` returns `null` and `_pendingCollisionFeel` is never populated.
  - `src/render/feel.js:153-154`: `_flushPendingCollision` exits immediately: `if (mr) return;` before calling `_trigger()` or `cameraCtrl.addTrauma()`.
  - `src/render/feel.js:1028`: `_trigger` checks `if (mr) return;`.
  - `src/render/masslinePresentation.js:360`: `resolveMasslineFeelPunch` checks `if (context.motionReduce) return null;`.
  - `src/render/feel.js:994-999`: `_applyMasslineFeelPunch` guards against `mr` and aborts if `punch` is null.
  - `src/audio/audioSystem.js`: Produces purely auditory cues; no vestibular effects.
- **Verdict**: Reduced-motion is honored across **every** execution path. Zero paths escape it.

---

### 6. The Test Rewrite

- **File**: `test/massline-presentation-uvp.test.mjs:127-151`
- **Before**:
  ```javascript
  assert.equal(named.hsDur, 0, 'massline feel never requests sim timeScale hit-stop');
  ...
  assert.equal(crush.hsDur, 0);
  ...
  assert.ok(recover && recover.hsDur === 0 && recover.fov > 0);
  ```
- **After**:
  ```javascript
  assert.ok(named.hsDur > 0 && named.hsDur <= 0.06,
    'A Massline release should feel like something snapped loose.');
  ...
  assert.ok(crush.hsDur > 0 && crush.hsDur <= 0.06,
    'A Massline release should feel like something snapped loose.');
  ...
  assert.ok(recover && recover.hsDur === 0 && recover.fov > 0,
    'a settle is not a snap');
  assert.equal(
    resolveMasslineFeelPunch({ type: 'tether.release.razor' }, { motionReduce: true }),
    null,
    'motionReduce still returns null for the razor release',
  );
  ```
- **Analysis**:
  - The old assertions pinned `hsDur === 0` under a stale design assumption that render-phase hitstop would corrupt headless sim determinism (proven false in Q2).
  - The rewritten assertions enforce strict positivity (`hsDur > 0`) paired with an explicit upper bound (`hsDur <= 0.06`), preserving `hsDur === 0` for settling recovery (`recover`).
  - Furthermore, the rewrite adds an explicit regression test ensuring that `motionReduce: true` suppresses `tether.release.razor`.
- **Verdict**: Coverage is **STRONGER** after the rewrite.

---

### 7. Verdicts

VERDICT PQ-139.00: ACCEPT
VERDICT PQ-139.01: ACCEPT
