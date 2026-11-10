# Autosave Calm-Window Deferral — REPORT

Implements **only** the "Calm-Window Deferral" item from
`design/perf/autosave-slice-DIAGNOSIS.md` §3/§4. The chunked-serialization and
structured-clone-bypass items are intentionally **not** attempted (the shallow-snapshot-across-ticks
idea has an atomicity flaw: live state mutates between ticks).

**Scope:** `src/save/saveSystem.js` only. No commit; working-tree change on `claude/perf00-20260727`.

---

## 1. Gate condition chosen

**Signal:** `combat:damage` bus event. The cheapest existing player-involved combat recency signal.

No centralized "player dealt/took damage recently" timestamp lives in state the save system can
reach:
- The player entity's `lastDamageT` (`src/combat/damage.js:131`) only fires when the player **takes**
  damage — it does not cover **dealing** damage, and reaching into every entity is not cheap.
- `state.combat` carries actions/attachments/trace, no clean recency timestamp.

So, per the task's allowance ("a tiny listener updating a lastCombatTick is acceptable if nothing
exists"), the save system now keeps `this._lastPlayerCombatSimTime`, updated by a small `combat:damage`
listener that mirrors the **proven** pattern already used by `stationBroadcast`
(`src/systems/stationBroadcast.js:144-152`) and `audioSystem`:

```js
bus.on('combat:damage', (p) => {
  const s = this.state;
  if (!s || !p) return;
  if (p.targetId === s.playerId || p.attackerId === s.playerId) {
    this._lastPlayerCombatSimTime = Number.isFinite(s.simTime) ? s.simTime : 0;
  }
});
```

`combat:damage` (`src/combat/damage.js:191`) carries both `targetId` and `attackerId`, so this captures
**dealt or took** damage in one cheap comparison against `state.playerId`.

**Deferral rule** (in `_flushAutosave`, `src/save/saveSystem.js:928`):
- Applies **only** when `!job.force && DEFERRABLE_AUTOSAVE_REASONS.has(job.reason)`.
- `DEFERRABLE_AUTOSAVE_REASONS = new Set(['interval', 'trade', 'hud_layout'])` (`saveSystem.js:43`).
- Defer (retry via the existing 120 ms backoff hop) while:
  `sinceCombat < AUTOSAVE_DEFER_CALM_S (3s)` **and** `sinceRequest < AUTOSAVE_DEFER_HARD_CAP_S (60s)`,
  where `sinceCombat = state.simTime - _lastPlayerCombatSimTime` and `sinceRequest = state.simTime - job.requestedSimTime`.

**Untouched (rule 3):** forced/critical saves (`jump:arrive`, `dock:undocked`, `player:respawn`,
anything `force:true`) and `'mission'` saves stay immediate — they are not in the deferrable set and
`job.force` short-circuits the gate.

## 2. The cap

`AUTOSAVE_DEFER_HARD_CAP_S = 60` (`saveSystem.js:42`), measured in **sim time** since the save was
requested (`job.requestedSimTime`, captured at `saveSystem.js:876`). Once a deferred save has waited
≥ 60 s of sim time, the deferral condition is false and `_flushAutosave` proceeds regardless of combat
state — a save system that can be starved forever is worse than a hitch. The 3 s calm window is
`AUTOSAVE_DEFER_CALM_S` (`saveSystem.js:41`).

Reset boundaries: `_lastPlayerCombatSimTime` is initialized to `-Infinity` in `init`
(`saveSystem.js:89`), reset on `save:loaded`/`game:started` (`saveSystem.js:127`), and on new-run epoch
in `_beginRunEpoch` (`saveSystem.js:1130`). `-Infinity` means "calm", so a freshly loaded/stared run is
never falsely deferred.

## 3. Edit locations (`src/save/saveSystem.js`)

| What | file:line |
|---|---|
| Constants: `AUTOSAVE_DEFER_CALM_S`, `AUTOSAVE_DEFER_HARD_CAP_S`, `DEFERRABLE_AUTOSAVE_REASONS` | `src/save/saveSystem.js:39-43` |
| `_lastPlayerCombatSimTime` field init | `src/save/saveSystem.js:89` |
| `combat:damage` listener + `clearPlayerDeathGate` reset | `src/save/saveSystem.js:117-127` |
| `job.requestedSimTime` captured in `requestAutosave` | `src/save/saveSystem.js:876` |
| **Deferral gate in `_flushAutosave`** | `src/save/saveSystem.js:925-936` |
| `_beginRunEpoch` reset | `src/save/saveSystem.js:1130` |

Diff stat: `1 file changed, 33 insertions(+), 1 deletion(-)`. CRLF preserved (0 bare LF).

---

## 4. Verification output

### `npm run check:save-schema`
```
> spaceface@0.1.0 check:save-schema
> node scripts/generate-save-schema.mjs --check

SAVE_SCHEMA.md OK (version 12, 274 paths)
```

### `npm run check:save-resume-confidence`
```
> spaceface@0.1.0 check:save-resume-confidence
> node scripts/check-save-resume-confidence.mjs

Save/resume confidence OK - title Continue shows latest-save context and loads the displayed slot.
```

### `npm run check:save-load-slot-trust`
```
> spaceface@0.1.0 check:save-load-slot-trust
> node scripts/check-save-load-slot-trust.mjs

Save/Load slot trust OK - destructive confirmations repeat concrete slot context, and live Save/Load empty slots do not route to New Game.
```

### `node --test test/bounded-autosave.test.mjs` (the autosave test)
```
ℹ tests 23
ℹ pass 17
ℹ fail 6
```

**The 6 failures are pre-existing and unrelated to this change.** They are all
`productionCapture: true` + `assertCanonicalSaveData` tests that compare worker-captured save data
against `serializeData()`. The worker/autosave capture plan (`_saveCapturePlan`, `saveSystem.js:166`)
omits the `entropy` subtree that `serializeData()` (`saveSystem.js:247`) appends, so the deep-equal
comparison drifts on the `entropy` key. This gap exists at `HEAD` and touches neither the capture plan,
`serializeData`, nor the worker encode path.

**Proof — identical baseline at HEAD** (run in a throwaway `git worktree` at `HEAD 071ca9be`,
created and removed without touching the working tree):
```
ℹ tests 23
ℹ pass 17
ℹ fail 6
```
Same 6 test names fail at HEAD:
- production capture plan is fixed-tick, worker-encoded, phased, and truthfully reports raw 8/12ms limits
- three serial production autosaves preserve exact data, report the 8ms target, and meet the raw 12ms hard limit
- six simultaneous autosave requests coalesce into one exact production save
- production snapshot completes during 120+ continuously advancing scheduled turns without rerunning serializers
- batched encode_part dispatch uses far fewer schedule turns than save keys while still completing
- batched worker dispatch yields before repeated clone posts can cross the 12ms hard slice

All six drive `requestAutosave(..., { force: true })`, for which the new gate is a structural no-op
(`deferrable = !job.force && ...` → `false`). **Net new failures from this change: 0.**

The relevant deferral-relevant tests (force:false paths are not unit-exercised today) are green:
worker encoder/validation, Blob worker lifecycle, interrupted-encode fallback, generation/restore
supersession, run-epoch cancellation, hard-budget telemetry, scheduler hop policy, capture-prep, and
the crowded-flight probe contract all pass.

---

## 5. Notes / follow-ups (out of scope here)

- The pre-existing `entropy` capture-plan gap (6 failing tests) is the natural next fix if/when the
  chunked-serialization item is taken on; it is deliberately left untouched per the "saveSystem.js
  only, calm-window deferral only" scope.
- Idle-frame scheduling (diagnosis §3.2) was not added; the deferral reuses the existing
  `_scheduleAutosaveWork(cb, true)` 120 ms backoff hop already used for jump/pause busy, keeping the
  change local to the gate.
