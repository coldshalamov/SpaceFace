# wave76 audit — lod (lod-in-frame lane)

HEAD audited: `devin/1791064509-perf-w60` @ `243c889a3` (W75 tip — satisfies the prompt's "243c889a3 or later").

## 1. Verdict

`saturated: false` — four fresh mechanism-level findings follow, all contract-preserving.

## 2. Ranked findings

### F1 — Unguarded parked-warm-root continuation re-runs the sweep inside a later loading cook (S, impact H)

- **Evidence:** `src/render/renderer.js:17845-17854` — when the paced ledger is spent, the park loop arms `this._warmRootParkContinuation` and `setTimeout(0)` re-invokes `_parkBoundedWarmRoots()` unconditionally. Every synchronous call site carries a mode/staleness gate the continuation lacks: the deferred swarm warm settle checks `state.mode !== 'loading'` (renderer.js:17684) with the comment "a settle landing inside a later loading window must not detach roots the live cook's sweeps expect mounted"; the cook checks `cookStale()` immediately before both park calls (11979, 12296); the not-loading late invocation parks only after `mode !== 'loading'` (10888); the first-flight backstop runs in flight by construction (23205-18).
- **Mechanism:** a park that breaks mid-sweep in a presented frame fires its continuation one macrotask later. If a death/warp/F9 flipped `state.mode` to `loading` in that gap and a fresh live cook is mounting or relying on the bounded warm roots, the continuation detaches them mid-cook — the exact failure the in-code contract guards against (11975-78): "detached roots are invisible to the live cook's coverage sweeps (postOpening draws, never-linked census, depth sweep), so an early park leaves shared wave-hull programs unlinked until their first presented-frame draw." Player-visible shape: the first presented draw of a wave-hull family pays a cold program link — a hitch, and if the family's stand-in is still up, a stand-in visible where the real model belongs.
- **Consumer enumeration (the prompt's hunt — the half-parked sweep is otherwise safe):** `render.parkedWarmRoots` is read only by `scripts/probe-smooth-flight.mjs:370` (diagnostics — matches the "Diagnostics only" comment at 17830-35); the bare→PBR reskin iterates `_rosterPrewarmRoots` regardless of mount state (8960, 8980, 9003); `_releaseSurvivalRosterPrewarm` disposes roots parked or mounted alike (17859-91); the residency-stamp warmRoots filter keys on `root.parent` (11958-59) so a mixed set reads correctly; the late-compile and rescan sweeps read the list, not the mount (13708-16, 13831-37); `isResidencyOwnerActive` consults `record.active`, not park state. Per-root park is atomic (`root.parent.remove(root)` at 17827), so mixed state exists only *between* roots, and every consumer is root-wise. No consumer assumes a complete sweep — the only wrong assumption is the continuation's own.
- **Fix sketch:** gate the continuation the way the call sites do — inside the `setTimeout` callback, after clearing `_warmRootParkContinuation`, skip (or capture-and-compare a staleness token — `_liveSectorCookGeneration` or `state.mode`/`enterSerial` — and bail on mismatch): `if (this.state && this.state.mode === 'loading') return;` is the minimal correct form; an epoch token is the stronger one. Render-side only; sim determinism untouched.
- **Risk:** medium-low — requires a loading-mode transition inside a single macrotask window; death→reload and warp are queued task-window events, so the race is real but narrow. Probability is what keeps this below critical; mechanism and visibility are both direct.

### F2 — Stale-caller unbind releases the live mark-owner's noted claims before the caller-match gate (S, impact M)

- **Evidence:** `src/render/renderer.js:18338-18348` — `releaseId = sfBoundEntityId ?? entityId` then `releasePooledPresentationTextures(mesh, releaseId, this)` runs unconditionally at 18340, one line *before* the gate that preserves a mismatched mark (`entityId == null || sfBoundEntityId === entityId`, 18345-48). `releasePooledPresentationTextures` → `releaseNotedSharedTextures` → `releaseSharedTextureConsumer` (`src/render/pooledPresentationMarks.js:28-37`) deletes the consumer and **eagerly disposes** the texture when the last consumer leaves an `sfEvictWhenEmpty` row.
- **Mechanism:** on the stranded-rekey path W75 targets (mesh bound to B, `_meshes` still keys it under stale caller X), `unbind(X, mesh)` now releases B's claims — while `sfBoundEntityId` stays B, the world binding survives (`unbindMesh` identity-checks: `world.meshRefs[slot] !== mesh → return false`, presentationWorld.js:733-744 — verified B's mesh can't be detached by X), and the mesh keeps rendering B's textures. If B was the last consumer of an evictable shared texture, it disposes mid-display: a flat/missing-map surface inside the frame, or a decode+re-upload hitch when the texture is reclaimed. Self-heals only at B's next bind (`syncPooledPresentationIdentity` re-notes). The pre-W75 shape was worse (claims leaked deterministically), but the new release has a side effect the mark gate deliberately refuses: it mutates the *other* binding's lifecycle under a stale caller.
- **Fix sketch:** extend the same gate over the release — run `releasePooledPresentationTextures` only when `entityId == null || mesh.userData.sfBoundEntityId === entityId` (or mark absent). A mismatched caller then leaves claims and notes for the owner's own unbind — exactly the lifecycle the preserved mark encodes. Symmetric with the gate one line below; no contract risk.
- **Risk:** low — the trigger needs the stranded-rekey path *plus* a sole-consumer `sfEvictWhenEmpty` shared texture, but when it fires the consequence is the magic-frame bar's exact failure class.

### F3 — `presentationEntityId` is never cleared at unbind; resolver ladders can attribute a detached or pool-held mesh to a dead or recycled entity (S, impact L-M)

- **Evidence:** stamped at `src/render/renderer.js:18295`; no unbind-side delete exists in renderer.js — the only delete sites are the template/ghost scrubs (`src/render/partsLibrary.js:10774`, `src/render/crucibleGhost.js` GHOST_CLONE_USERDATA_DROP). Readers that consume it first-in-ladder: `admissionSubjectIsOnDeadlineGlass` (renderer.js:2782, `presentationEntityId ?? entityId ?? sfEntityId`) and `shadowPolicyEntityOf` (2803, `presentationEntityId ?? sfBoundEntityId ?? entityId ?? sfEntityId`), both resolving through `state.entities.get(id)` with no `sfStableEntityKey` disproof.
- **Mechanism:** the comment defending the gated `sfBoundEntityId` delete — "a mesh leaving the presentation world keeps no owner, so entity resolvers can't hand its next incarnation the previous owner's id" (18341-44) — applies verbatim to `presentationEntityId`, which stays stamped on the unbound mesh. A detached or pool-held root keeps attributing subjects to the previous owner: a dead id resolves to nothing (benign — falls to ambient), but a *recycled* id resolves to a different live entity (save restore reissues ids — the motion-tracker dual-release at 18359-73 acknowledges exactly this), so a subject that is nobody's mesh joins a foreign entity's deadline-glass/urgent classification — over-urgent ambient burn in the common direction, or an on-glass subject parked ambient when the recycled owner reads off-glass (real model lands late = stand-in lingers — the lane's defect class). `boundaryLiveEntity` (partsLibrary.js:2636-43) keeping `presentationEntityId` is deliberate — mounted ancestors stamp their own — and is orthogonal to the unbound-mesh case.
- **Fix sketch:** delete `presentationEntityId` inside the same caller-match gate at 18345-48 — bind re-stamps it every time (18295) and nothing legitimate reads it off an unbound mesh.
- **Risk:** low — reachable only while the mesh is detached or pool-held and consulted as a compile/admission subject (scene-mounted pool roots are the main surface), and the misroute usually over-covers.
- **Parity note (not a defect today):** the glass ladder (2782) lacks the `sfBoundEntityId` rung `shadowPolicyEntityOf` carries (2803). Currently unreachable — `sfBoundEntityId` is only minted inside `syncPooledPresentationIdentity` after `presentationEntityId` is stamped, and every scrub deletes both — but flag it for whoever edits these ladders next.

### F4 — `_armDepthStage`'s per-root signature collect is unbounded at node granularity (S-M, impact M)

- **Evidence:** `src/render/renderer.js:22060-22066` — the arm's collect loop calls `collectUnstagedShadowCasters(renderer, [root], scene, lightSig)` (22061) → `src/render/shadowDepthAdmission.js:427-428` → `collectPotentialShadowCastSubjects(subjects)` with **no `nodeBudget`** (the signature path accepts none; the flag twin `collectUnstagedShadowCastersFlag` threads one at 299-307 → 178-186). The deadline break is root-granular (`collected >= 2`, 22066).
- **Mechanism:** W69's `SHADOW_DEPTH_PASS_NODE_CAP=4096` bounds the *checked sync's* flag collect with over-cover on abort, and W67 bounded the arm's collect to ≥2 roots per 4 ms deadline — but a single root's subtree walk is atomic inside the arm: full traverse plus per-caster signature mints (`material.uuid + variant + lightSig` strings). A multi-thousand-node authored boundary promoted in one frame pays its whole collect inside an `armCallbackAfterPresent` task (`idleBoundMs: 48`, 22302) adjacent to the next presented frame; the overrun bleeds into the present's JS budget → hitch on exactly the promoted-root event the arm exists for.
- **Fix sketch:** thread a shared `{remaining}` node budget through `collectUnstagedShadowCasters` (same parameter shape `collectPotentialShadowCastSubjects` already takes); on `_walkBudgetAbort` treat the root as uncollected — requeue to `pending` still-withheld (the withhold contract tolerates deferral) rather than over-covering, since the arm needs the real set to stage.
- **Risk:** low — needs a fat subtree to hit the arm, which is rarer than the flag path but not contrived (packaged authored boundaries are the big roots).

## 3. W67 machinery regression verification

All verified against the audited head. Every check PASSES.

**(a) Deadline-bounded arm** (`_armDepthStage`, renderer.js:21958-22302)

- (a) min-1 progress REAL — PASS. Collect loop breaks only at `collected < sliceRoots.length && collected >= 2 && armNow() >= collectDeadline` (22066, `SHADOW_DEPTH_ARM_COLLECT_MS=4` at 6030): each iteration collects one root unconditionally, so ≥2 roots land per arm even when each is fat. Restore loop breaks only at `restored >= 1 && restoreIdx + 1 < slice.length && armNow() >= restoreDeadline` (22265, `SHADOW_DEPTH_ARM_RESTORE_MS=4` at 6031). A 32-fat-root slice cannot starve the drain.
- (b) requeued mid-slice keeps withheld flags + fresh re-collect — PASS. Withheld state lives on `mesh.castShadow=false` + `_withheldDepthCasters`, neither touched by requeue (22068-71); `legSet` is arm-local (22081), the next arm mints a fresh one via `collectUnstagedShadowCasters` — no stale legSet, no leak (`unstagedByRoot`/`leftoverByRoot` are arm-local too).
- (c) pending-Map requeue preserves {lodLevel,entity} — PASS. `slice.splice(collected)` returns the same `[root, entry]` tuples built from `pending`'s own entries (21998-22001); `pending.set(root, entry)` requeues the identical entry object — no field loss.
- (d) whole-arm debit — PASS. `armStartedAt` is captured at the callback top (21964) before the pending/parked sweeps, nearest-first sort, census mint, session mint, private render, slice and restore; `notePacedFrameSpend(armNow() - armStartedAt)` runs in `finally` (22290) — the WHOLE arm debits, throw or not, including census + render task.

**(b) Undrawable parking** (`_parkedDepthStageRoots`, renderer.js:21753-22232)

- (a) parked counts as 'queued' — PASS. `parked` is read *after* `parkedRelease` deletes the entry (21774-78); `queued = pending.has(root) || parked` (21779) feeds the `band !== 1 && queued` branch which forces `syncOpts.allowCast:false` (21864-65) — a parked root's castShadow stays withheld. Band-1 parked roots take the `band === 1 && selfDirty && queued` cached re-stamp (21866-79) — withheld flags re-forced from the non-empty cached set parked roots always carry (22228 `new Set(reforceLeftover)`).
- (b) dirtySeq bump → normal collect + park deletion in BOTH flows — PASS. `parkedRelease` (dirtySeq>seq OR lightSig mismatch OR ortho-cell drift, 21764-73) deletes the park entry *before* `parked`/`queued` are read, so the normal collect gate opens (`!queued`) and runs withhold-or-restore: non-empty collect deletes the park again + requeues (21903-07); empty collect unparks + releases the withheld set (21851-57). The second unpark path — recheck-expiry (`parkedRecheck`, 21789-21801) — also flows into the empty-collect release.
- (c) collect [] → unpark + restore live flags — PASS: 21851-57 releases `_withheldDepthCasters` + `sfDepthUndrawableCycles`, then the normal `syncShadowCasterPolicy` below restores live cast flags.
- (d) arm-time parked sweep drops detached roots — PASS: 22013-24 deletes the park entry and clears the stale bookkeeping a re-mount must not inherit.
- (e) leftover root with meshes beyond the leg → requeue never parks — PASS: `allOffered = legSet !== null` + per-mesh `legSet.has` check (22180-83); any leftover outside the leg takes `pending.set(root, {lodLevel, entity})` + `continue` (22215-16) — parks only when EVERY leftover mesh was offered to the leg (22184+).

**(c) Paced-ledger routing** (decodeTaskBudget.js + all slicers)

- (a) min-1 guarantee preserved at every consult site — PASS, enumerated:
  - reconcile loop: post-step check, renderer.js:2133-34.
  - poll loop: post-step check, 2180-81.
  - hold-exempt collect: post-step check, 2557-58; commit enqueue: `commitBounded && commitSteps > 0 && (...)` — the `commitSteps > 0` conjunct preserves ≥1 (2604-05); commit kick: same shape (2623-24); remint gates: post-phase checks at 2640-41 and 2654-55.
  - `drainDeferredEnterSlice`: `steps === 0 ||` conjunct keeps the first step unconditional (sectorEnterDefer.js:154-55); dead-epoch splice happens before the loop (138-45).
  - `drainEmitSlice`: post-listener check inside the loop (eventBus.js:349) — ≥1 listener per call.
  - `drainPresentationTail`: post-listener check (eventBus.js:416) — ≥1 invocation per call.
  - `_drainMeshBuildQueue` via `usePacedLedger`: `shouldContinueAdmissionSlice` returns `true` whenever `itemsDone < minItems` (default 1) *before* the ledger check (admissionSliceBudget.js:37-38) — ledger consulted only post-minItems.
  - `drainDespawnDisposeQueue` entry gate: wholesale-skip site — see (b).
  - composed-ship slicer: post-step yield gate (partsLibrary.js:10314-17).
  - `_parkBoundedWarmRoots`: per-root post-step gate, `roots >= 1` (17845).
  - depth arm: entry gate skips whole arm (21981-86); collect min-2 roots + restore min-1 (above).
  - glTF compile drain: post-skip aging + post-task check (decodeTaskBudget.js:332-49).
  - **Correction to the prompt's enumeration:** wholesale-skip sites are FOUR, not one — despawn entry (renderer.js:1817, `DESPAWN_DISPOSE_LEDGER_MAX_SKIPS=2`), depth-arm entry (21981, `SHADOW_DEPTH_LEDGER_MAX_SKIPS=2`), glTF compile drain (decodeTaskBudget.js:332, `GLTF_COMPILE_MAX_SKIPPED_FRAMES=2`), and `driveOpeningPublicationResume` (partsLibrary.js:6338-43, `OPENING_PUBLICATION_RESUME_MAX_SKIPS=2`). The underlying contract — defer the whole arm, never drop queue contents, age-bound the skips — holds at all four identically.
- (b) despawn entry-gate defers never drops — PASS: returns 0 with `_despawnDisposeHead` and the queue untouched (1817-21); after `DESPAWN_DISPOSE_LEDGER_MAX_SKIPS=2` the drain runs its bounded min slice anyway. Same shape at the other three wholesale-skip sites (queues preserved, aged re-arm).
- (c) 8ms window can't under-report on long frames — PASS on browser hosts, with a stated caveat: `paceEpochNow()` keys the wallet on the rAF pump epoch (decodeTaskBudget.js:65-107), so spend attributed to the current epoch stays visible for the frame's whole length regardless of frame duration. The wall-clock 8ms window is only the fallback for headless/no-rAF hosts and stale pumps (>250ms, `PACE_EPOCH_STALE_MS` at 63) — in fallback mode a slice starting >8ms into a long task does read spend=0, but there are no presents to key in those hosts. Long presented frames cannot under-report in the real browser path.

**(d) Flag-only OFF→ON collect** (shadowDepthAdmission.js)

- (a) already-staged mesh withheld at OFF→ON, collected-unstaged-empty in its arm — PASS: the arm's `collectUnstagedShadowCasters` returns only mark-stale casters; already-staged meshes are absent, so the withheld set is small; the empty-collect path releases the withheld set and restores (21851-57, plus the band-1 empty-collect stamp at 21842-44 preventing re-walk spin).
- (b) over-withhold resolves — PASS: `UNSTAGED_COLLECT_OVER_COVER` forces `allowCast:false` on the whole subtree and requeues pending (21858-65 + 21909+); the arm's real collect re-derives the genuinely-unstaged set, stages exactly those, and the restore loop un-withholds the staged remainder — no permanent over-withhold.
- (c) exclusion parity — PASS by construction: `spacefaceNoShadow`, `sharedContactShadow`, `authoredReadableFallbackLayer` are filtered inside the shared `collectPotentialShadowCastSubjects` (198-200) that BOTH `collectUnstagedShadowCasters` (428) and `collectUnstagedShadowCastersFlag` (302) call — identical exclusions, zero drift surface. Also excluded identically: `materialCanCastShadow` (visible/transparent/depthWrite/opacity<1, 165-71), geometry-less stubs (196), `!capable` for all-invisible materials (313-18 vs the signature path's empty-signatures skip).

**(e) reset:true prepare defer** (src/core/physics.js:352-455)

- (a) post-sleep `_disableSg02DynamicAuthority` is a true no-op in `!sg02Init && !sg02` — PASS: the token bump is gated `if (this._sg02 || this._sg02Init) this._sg02Token++` (772); with neither set, no token bump, nothing disposed — only diag-field writes. A later minted authority has nothing to fight.
- (b) abandoned caller wait still mints the backend — PASS: after the settle race resolves false on timeout (417-22), execution continues into `_disableSg02DynamicAuthority()` then `_updateSg02DynamicAuthority(0, state)` (424-26) which mints the init inside this same call (574-620) — a caller that stops awaiting doesn't cancel the async function, so the backend still mints; a late-settling init installs for the next attempt per the warn comment (441-49).
- (c) concurrent deferred prepares don't interleave mints — PASS: `sg02TokenAtDefer !== this._sg02Token` adopts the winner's in-flight init on the same envelope instead of a second mint (388-406); `sg02TokenAtPrepare !== this._sg02Token` returns false before the stale tail touches diagnostics (440); the install-side token check disposes losers (585-92) and the `_sg02Init === init` slot release (590, 617) prevents a dead promise from freezing the lane (D26).

**(f) Variant interning** (`_depthVariantCache`, shadowDepthAdmission.js:364-92)

- (a) alphaTest 0→1 re-mints — PASS: `bits[0] = material.alphaTest > 0 ? 1 : 0` is recomputed per call and the cache only serves when `cached.bits.every((bit,i) => bit === bits[i])` — a flip produces a fresh variant string → new signature → mark mismatch → unstaged.
- (b) side/shadowSide verbatim — PASS: `bits[6] = material.side == null ? 0 : material.side` and `bits[7]` mirror for shadowSide — numeric values feed the bits un-translated (0/1/2 distinct), and `every` compares numbers exactly.
- (c) no stale variant after needsUpdate-style reuse — PASS: the WeakMap is keyed on the material object and every discriminant bit is re-read per call; a same-uuid mutation that changes any of the 10 depth-program inputs re-mints the variant, which re-mints the signature, which fails `casterDepthMarkCurrent` — the caster re-stages instead of linking cold. Non-discriminant `needsUpdate` churn correctly leaves the variant alone (it's the program-key shape three itself re-derives).

## 4. Lane-hunt enumeration (paired-key attribution sites)

Write/read key pairs audited across `src/render/`:

| Site | Write key | Release/read key | Verdict |
|---|---|---|---|
| `syncPooledPresentationIdentity` / `releasePooledPresentationTextures` | notes under `sfBoundEntityId` at sync (8240-57) | release under `sfBoundEntityId ?? entityId` (18338-40) | **mark-owner — correct key, wrong gate order — F2** |
| `_persistentSubmitLanes` reserve/release | `entity.id` at bind (18322) | caller `entityId` (18383) | caller-scoped reservation — consistent pairing (mismatched caller frees its own slot, owner's survives for its own unbind) |
| `world.bindMesh` / `world.unbindMesh` | `handleForEntityId(entityId)` (18386) | same caller id + **mesh identity check** (733-44) | mismatched caller's handle resolves its own slot whose mesh ≠ foreign mesh → `return false` — foreign binding can't be detached |
| motion trackers (shipMicro/asteroid/infra/forgeCrown/lawDressing) | entityId + mesh | dual release: by `entityId` (18359-65) AND by `mesh` (18368-73) | covers recycled-id strays — complete |
| `_meshes` map key / `sfStableEntityKey` | map id + stable key at bind (18296) | reconcile disproof `stableMeshKeyForEntity(e) !== stampedKey` → release (18697-709); rekey path unbinds oldId → moves → binds newId (1758-76) | consistent — dead-id entries release under their own dead key |
| `boundaryLiveEntity` | `presentationEntityId` on live boundaries | `live.entities.get(id)` (partsLibrary.js:2636-43) | deliberate per prompt — no stable-key disproof; consequence bounded to urgency-lane classification, wrong-verdict direction mostly over-covers |
| resolver ladders | `presentationEntityId` (first rung) | `admissionSubjectIsOnDeadlineGlass` 2782, `shadowPolicyEntityOf` 2803 | **stale after unbind — F3** |
| `clearPooledTransientMarks` / ghost+template scrubs | `sfBoundEntityId` stamped inside bind sync | deleted in `dropFlightTemplateDynamicUserData` (10775) + `GHOST_CLONE_USERDATA_DROP` (crucibleGhost.js:19-46) alongside `presentationEntityId`/`sfStableEntityKey` | scrubs delete both marks — no mark-without-stamp shape reachable |

`sfBoundEntityId ⊆ presentationEntityId` invariant confirmed: the mark is minted only inside `syncPooledPresentationIdentity` (8243) which runs at 18325, after the `presentationEntityId` stamp at 18295, and every clone/template scrub deletes both. A `sfBoundEntityId`-only mesh is unreachable today (parity note under F3). A `presentationEntityId`-only mesh arises only on a bind that throws between 18295 and 18325 — such a mesh has no noted claims (sync never ran), so unbind's release is a no-op and nothing leaks.

`liveId`-keyed bookkeeping (`_ecologySpawned`/`_ecologyLiveToKey` in aftermathWrecks.js:924+, encounterDirector.js:4205, automation.js:2122, wingmen.js:82) lives in `src/systems/`, not `src/render/` — outside this lane's stated scope; its bind/unbind dual-edge shape was spot-checked at aftermathWrecks.js:2589-2640 and is consistent (reverse-edge kept at every site, duplicated-liveId falls back to the walk).

## 5. Files consulted

- `src/render/renderer.js` (23560 lines): 1715-1778, 1800-2194, 2540-2669, 2765-2814, 4945-74, 6024-48, 8205-8266, 8940-9023, 10018-34, 10880-99, 11945-12030, 12280-12314, 13695-13874, 14192-14222, 14630-60, 17550-17904, 18275-18391, 18685-18770, 19170-19464, 21753-22302, 23205-30.
- `src/render/shadowDepthAdmission.js`: 138-428 (collectors, mark, census, variant cache).
- `src/render/pooledPresentationMarks.js` (full file).
- `src/render/presentationWorld.js`: 630-754.
- `src/render/partsLibrary.js`: 2630-2711, 6325-6402, 6655-6711, 10295-10362, 10740-10794.
- `src/render/admissionSliceBudget.js` (full file).
- `src/render/decodeTaskBudget.js`: 40-119, 300-360.
- `src/core/eventBus.js`: 300-439.
- `src/core/sectorEnterDefer.js`: 120-189.
- `src/core/physics.js`: 300-455, 569-628, 771-810.
- `scripts/probe-smooth-flight.mjs`: 363-72.
- `test/bounded-warm-root-park.test.mjs` (surfaced as a consumer of `_parkBoundedWarmRoots`; asserts second-park no-op — still true, continuation re-scans the list and skips parked roots via `!root.parent`).
- `design/perf/PERF_W4_CLOSURE_2026-09-29.md`, `design/perf/HILLCLIMB-LOG.md` (prompt-required reading, done).
