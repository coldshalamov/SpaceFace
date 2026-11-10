# E9 — Load in seconds: diagnosis

## 1. The player-visible problem
Launch → controllable flight takes far too long (the master plan's bar: ≤ 5 s warm on this
laptop; web first load ≤ 35 MB). The title sits behind a long eager graph before it can react,
and flight waits on the world build behind it.

## 2. Measured cause chain (this session, from the current `build/web` release tree)
- The transitive import closure rooted at the bundled `main.js` is **339 files / 31.6 MB**
  (all import forms counted). The single largest chunks:
  `chunk-ALEOKSF5.js` **5.0 MB**, `rapier-VJIGLCAU.js` 2.2 MB, two ~1.8 MB chunks, three
  ~1.5 MB chunks, `stationScreen` 1.0 MB, `crucible` 0.5 MB — 340 JS files, ~33 MB JS total,
  609 MB release tree with assets.
- **Screens are already route-split** (stationScreen/crucible/asteroidScreen are separate
  dynamic chunks). The weight is the SHARED CORE: the 261-system authoritative graph + world
  data + renderer modules all sit in main.js's static closure — one mode boots them all.
- The dev path is zero-build (raw ESM); the release path is esbuild with manual chunks
  (`scripts/build-bundle.mjs`). Rapier is already a separate chunk (2.2 MB, loaded by the
  physics owner only).
- The title screen itself is light (the orrery menu) — the boot cost is the module graph
  evaluation + the world/state bootstrap behind it, then the authored-visual/physics readiness
  gates before control releases (ARCHITECTURE §1.3).

## 3. Is the design the bottleneck?
Partly. The one-graph-for-everything module structure (261 systems statically reachable from
main.js) is the load-time bottleneck; the bundle tooling already supports what's needed
(dynamic imports → chunks, worker entries, CSS sidecars). Replacing the bundler buys nothing.
The cheaper road to the finished result is **mode-scoped module graphs**: the shared core stops
statically importing mode-owned system sets (Swarm/Crucible/Adventure systems become dynamic
imports at mode entry), Rapier loads only when a mode needs physics, and the title gains
interactivity before the world build starts. This is the same cut E3 (mode-scoped simulation)
makes in the run dimension — E9 makes it in the module dimension.

## 4. Chosen road
1. **Measure first**: a build with `--metafile` + a boot-time probe (E10 trace extension: bytes
   before first flight, per-phase boot timeline) — before/after for every slice.
2. **Mode-owned system sets out of the eager graph** (with E3's manifest as the boundary
   source): Swarm/Crucible/race systems behind dynamic imports resolved at mode entry.
3. **Rapier deferred** past the title (physics owner imports it when the world build starts —
   title becomes interactive ~2.2 MB earlier).
4. **Predictive streaming**: the mode chunk preloads when the player hovers/enters the route
   (title → New Game preloads Adventure core).
5. **Persistent caches**: Electron `v8CacheOptions` already `bypassHeatCheck` (code cache);
   add service-worker/CacheStorage for the web channel's asset chunks (KTX2/GLB).
6. **Interactive title while loading**: the menu mounts before `registry.initAsync()` completes;
   New Game/Continue buttons gate on the modules they actually need.

Sizing: the mode-split is an L campaign touching the manifest wiring (coordinate with Lane 2's
E3 manifest) — it is NOT started while E1's live verification is pending; this memo is the
committed diagnosis and the order above is the road. The 35 MB / 5 s bars are re-measured after
slice 2–3.
