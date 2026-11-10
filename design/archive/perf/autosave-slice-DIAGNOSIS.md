# Autosave Main-Thread Slice Diagnosis

## 1. Autosave Pipeline Architecture & Worker Division

### Worker-Side Responsibilities (`src/save/saveWorker.js`)
- **JSON Stringification & Hashing**: `encodeSavePayload` (`src/save/saveWorker.js:L6-11`, `L119-125`) runs `JSON.stringify(data)` and `fnv1a(dataJson)` off the main thread.
- **Envelope Validation**: `validateSaveJson` (`src/save/saveWorker.js:L13-34`, `L126-141`) parses JSON and verifies checksums and schema integrity off the main thread.

### Main-Thread Responsibilities (`src/save/saveSystem.js`)
- **State Capture**: `_captureAutosaveSlice()` (`src/save/saveSystem.js:L982-1010`) synchronously reads all 34 registered subsystems (`_saveCapturePlan()`, `L162-201`) into a single plain object `capture.data`.
- **Worker Dispatch & Structured Cloning**: `_postAutosaveEncodeParts()` (`src/save/saveSystem.js:L1155-1205`) calls `worker.postMessage({ id, type: 'encode_part', payload: { key, value } })`. Deep structured cloning of JS object graphs occurs synchronously on the main thread during `postMessage`.
- **LocalStorage I/O & Index Sync**: `_autosaveWritePrimary()`, `_autosaveWriteBackup()`, and `_updateIndex()` (`src/save/saveSystem.js:L601-612`, `L1589-1626`) interact synchronously with `localStorage`.

---

## 2. 16.3 ms Blocking Slice Composition & Root Cause

The measured 16.3 ms main-thread slice exceeds the 12 ms hard budget due to three primary main-thread overheads occurring within a single frame task:

1. **Un-chunked Synchronous Subsystem Serialization** (`src/save/saveSystem.js:L982-1010`):
   `_captureAutosaveSlice` loops through all 34 subsystem serializers (`entities`, `economy`, `missions`, `combat`, `sectorSim`, `claims`, `sites`, `formations`, etc.) in a single unbroken `while` loop within one main-thread task. Line 987 explicitly notes: *"Capture every subsystem exactly once in one coherent JS task."* In populated combat scenes, this single synchronous pass consumes 10–14 ms.
2. **Main-Thread Structured Cloning Overhead** (`src/save/saveSystem.js:L1176`):
   When `_postAutosaveEncodeParts` dispatches each subsystem payload to `saveWorker.js`, V8 synchronously clones the nested object trees on the main thread before passing them to the worker thread.
3. **Synchronous LocalStorage I/O** (`src/save/saveSystem.js:L1605-1623`, `L1720-1725`):
   Primary and index `localStorage.setItem` writes execute synchronously on the main thread, adding 1–3 ms.

---

## 3. Flight Autosave Triggers & Deferral Window Analysis

### Flight Triggers
- **Periodic Interval**: `update()` (`src/save/saveSystem.js:L137-144`) triggers `requestAutosave('interval')` periodically based on `autosaveIntervalS`.
- **Flight Events**: Progression events like `dock:docked`, `dock:undocked`, `sector:enter`, `jump:arrive`, `mission:accepted`, `economy:tradeCompleted`, `hud:layoutChanged`, `player:respawn` (`L120-133`).

### Calm/Idle Window Deferral (Zero Semantic Impact)
- **Current Gates**: `_flushAutosave` (`src/save/saveSystem.js:L898`) checks `_playerDead` and `jumpBusy`, but allows non-critical saves (`interval`, `hud_layout`, `trade`) to run mid-combat.
- **Deferral Strategy**:
  1. **Combat Quietness Gate**: Defer non-forced saves (`interval`, `trade`, `hud_layout`, `mission`) if the player has taken or dealt combat damage within the last 180 ticks (3s).
  2. **Idle Frame Scheduling**: Schedule non-forced `_flushAutosave` via `requestIdleCallback` or when frame callback time has $\ge 8$ ms headroom.
- **Semantics**: Critical transition saves (`jump:arrive`, `dock:undocked`, `player:respawn`) remain forced (`force: true`), ensuring zero save loss.

---

## 4. Remediation Plan (< 8 ms Main-Thread Target) & Save Integrity

### Recommended Low-Risk Remediation Path
1. **Shallow State Snapshot + Chunked Serialization**:
   Take a fast synchronous shallow reference snapshot ($\sim 1$ ms at tick boundary), then stringify or serialize individual subsystem subtrees across micro/macrotasks with a 4 ms time budget per task.
2. **Bypass Structured Cloning via Direct Worker Transfer**:
   Serialize subsystem slices directly into string chunks or Transferable ArrayBuffers before worker postMessage, eliminating V8 main-thread object graph cloning.
3. **Calm-Window Deferral**:
   Gate non-forced flight autosaves behind combat quietness checks to prevent autosave writes during high-stimulus combat frames.

### Save Integrity Safeguards
- **State Consistency**: A shallow reference capture at a single `state.tick` guarantees cross-subsystem state atomicity even when serialization is sliced across ticks.
- **Recovery & Validation**: Existing backup rotation (`RECOVERY_PREFIX`) and worker-side JSON readback validation (`validateSaveJson`) remain fully intact.
