### 1. Is the size/speed difference REAL, or only a radius scalar on one pooled sprite?

The size and speed differences between classes are **REAL** and rooted in distinct lifecycle schedules, not merely a scalar on a single pooled sprite.

In [`src/render/combat/phasedExplosions.js:70-96`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/combat/phasedExplosions.js#L70-L96), the three base schedules define distinct total durations and differing phase lists:

- **`small`**: total duration **`0.82`s** ([`phasedExplosions.js:71`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/combat/phasedExplosions.js#L71)), scheduling **5 phases**:
  1. `ignition` (at 0)
  2. `rupture` (at 0.045)
  3. `debris` (at 0.10)
  4. `pressure` (at 0.16)
  5. `residue` (at 0.24)
- **`ordinary`**: total duration **`1.42`s** ([`phasedExplosions.js:78`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/combat/phasedExplosions.js#L78)), scheduling **6 phases**:
  1. `ignition` (at 0)
  2. `internal` (at 0.085)
  3. `rupture` (at 0.16)
  4. `debris` (at 0.23)
  5. `pressure` (at 0.28)
  6. `residue` (at 0.40)
- **`capital`**: total duration **`3.4`s** ([`phasedExplosions.js:86`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/combat/phasedExplosions.js#L86)), scheduling **8 phases**:
  1. `ignition` (at 0)
  2. `internal` (at 0.16)
  3. `internal-secondary` (at 0.38)
  4. `breakup` (at 0.54)
  5. `rupture` (at 0.64)
  6. `debris` (at 0.71)
  7. `pressure` (at 0.82)
  8. `residue` (at 1.02)

The phase **lists differ substantially**: `small` omits all internal and breakup phases entirely; `ordinary` includes an `internal` flash phase; `capital` adds both `internal-secondary` and an explicit `breakup` stage. Furthermore, for causal variations, [`scaledCauseSchedule`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/combat/phasedExplosions.js#L139-L154) applies distinct temporal multipliers (`small: 0.78`, `ordinary: 1`, `capital: 1.65` at [`phasedExplosions.js:137`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/combat/phasedExplosions.js#L137)) and injects an extra `breakup` phase for capital deaths ([`phasedExplosions.js:145-150`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/combat/phasedExplosions.js#L145-L150)).

Because light deaths now trigger the `small` schedule ([`src/render/vfx.js:779`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/vfx.js#L779)) rather than `ordinary`, the timing, phase count, and visual cadence change genuinely. (Medium and heavy share `ordinary` with heavy receiving a `1.45` radius scale, but the tiering ladder across light/medium/capital switches real effect definitions).

---

### 2. Does anything get DOWNGRADED?

**Yes.** Before this diff, line 3976 (diff line 119) routed all non-capital kills to `ordinary`:
`this._queueExplosion(p, this._isCapitalKill(p) ? 'capital' : 'ordinary');`

Under the diff, any victim whose mass falls into the `light` tier (`mass < 30`, [`src/render/vfx.js:766, 808`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/vfx.js#L766)) is mapped to `classId: 'small'` ([`vfx.js:779`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/vfx.js#L779)) with a radius scale of `0.85` ([`vfx.js:772`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/vfx.js#L772)).

Deaths that were previously larger (`ordinary`, 1.42s duration, 1.0x radius) and are now smaller (`small`, 0.82s duration, 0.85x radius scale) include:
1. **Light combat ships and scouts** with live `mass < 30` (such as the scout/Wasp, mass 16; diff line 39, [`vfx.js:791`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/vfx.js#L791)).
2. **Small non-capital entities/drones** with live `mass < 30`.
3. **Victims with missing/unrecorded mass whose collision radius is under ~26.25**, because [`estimateDeathMassFromRadius`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/vfx.js#L814-L818) calculates `mass = radius * (16 / 14)` ([`vfx.js:793, 817`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/vfx.js#L793)); when `radius < 26.25`, estimated mass is `< 30`, triggering `light`.
4. **Victims with explicit zero or negative mass** (`mass <= 0`), which pass `finiteDeathNumber` and evaluate `< 30`.

**A capital kill can NEVER be downgraded.**
Tracing [`isCapitalDeathVictim(victim)`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/vfx.js#L799-L805):
- Lines 801–804 check `victim.capital`, `radius >= 55`, or class/type regex match (`/capital|flagship|cruiser|gunship|battleship|dread/i`).
- In `_onKilled` ([`vfx.js:4085-4095`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/vfx.js#L4085-L4095)), `victim` inspects both the live entity in `state.entities` and receipt `p` for these attributes.
- In `resolveDeathPresentationClass` ([`vfx.js:842-844`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/vfx.js#L842-L844)):
  ```javascript
  let tier = deathTierFromMass(mass);
  if (isCapitalDeathVictim(src)) tier = 'capital';
  ```
  `isCapitalDeathVictim` executes after `deathTierFromMass` and overrides `tier` unconditionally to `'capital'`. `'capital'` always maps to `classId: 'capital'` ([`vfx.js:782`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/vfx.js#L782)) with radius scale `1.9` ([`vfx.js:775`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/vfx.js#L775)), ensuring that any entity that previously qualified as capital remains capital even if its mass was tiny.

---

### 3. Cause

In [`_queueExplosion`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/vfx.js#L4120-L4153):
- **Where `cause` comes from**: [`src/render/vfx.js:4150`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/vfx.js#L4150):
  ```javascript
  cause: presentation && presentation.cause || p && p.cause || 'generic',
  ```
  It is resolved directly from `p.presentation.cause` or `p.cause` passed into `_queueExplosion`.
- **Was that wiring ALREADY there?**: **YES.** The diff for `_queueExplosion` (diff lines 154–169) only introduces the `radiusOverride` argument and sets `req.radius`. Line 4150 passing `cause` into `this._explosions.start({...})` was completely untouched and was already in place before this diff.
- **Is `death.cause` / `death.directional` consumed?**: **NO, it is computed and thrown away.**
  In `_onKilled` ([`vfx.js:4096-4098`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/vfx.js#L4096-L4098) / diff lines 135–137):
  ```javascript
  const death = resolveDeathPresentationClass(victim);
  const scaledRadius = scaleDeathExplosionRadius(victim.radius, death.tier);
  this._queueExplosion(p, death.classId, scaledRadius);
  ```
  Only `death.classId` and `death.tier` are read from the record. `death.cause` and `death.directional` are never referenced or passed down.
- **Conclusion**: The "and cause" half of the title was **already in the engine** (wired in `_queueExplosion` and handled by `phasedExplosions.js`). This diff only added dead bookkeeping properties to the `resolveDeathPresentationClass` return object and assertions in the test file.

---

### 4. Robustness and contracts

`_onKilled` **cannot produce `NaN` or throw** under any of those edge conditions:
- **Victim missing from `state.entities`**: [`vfx.js:4081-4084`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/vfx.js#L4081-L4084) uses safe guard chains (`entities && typeof entities.get === 'function' && p && p.id != null ? entities.get(p.id) : null`), safely evaluating to `null`.
- **Tracing `finiteDeathNumber` -> `estimateDeathMassFromRadius` -> `deathTierFromMass` -> `scaleDeathExplosionRadius`**:
  1. [`finiteDeathNumber(value)`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/vfx.js#L795-L797): Returns `value` if `typeof value === 'number' && Number.isFinite(value)`, else `NaN`. Undefined, null, strings, or NaN become `NaN`. 0 and negative numbers pass through as finite numbers.
  2. [`estimateDeathMassFromRadius(radius)`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/vfx.js#L814-L818): Evaluates `!(r > 0)`. If radius is undefined, NaN, 0, or negative, `!(r > 0)` is `true`, returning safe fallback `DEATH_DEFAULT_MASS` (`48`, [`vfx.js:788`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/vfx.js#L788)).
  3. [`deathTierFromMass(mass)`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/vfx.js#L807-L812): Non-finite mass was already replaced by 48 (or an estimated positive mass) in `resolveDeathPresentationClass` ([`vfx.js:841`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/vfx.js#L841)). If mass is 0 or negative, `mass < 30` evaluates to true, cleanly returning `'light'`. If mass is 48, it returns `'medium'`. It always returns a valid string tier.
  4. [`scaleDeathExplosionRadius(radius, tier)`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/vfx.js#L857-L862): `base` is checked with `Number.isFinite(base) && base > 0 ? base : DEATH_DEFAULT_RADIUS` (6). Zero, negative, or undefined radii fall back to `6`. The scale is looked up via `DEATH_TIER_RADIUS_SCALE[tier] || 1` (a positive float), and the result is clamped by `Math.max(DEATH_RADIUS_FLOOR, raw * scale)` ([`vfx.js:861`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/vfx.js#L861)), guaranteeing a finite number `>= 2`.
  5. In [`_queueExplosion`](file:///C:/Users/93rob/Documents/GitHub/SpaceFace/src/render/vfx.js#L4139-L4141), `Number.isFinite(radiusOverride)` succeeds and clamps to `Math.max(2, radiusOverride)`.
- **Side effects and branching**:
  - **No** `Math.random()`, `Date.now()`, `performance.now()`, or DOM branching was introduced.
  - **No** writes to state owned by other systems; `_onKilled` only reads from `state.entities` and dispatches to local render structures.

---

VERDICT PQ-139.02: ACCEPT
