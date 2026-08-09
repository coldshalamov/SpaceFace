<!-- LIFETIME: DURABLE -->
# Binding review of the five incubator prompts, and the Ceres Wave-1 selection ledger

```yaml
preparedAt: 2026-08-09
auditBase: e776bf11
priorHead: 7933bbde
method: 8 read-only audits + 8 adversarial verifiers; 21 audit claims refuted, 48 corrected
writeSurface: design/reference-sector/ only
mutexesHeld: none
```

This is one document because the two things it was asked to be are the same artifact. "Review the
work of prompts 1–5" and Wave 1 of `REFERENCE_SECTOR_VALUE_HARVEST_PROMPT.md` (unmerged — lands with
PR #91 into this directory) — "an exact selection ledger; every asset receives one disposition" —
produce the same rows. Splitting
them would produce two documents that disagree within a week.

Every claim below survived an adversarial verification pass whose instruction was to refute it.
Claims that did not survive are recorded in §7 rather than deleted, because a retracted finding is
worth more to the next lane than a silently dropped one.

---

## 1. What the five prompts actually produced

| # | Output | Location | Committed? | Runtime-reachable? | Independent review |
|---|---|---|---|---|---|
| 1 | NPC Activity Pack — 15 GLBs, 12 occupational families | `assets/incubator/npc_activity_pack/` | yes (`28529c34`) | **no** | yes — `evidence/REVIEW-independent-2026-08-08.md` (controlling) |
| 2 | Everyday Space Kit — 46 GLBs, 6 families | `assets/incubator/everyday_space_kit/` | yes (`a811d0a8`) | **no** | yes — verdict appended to `evidence/REVIEW-round-1.md` (controlling) |
| 3 | Wreck & Aftermath Pack — 37 GLBs, 3 of 6 hull families | `assets/incubator/wreck_aftermath_pack/` | **no — intent-to-add only** | **no** | **none — this review is the first** |
| 4 | Microevent library — 58 events, 8 categories | `design/incubator/microevent_library/` | yes (`b1e7b7a5`) | **no** (data only) | self-audit only (`SYSTEMS_AUDIT.md`) |
| 5 | VFX NEXT — 12 effect families | `src/vfxnext/` + `_vfxlab.html` | yes (`7933bbde`, `e776bf11`) | **no** (by design) | **none — this review is the first** |

**The headline verdict.** All five prompts delivered what they were asked for, and all five delivered
it *source-only*. Nothing from any of them reaches a player. That is not a failure — it is exactly
what the low-interference briefs asked for, and it is why they were safe to run in parallel. But it
means the honest count of player-facing value delivered by prompts 1–5 is **zero**, and the whole
value of this pass is deciding which small subset earns the cost of promotion.

The three review gaps are unevenly important. Prompt 3's pack is the one that is *both* unreviewed
*and* uncommitted, and prompt 5's library is the one that turns out to carry a latent hazard. Those
two got the deepest scrutiny below.

---

## 2. Per-prompt findings

### 2.1 NPC Activity Pack (prompt 1) — donor, four families selected

The controlling review stands and is not re-litigated. Three things it says that the selection
ledger must obey:

- the assets **"remain blockouts"** — production-ladder state 1 of 9, not state 2 (`design_candidate`).
  The remaining work is not "author LOD1/LOD2"; it is four intervening states including all UV, bake
  and surfacing work (`assets/ships/AGENTS.md:29-39`);
- eight families carry unreconciled fiction-vs-measured length deltas (`INTEGRATION.md:62-76`), and
  reconciliation is a *precondition*, not a cleanup;
- there is no per-asset verdict table, and `REVIEW-round-1.md` in the same directory is **not**
  controlling — its own heading calls it "Design-candidate self-review reading (not acceptance)".

**Two blockers this review adds, neither of which is in the pack's own documents:**

**(a) The ore barge cannot be wired the way the other three can.**
`WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE` (`src/render/partsLibrary.js:903-907`) is keyed by
`slot.presentationRole`, and `hauler` there is already the accepted `helios_span`. All three Ceres
hauler slots carry `presentationRole: 'hauler'`
(`src/data/sectorActivityPockets.js:252`, `:334`, `:408`), so adding an `ore_barge` row under
`hauler` would replace an accepted live asset **in every sector** — precisely what `NOW.md` row 73
forbids.

The fix is *not* a new `TRAFFIC_ROLES` entry, as first diagnosed. Job eligibility gates on the
separate `slot.jobKind` field (`traffic.js:223`), so a slot may carry
`presentationRole: 'ore_carrier'` while keeping `jobKind: 'hauler'`, needing only new keys in
`WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE` / `WHOLE_SHIP_ASSET_ID_BY_TRAFFIC_ROLE`. **But** without a matching
`TRAFFIC_ROLES` entry there is a silent fallback: `traffic.js:669`
(`TRAFFIC_ROLES[role] || TRAFFIC_ROLES.hauler`) hands the actor hauler's ship/team/speed/archetype,
`traffic.js:785` labels it "Cargo Hauler", and `src/systems/scanner.js:1341-1348` matches no branch.
The barge would look new and read as a hauler in every UI surface.

**(b) `customs_cutter` is a semantic collision across the hostility boundary.**
`src/data/enemies.js:231` already defines `customs_cutter` as a **hostile** archetype
(`ship_hornet`, `faction_scn`), referenced by `src/data/encounters/326-customs-logic-net.js:30`.
The pack's own `evidence/ROLE_MATRIX.md:17` assigns its `customs_cutter.glb` to the **neutral team-2
`patrol`** traffic role. One string would name both. This is why `customs_cutter` is DEFER, not a
pick, despite being a good law silhouette.

### 2.2 Everyday Space Kit (prompt 2) — donor, sixteen props selected

The controlling verdict is **stricter than it is usually quoted**. The "19 REVISE-first" list is not
the boundary of the problem: `REVIEW-round-1.md:179-181` states that **every other asset is still
REVISE before runtime promotion** because pack-wide material, assembly, LOD, collision and evidence
defects remain. The 19 are only the ones that "should not seed promotion until their named form
failure is repaired."

Two facts that constrain any promotion lane:

- **the pack is not byte-reproducible** — two isolated Blender 5.1.2 builds differed bytewise in
  29 of 46 GLBs despite 46/46 semantic parity. A re-authoring lane must pin the toolchain and prove
  two matching builds *before* it produces slice evidence, or the evidence will not bind;
- **`crusher_module` is a rebuild, not a re-author** — its feed opening is still capped
  (`hopper_shell`/`hopper_throat` are default capped cones) *and* it carries the worst bound
  inflation in the pack (+19.4% X, +52.3% Y). It is REJECTED below.

### 2.3 Wreck & Aftermath Pack (prompt 3) — first review; six defects

Integrity is genuinely clean: all 37 SHA-256 hashes and byte counts match disk, every GLB mtime
predates the report's, sockets survive export and are reachable from `scenes[0]` under an orphan test
the builder itself does not perform, and the `transform_apply`/AABB/drift traps the pack documents
are all actually guarded in the builder. The pack is honest about shipping 3 of 6 families and says so
in its first table rather than burying it.

Against that, six defects, none of which appear in the pack's own documents:

1. **None of the three "assertions" can fail a build.** `socketFailures`, `gapFailures` and
   `floatingMarkFailures` are written to JSON and printed; the builder's only `SystemExit` paths are
   "not `--background`" (`:207`) and "unknown family" (`:2485`). No external caller checks them
   either — a repo-wide grep for the three names outside the builder returns zero hits. A rebuild
   with a lamp floating in vacuum writes all 37 GLBs and exits 0.
2. **Seven of 37 assets are structurally exempt from all three arrays.** The state-variant branch
   (`builder:2606-2618`) computes `verify_sockets` and `check_attachment` and then throws the results
   into per-entry fields without ever appending to the failure arrays, and hardcodes `'gaps': []`.
   So `socketFailures: []` / `gapFailures: []` / `floatingMarkFailures: []` are **vacuous for 19% of
   the pack** — and the builder's own comment at `:2593` says the variants are exactly the files a
   promotion lane consumes.
3. **The headline traversability claim does not establish traversability.** `clearSpanM` is a single
   probe radius mechanically doubled — one point, isotropic sphere fit — not a swept-path measurement.
4. **Eight assets breach the size bands the documents commit to** (not seven), and two debris pieces
   are *larger* than the `place_debris_chunk` (30.8 m) the pack's audit says it was deliberately
   authored smaller than: `deb_ore_freighter_ring_span` at 53.25 m and `deb_ore_freighter_hopper_lid`
   at 31.56 m. That undercuts the non-duplication argument. The mechanism is datable: `INTEGRATION.md`
   (mtime 20:36) and `EXISTING_COVERAGE.md` (18:00) both **predate 21 of the 37 GLBs**, including
   every asset governed by their own bands. The two hand-authored docs a promotion lane reads first
   are the two that never saw the shipped numbers.
5. **The pack is completely untextured** — `images=0` and `textures=0` across all 37 GLBs — while
   every comparator it benchmarks against carries embedded images (`place_dead_hulk` 21,
   `place_debris_chunk` 21, `place_landmark_wreck_cathedral` 26). `INTEGRATION.md:227` lists only
   "No KTX2 / Meshopt", which reads as *textures exist but are uncompressed*. Having none at all is a
   materially larger promotion step than the doc admits.
6. **Three stale sub-reports ship alongside the authoritative one**, disagreeing on 13 of 23 hashes
   and on measured envelopes, with nothing in any document marking them superseded. A lane reading
   `build-report-liner.json` gets wrong numbers.

Plus an unnamed promotion blocker: **1,891 unmerged authoring primitives** across 37 files, no LODs,
no instancing — one 178 m hero carries 208 meshes against `place_dead_hulk`'s 18.

### 2.4 Microevent library (prompt 4) — strongest of the five

The bible builder is genuinely deterministic: run on a scratch copy it exits 0 and regenerates
`EVENT_BIBLE.md`, `DEPENDENCY_MAP.md` and `TIERS.md` **byte-identically** to the committed versions.
All 28 live dependency ids resolve to real code at HEAD; `campaignDirector` and `sectorPockets` appear
nowhere in `src/`, confirming the two documented renames were real fixes.

Four residual defects, all label-precision rather than substance:

- **`salvage.strip` is the one that matters** — it is the only CAPABILITY-graded row with `first15`
  dependents (`ev_cutter_strips_wreck`, `ev_scavengers_at_fresh_wreck`). Its cite claims
  `src/systems/salvageActions.js:58 — actionForWreck()`, but `:58` is
  `export const salvageActions = {`; `actionForWreck` is *imported* at `:7` from
  **`src/data/salvageActions.js`**, a separate file the audit never names;
- **the tier math is only half validator-enforced.** `build-microevent-bible.mjs` asserts
  `first15 !== 15`, `next20 !== 20` and total outside 50–70. Nothing asserts `standard === 18` or
  `blocked === 5`. Retier a standard event to blocked and all three assertions still pass while the
  doc's headline silently becomes wrong;
- **`sectorZones.slot`** keeps a `.slot` suffix that `SYSTEMS_AUDIT.md:28` itself declares
  nonexistent (12 dependents, all `next20`/`standard`, **zero `first15`** — so the exposure is low);
- **`comms.ambientToast`** — the module is right and the capability is live
  (`comms.js:229 bus.on('comms:popup', pushComms)`, emitted from five `src/` modules); only the
  *presentation* is misnamed (left-edge comms feed, not the `toasts.js` pill). This was initially
  graded a major defect and that grade does not survive; see §7.

**On the proposed runner.** `INTEGRATION.md` and the generated `TIERS.md` describe it at two
different scopes ("a small choreography timer" vs. selection + binding + release + a
concurrency/cooldown/chain policy layer). `INTEGRATION.md:93` labels the heavier material "a
projection from authored durations and tier counts," so this is a docs-nuance issue, not two
competing designs. **It still matters for scoping**: the six selected events must be implementable
against the *timer* reading. If the first implementation needs the policy layer, that is the signal
that a bounded adapter has become a global framework, and the program forbids the latter.

### 2.5 VFX NEXT (prompt 5) — first review; one latent hazard, one accessibility hole

Twelve families are internally consistent across four independent lists, all three documented
invisible-effect traps are genuinely guarded, and the uncommitted diff (since landed as `e776bf11`)
is *finished*, not mid-edit — it removes a geometrically incoherent directional wedge and fixes three
rate-against-a-fixed-pool bugs.

**The verdict on the "is this a second VFX system?" question is: it is a reference library in intent
and a competing renderer in construction — five substrates, its own scene `Group`, its own light
pool — but the part that survives contact with the program is the *recipes and the ForceRecord
contract*, not the code.** That is a usable answer, and §4.4 acts on it.

**The single biggest finding in the whole audit, unreported by the packet itself:**

`src/vfxnext/core/lights.js` toggles `.visible` on scene `PointLight`s (`:31`, `:59`, `:79`, `:95`).
`src/render/vfx.js:9346-9349` records verbatim why the live owner must never do this:

> Pool lights stay VISIBLE forever and flash via intensity only. three bakes the visible light COUNT
> into every shader program, so toggling `.visible` forces a synchronous whole-scene shader recompile
> (measured multi-second stalls on Intel/ANGLE). The count must never change at runtime.

`lights.js:9-12` claims fixed allocation avoids recompiles, but fixed allocation only rules out
scene add/remove. Visibility toggling changes the visible-light count on every spawn and expiry —
precisely the cache-key mutation. **Scope honestly:** the pool is built against whatever scene
`createStage` receives, which today is only `_vfxlab.html`'s. This is a **latent promotion blocker
and a lab-side hitch source, not a live-game regression.** It must be fixed before any family is
promoted.

Second: **`stage.intensity`, the packet's declared reduced-flash hook, never reaches the LightPool.**
It reaches sparks, smoke, fronts and ribbons (`stage.js:173-176`) but `lights.js` has no intensity
scaling of any kind — `spawn()` writes `l.intensity = peak` raw. Turning reduced-flash to 0 dims every
particle to nothing and leaves all four dynamic PointLights at full peak. The brightest, most
flash-sensitive element is the one the accessibility control does not cover. The live owner does this
correctly at a single choke point (`vfx.js:9490`, `peak *= accessibility.eventLightPeakScale`).

Third: **`speed_extreme` is an unsanctioned second exceptional-speed output.**
`src/render/velocityLanguage.js` is the program-named owner of speed language; it caps streaks at 24,
caps alpha at 0.20, forbids additive in every band, and **deliberately fades streaks out above 5×** as
its stated design point. `speed_extreme` scales additive near-white emission *up* with the speed band.
`PHYSICS_AS_SPECTACLE_PROGRAM.md:181` grants that owner "one bounded exceptional-speed output" and
`:255-256` records the allowance as **already spent** (camera opening + projectile-ribbon intensity,
`3118aa5a`). `vfxnext` never names `velocityLanguage.js` anywhere.

Also: six of twelve families are single-emitter (`stage.hold()` keys sustained by family id), so
exactly one `thruster_boost` can exist at a time — a populated sector needs several. And
`scripts/capture-vfxnext.mjs` is wired to no npm script and writes to gitignored `.devshots/`, so the
capture evidence backing every budget claim in `VFX_NEXT.md` cannot go stale loudly.

---

## 3. Corrections to prompt 1–5 documentation (exact, small)

These are the "improve them" actions. All are documentation or test-harness fixes; none touches a GLB.

| # | File | Change | Why |
|---|---|---|---|
| C1 | `assets/incubator/wreck_aftermath_pack/INTEGRATION.md` | Replace "No KTX2 / Meshopt" with "**No texture data at all** (`images=0`, `textures=0` in all 37); KTX2/Meshopt therefore not yet applicable" | Current wording implies textures exist |
| C2 | same | Add the eight band breaches as a named table; state that `INTEGRATION.md`/`EXISTING_COVERAGE.md` predate 21 of 37 GLBs | The bands are asserted against numbers the docs never saw |
| C3 | same | Add a row: 1,891 meshes / 0 LODs / 0 instancing as a named promotion blocker | Currently unnamed |
| C4 | `tools/blender/build_wreck_aftermath_pack.py` | Make the three failure arrays fail the build (nonzero exit); include state variants in all three aggregations | "Assertion" that cannot fail is not an assertion |
| C5 | `assets/incubator/wreck_aftermath_pack/evidence/build-report-{liner,corvette,ore_freighter}.json` | Delete, or add a `superseded: true` field and name them in `INTEGRATION.md` | 13/23 hashes disagree with disk |
| C6 | `design/incubator/microevent_library/SYSTEMS_AUDIT.md` | Fix `salvage.strip` to name `src/data/salvageActions.js` (`actionForWreck`) and `src/systems/salvageActions.js:33` (`salvagePool`) | Only CAPABILITY row with `first15` exposure |
| C7 | same | Drop the `.slot` suffix from `sectorZones.slot`; point slot vocabulary at `src/data/sectorActivityPockets.js` | Suffix names nothing |
| C8 | same | Relabel `comms.ambientToast` → `comms.ambientLine`, cite `comms.js:229` / `comms:popup` | Module is right, presentation name is wrong |
| C9 | `design/incubator/microevent_library/build-microevent-bible.mjs` | Assert `standard === 18` and `blocked === 5`, or stop calling the tier math "validator-enforced" | Two of four numbers are emergent |
| C10 | `src/vfxnext/core/lights.js` | Stop toggling `.visible`; flash via intensity only, matching `vfx.js:9346-9349` | Latent multi-second-stall hazard |
| C11 | `src/vfxnext/core/lights.js` | Scale `peak` by `stage.intensity` at spawn/update | Reduced-flash currently misses the brightest element |
| C12 | `design/vfx/VFX_NEXT.md` | Add a §7 entry naming `velocityLanguage.js` as the sanctioned speed-language owner and marking `speed_extreme` non-promotable | Owner is never named |
| C13 | `assets/incubator/npc_activity_pack/INTEGRATION.md` | Record the `customs_cutter` hostile-archetype collision and the `presentationRole`-keyed map constraint | Both are promotion blockers discovered outside the pack |

C10 and C11 are the only ones touching `src/`. `src/vfxnext/**` had a live writer during this audit
(`e776bf11` landed mid-session), so they must be claimed, not applied opportunistically.

---

## 4. The Ceres Wave-1 selection ledger

Scope rule: an asset earns a row only if the **four existing pockets and nine authored identities**
need it. Everything else defers. Counts obey the program's caps (3–4 NPC families, 10–16 props,
4–6 first-wave events).

### 4.1 NPC occupational families — 4 selected of 12

| Pick | GLB | Pocket served | Wiring note |
|---|---|---|---|
| Ore barge | `ore_barge.glb` | Working Seam → Refinery | **Blocked** — needs `presentationRole: 'ore_carrier'` + both map keys + a `TRAFFIC_ROLES` entry, or it silently reads as "Cargo Hauler" (§2.1a) |
| Repair tender | `repair_tender.glb` | Refinery Pocket | Tender is spawned by `factionPresence.js`, not `traffic.js` — different wiring path |
| Salvage cutter | `salvage_cutter.glb` | Cathedral Grave | Closes the "salvor renders on the miner hull" read |
| Survey pin | `survey_pin.glb` | Working Seam | Carries a **direct** −3.288 m fiction-vs-measured delta; reconcile first |

DEFER: `ore_barge_b`, `yard_tug`, `prospector_skiff`, `scrap_sweeper`, `rescue_lifter`,
`liner_shuttle`, `volatiles_tanker`(+`_b`). REJECT: `construction_rig`, `salvage_cutter_damaged`.
DEFER-with-cause: `customs_cutter` (§2.1b).

### 4.2 Everyday Space props — 16 selected of 46

All 16 fall **outside** the 19 REVISE-first list. All 16 still need revision (§2.2).

*Refinery Pocket (6):* `cargo_pod_standard`, `container_rack`, `freight_platform`, `transfer_arm`,
`radiator_bank`, `slurry_tank`
*Working Seam (4):* `drill_platform`, `conveyor_truss`, `extraction_mast`, `worklight_tower`
*Ambush Run (3):* `transponder_gate`, `interdiction_buoy`, `sensor_mast`
*Cathedral Grave (3):* `scrap_cage`, `improvised_dock`, `maintenance_gantry`

PROXY ONLY (blockout rehearsal, never ships): `drill_platform_cold`, `container_rack_abandoned`.
REJECT (20) headed by `crusher_module` (§2.2). DEFER (19).

### 4.3 Wreck & aftermath — 7 selected of 37

Ceres has exactly **two** anonymous wreck-visual object slots — `ceres_ambush_bait_wreck`
(→ `place_dead_hulk`, 65.5 m) and `ceres_cathedral_grave_shard` (→ `place_debris_chunk`, 30.8 m) —
plus the 704 m Wreck Cathedral, which is a hero site under `PQ-018` and **not** available to this pack.
Selection is sized to those two slots and their immediate dressing, nothing more.

REAUTHOR: `wreck_ore_freighter_hopper`, `deb_ore_freighter_hopper_lid`, `wreck_liner_bow`,
`wreck_liner_boatbay`, `deb_liner_hull_panel`, `aft_armor_slab`, `frag_grating_sheet`.
PROXY ONLY: `wreck_liner_drum__derelict`. REJECT 10 (the corvette family entire — its plated-monocoque
fiction carries the `military`/restricted-salvage law, which Ceres does not have — plus the oversized
freighter bow set). DEFER 19.

**The three unbuilt hulls (barge, survey ship, carrier) stay unbuilt.** `PROMPT_AUDIT.md:161` rules a
six-family wreck program out of the reference-sector chunk, and the existence of a half-finished one
reinforces that ruling rather than overturning it.

### 4.4 VFX — 5 recipes ported, 0 code promoted

Nothing from `src/vfxnext/` ships as code. What ships is the **recipe** re-implemented against the
live owner's existing pools.

| Ceres cue | Disposition |
|---|---|
| mining/work state · cargo transfer · repair/service | **KEEP LIVE** — no vfxnext family exists; already owned by `npcJobSignatureVfx.js` |
| `impact_concussion`, `destruction_light`, `massline_latch`, `massline_tension`, `massline_release` | **PORT THE RECIPE** into `src/render/vfx.js` against its pools; discard vfxnext's LightPool and call `_flashLight()` |
| `explosion_heavy`, `thruster_boost`, `field_attractor`, `field_repulsor` | **PROXY ONLY** — single-emitter or over-budget; keep as lab spec |
| `speed_extreme` | **REJECT** — contradicts `velocityLanguage.js`, allowance already spent (§2.5) |
| `reentry` | **REJECT** — Ceres has no re-entry |
| `impact_normal` | DEFER |

Light budget, corrected: `EVENT_LIGHT_POOL_SIZE = 6`, and the player plume holds one slot **only while
active** — `vfx.js:9382-9384` restores all six when it sleeps. Transient headroom is 5 with the plume
live, 6 without. Not "permanently 5."

### 4.5 Microevents — 6 of 58

Chosen because each rides machinery `traffic.js` already runs: it assigns real `npcJobs` to authored
Ceres slots from their route marks (`traffic.js:613-636`) and stamps a real cargo manifest on the
refinery hauler. The causal spine is a **retarget, not a build**.

| Order | Event | Chain position |
|---|---|---|
| 1 | `ev_rich_seam_strike` | **KEEP LIVE** — already expressible; miner works seam |
| 2 | `ev_miner_calls_hauler` | recoverable cargo exists → hauler moves it |
| 3 | `ev_patrol_scans_suspect` | route becomes a criminal opportunity |
| 4 | `ev_disabled_hauler_recovery` | disruption → service response |
| 5 | `ev_tender_services_miner` | second visible service loop |
| 6 | `ev_cutter_strips_wreck` | aftermath remains |

Cap concurrent authored events at **two**, per the program. Ordinary jobs, traffic and combat stay
live around them.

---

## 5. What this ledger deliberately does not do

- **No bulk promotion.** 98 incubator GLBs exist; 27 are selected; 27 is already ambitious given that
  every one needs four production states, LODs, collision and G0–G7.
- **No new wreck families.** Three unbuilt hulls stay unbuilt.
- **No VFX code promotion.** Recipes only.
- **No new landmark.** Ceres already has refinery, Throughline, Cinder Sluice and Cathedral.
- **No runner beyond a choreography timer.** If the six events need a policy layer, stop and report.

---

## 6. Ordering

Selection does not authorize production. The blocking sequence is in
[`ADMISSION_ROUTE.md`](./ADMISSION_ROUTE.md), and the reason it blocks is in
[`WAVE0_CERES_BASELINE.md`](./WAVE0_CERES_BASELINE.md): **the current choreography has defects that
no amount of new art repairs.** Promoting 27 assets onto actors that work in empty space beside the
objects they name would produce a more expensive version of the same problem.

Fix the choreography, re-run the route, *then* spend the art.

---

## 7. Findings that did not survive verification

Recorded because a retracted finding is more useful than a silently dropped one.

| Retracted claim | What is actually true |
|---|---|
| "PR #91's docs are stale and partly wrong" (4 defects) | **0 of 4 survive as blocking.** All 14 sampled facts verify verbatim. The package is executable as written; `REFERENCE_SECTOR_VALUE_HARVEST_PROMPT.md:27` already orders HEAD re-verification. Only real edit: `PROMPT_AUDIT.md:247`'s enumeration omits `src/vfxnext` |
| "R5 cannot be admitted — ids are constrained to `/^PQ-\d{3}$/`" | The regex constrains only the id token. Rows carry `canonical`/`aliases` arrays and existing rows already use them (PQ-020 `aliases:['SF-21']`, `canonical:['W07'…]`). R5 is admissible today as **PQ-045 with `aliases:['R5']`** |
| "The 9-actor census is a lie" | The 9-identity / 8-visible split is **declared design**, enforced in three places (`sectorActivityPockets.js:420`, `:454`, `ceresFiveMinuteAcceptance.mjs:179-185`). What survives is a minor internal tension about what "pocket" means for the service slot |
| "Refinery tender and seam surveyor are visually identical in the slice" | The tender is filtered out of the traffic cast (`traffic.js:162-165`), so the pair never co-exists there. The **broader** defect is real and worse: four `TRAFFIC_ROLES` (smuggler, rescue, surveyor, tender) all resolve to `hull_multirole.glb` in ordinary traffic **everywhere** |
| "`comms.ambientToast` sends integrators hunting" (major) | The module is correct and the API is live. Only the presentation name is wrong. Minor |
| "vfxnext's LightPool non-portability is undocumented" | It **is** documented, in `lights.js:9-12`. The real defect is different and worse — the `.visible` toggle (§2.5) |
| "Service hauler stages 1550.8 WU from its pocket (9.4× the band)" | Measured from the wrong origin. Correct: **2258.65 WU, 13.7×**. The finding gets worse, the arithmetic was wrong |
| "Salvor and shard can never both be in frame" | The bands are forward *depth*, not a co-visibility diameter. Two points 173.7 WU apart can share a frame. The gap is real; the inference was not |

---

## 8. References

- [`WAVE0_CERES_BASELINE.md`](./WAVE0_CERES_BASELINE.md) — current-state ground truth and defect list
- [`ADMISSION_ROUTE.md`](./ADMISSION_ROUTE.md) — the exact program-control steps
- [`SECTOR_IDENTITY_SHEETS.md`](./SECTOR_IDENTITY_SHEETS.md) — gated propagation design
- [`CANONICAL_BUILD_MAP.md`](../../CANONICAL_BUILD_MAP.md) · [`NOW.md`](../program/NOW.md)
- [`CAMERA_VISIBLE_BUBBLE.md`](../graphics-sprints/CAMERA_VISIBLE_BUBBLE.md) — the 0–95 / 95–125 / 125–165 WU bands
