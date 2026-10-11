# wave144 audit — blind-global

Lane: blind-global (fresh eyes on the whole presented path, no lane blinders). Tip `2af112763f4a94dbd111cd110061619557ca0fef` on `devin/1791504143-perf-w120`, merge base with `origin/master` = `c3521e379` (WORLD REMEMBERS spine — inside the audited tree; master's post-spine U-A..U-F features are NOT in this tip). Read-only; findings are MECHANISM_VERIFIED / PERFORMANCE_VERIFIED / UNVERIFIED.

## V1 — `9093c6959` BG-1 per-slot consume — MECHANISM_VERIFIED on the commit path; **one residual remains on the bail path**

The asked-for checks all hold:

- **Per-slot consume is ordered correctly** (snapshotFence.js:630-645): `dirty[slot]===0 → continue`; otherwise `dirty[slot]=0` + `consumedDirty.push(slot)` BEFORE the alive check and the row rewrite, inside the yielded 256-cadence scan. A mark landing mid-park on an already-consumed slot re-sets `dirty[slot]=1` via `markPackedDirty` and survives — the commit path no longer fills, so the mark reaches the next pack. Self-heal bound restored: mark-after-consume ⇒ next-pack rewrite.
- **Restored-value semantics are exact** (presentationWorld.js:563-565): `markPackedDirty` is the only nonzero writer and writes only `1` into a Uint8Array — `dirty[slot]=1` loses nothing. Every other writer writes `0` (pack paths sF.js:540/582/687/728, retireSlot pW.js:734).
- **Dead-slot consumed bits restore identically**: atomic bail leaves every bit set (it never consumes); stepped bail restores consumed slots — alive and dead alike — to 1; non-consumed bits were never touched. Net mask state on bail is identical between twins.
- **Post-consume re-mark during the same park survives**: re-mark sets `=1` on the live array; the restore's `=1` rewrite is a harmless no-op over it.
- **Atomic twin's fill-on-commit is still correct** (snapshotFence.js:489-508): the entire fast block is synchronous — `dirty.fill(0,0,scan)` at :504 inside `!bail` cannot interleave a mark.
- **Commit path carries no stale pose**: counters check (:647-652) runs synchronously between loop end and `fence.commit()` — no yield, so nothing lands between last consume and commit. Post-consume re-marks persist as bits (no fill); marks beyond `scan` were never consumed and persist in both exits. `retireSlot`'s own clear (pW.js:734) always pairs with `retirements++` (:743), forcing bail — never a silent mask.

**Residual (new, BG-1 class via the bail path) — the restore writes to a detached `dirty` alias after a mid-park `packDirty` realloc:**

1. `const dirty = world.packDirty` is captured once at :622, before any yield.
2. While parked, a presented-thread allocation crossing a capacity doubling calls `ensureCapacity(slot+1)` (pW.js:634 → :246), which reallocates `world.packDirty = growTyped(world.packDirty, Uint8Array, capacity)` (pW.js:263). `growTyped` copies (`target.set(source)`, :96-99) — the NEW array inherits the post-consume zeros for every consumed slot. `allocations++` follows in the same synchronous `allocateRecord` (:676) with no early-out between, so the counters guard forces bail — the commit path itself is safe.
3. On bail, `for (const slot of consumedDirty) dirty[slot] = 1` (:658) writes into the OLD, detached array — a dead write. The live `world.packDirty` keeps the copied zeros.
4. The fall-through classic walk reads the live mask: `world.packDirty[slot] === 0` (:680) + previousIndex hit → `copyRow` ships the last committed bytes (:687). The consumed mark is gone for good — for an entity whose final packed-byte write was that mark, the stale pose presents indefinitely. Identical signature to the bug this fix targeted; trigger narrowed to (>256-slot world so the scan parks) AND (a capacity-doubling allocation inside the parked window). Rarer than the fixed bug — grows are log-spaced — but mechanically real, and this fix is what creates it (pre-fix, nothing consumed until commit, so a grow copied intact marks).
5. Every other world array is immune because the loop reads them through `world.*` live (`world.alive`, `world.entityIds` re-read each iteration); `dirty` is the only captured world-array alias.

Fix direction: restore into the live mask — `for (const slot of consumedDirty) world.packDirty[slot] = 1;` — identical under no-realloc (`world.packDirty === dirty`), correct under grow (indices < scan ≤ old cap ≤ new cap). One token; cold bail path; no cost. (No commit-path variant exists — a grow always bumps `allocations` first, so commit can never run on a stale-alias premise.)

Minor, immaterial: `consumedDirty` adds one array + ≤scan pushes per fast pack — bounded by per-frame pose-dirty slots; noise versus the O(active) walk it replaces. Not a finding.

## V2 — `8c9daef8d` packageDetachSerial — MECHANISM_VERIFIED; zero presented-thread cost

- Serial lives in the leaf (`packageDetachSerial`, imageSourceDedupe.js:58-68) so both release owners bump one counter with no import cycle; `packageCpuDetach.js:34` re-exports `packageDetachSerialNow`.
- Coverage is complete over the covered-release class — every payload-emptying site bumps: `detachPackageTexture` detached-flip (packageCpuDetach.js:410→411), `detachPackageGeometry` (:535→536), per-user `mipmaps=[]` (imageSourceDedupe.js:447→449), and the standalone source release `data=null`/`sourceReleased` (:460-463). Grep-level: no other `.data=null`/`mipmaps=[]`/`detached=true`/`sourceReleased` site exists in either module; early-outs all precede the emptying write, so bumps fire only on actual releases (a consult's own rehydrate can never bump — refill paths contain no bump).
- Consult race check is the proven uploadAuditSeq pattern: serial captured in the async body's synchronous prefix before collect (asteroidRenderer3d.js:1420-1424), compared in `.finally` (:1436-1444); a moved serial re-invokes `onWorksContextRestored` (latch already cleared at :1436 → clean re-arm) bounded by `CONTEXT_RESTORE_RECOLLECT_MAX=4` (:1410), counter resetting on quiet settle or exhaustion — sustained churn degrades to pre-fix heal-by-next-admission instead of suppressing `bloom.render` (the :8847 gate reads the latch).
- Presented-thread cost: none. One integer increment on release events plus one read+compare per restore consult — all event-driven, all off the presented loop (works screen / detach gates). No per-frame work added anywhere.

## V3 — Fresh presented-thread hunt (commits since `e4c409d32`: `d775bf662`, `70a655d8a`, `34d824293`, self-merge `2af112763`) — MECHANISM_VERIFIED, no new static eval payload

- **ruckusMeshData split** (`d775bf662`): the ~3.4MB payload moved to `ruckusMeshData/{body0,body1,body2,core}.js` reached ONLY via dynamic `import()` (ruckusModel.js:221); the static-graph shim is 431B of `RUCKUS_MESH_KEYS` manifest. Payload module eval lands inside the import task — not the post-gate eval task. `template()` keeps the shared-iterator contract (:110-121): a mid-warm consumer pumps the same `pendingTemplates` entry to completion, no duplicate decode. `coldEntry` gives Node/Electron a synchronous `createRequire` path and browsers a descriptive unreachable-error (:27-38). `ruckusWarmReady` steps `templateSteps` one sub-step per `setTimeout(0)` macrotask after each arrival (:214-233) — same pacing contract as the W142 driver; `main.js` awaits it ahead of every spawn path (prepareRun :708, deferred restore :239).
- **gas/density split** (`70a655d8a`): ~700KB payload moved to `gasVolumeData/{density,motion}.js` + `densityVolumeData/rle.js`, all dynamic-import only (gasVolumeData.js:24-25, densityVolumeData.js:13); shims are 6.4KB/2.3KB of film metadata + decoders. `PACKED`/`packed()` mirror the ruckus pattern (READY promise, `createRequire` fallback, unreachable-error). Every decode consumer sits behind a gate: vfx `_initPools` defers on `VFX_VOLUME_PAYLOAD_READY` (vfx.js:336, :1691-1704 — structural, inside the boot window; rejection degrades pools with a logged error, no fault); the precompile salvo awaits both at its call site (precompile.js:384). Decode call sites (`gasVolumeMaterial.js:63`, `transientVfxMaterials.js:8`) are function-scoped and only reachable through those gates.
- **index.html**: the new modulepreloads (payload modules + registry entries mirroring the merged feature modules) are all `fetchpriority="low"` — fetch + scan only, no eval hoisted. Net static-graph delta from the three commits ≈ +9KB of shims vs ~4MB moved off.
- `34d824293` is a test digest repin (`test/ui-frame-references/*`); `tools/`, `scripts/bake-vfx-density.py` are offline; merge `2af112763` is a self-merge — no other content entered the tip. Nothing ungated landed on the presented path.

## Also noted

- `index.html` carries whitespace churn on the `modulepreload:registry:begin` marker again (cosmetic, same as last wave).

## Verdict

saturated: false — one material residual:

1. **BG-1b — stale `dirty` alias in the bail restore** (snapshotFence.js:658 writing the alias captured at :622): a mid-park `ensureCapacity` grow reallocates `world.packDirty` (presentationWorld.js:263 via :634), `growTyped` copies the post-consume zeros (:96-99), the forced bail restores `=1` into the detached array, and the classic walk then `copyRow`s the stale committed row — permanent stale pose for affected consumed slots. Same class the wave fixed, narrower trigger (parked >256-slot pack + capacity-doubling allocation in-window). One-token fix: restore into `world.packDirty[slot]`.
