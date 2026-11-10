# PQ-022 — Gold Corridor required-asset set: scoping and reconciliation

```yaml
parent: PQ-022
leafId: PQ-022.gold-corridor-required-assets
documentKind: scoping_report
claim: none
milestoneAccepted: false
baseCommit: b6b6422d
branch: claude/pq022-corridor-assets-20260728
careers: [hauler, hunter, prospector]
sectors: [sector_helios_prime, sector_ceres_belt, sector_tethys_junction]
requiredAssetCount: 72
gate: npm run check:pq022:corridor-assets
gateResult: PASS (11 named gaps, 0 unexpected, 0 stale)
assetMutations: none
gameplaySourceMutations: none
```

**This is a scoping report, not a milestone receipt.** It defines the required-asset set, reconciles
it against reality, and recommends a completion path. It claims no acceptance for any asset and does
not promote PQ-022. The controller owns the milestone decision.

---

## 1. Method and inclusion rule

**Corridor.** The union of the three Gold Corridor sectors. All three careers traverse all three:
the career origin contracts route every career through `station_helios`, `sector_ceres_belt`, and
`sector_tethys_junction` (`src/careers/origins/careerOriginContracts.js:66-129`).

**Career divergence is small, and that is a finding rather than a shortcut.** All three careers share
one starting hull — `STARTER_BUILDS` pins every career to `NEW_GAME.shipId` (`ship_kestrel`) and
varies only the fitted role-kit module. The visual set therefore diverges through *encounter
exposure* (hunter → combat archetypes, prospector → asteroid geology, hauler → lanes and stations),
not through hulls. The required set is the union across careers; no career has a private asset.

**Inclusion rule — routed, not merely present.** An asset is required when some live data table
places or selects it inside a corridor sector, or the runtime is fail-closed on it. Assets that exist
in the library but are deliberately unrouted are excluded *with a recorded reason* rather than
silently omitted; 13 such exclusions are listed in `EXCLUDED_WITH_REASON`.

**Horizon.** Rows are tagged `30` or `90`. `30` is claimed only where the corridor's own definition
forces it (Helios start, first dock, first asteroid field). Everything else defaults to `90`. We do
not model precisely what a 30-minute player reaches — that is unknowable without PQ-025 pilot data.

**Where the set lives.** `scripts/lib/pq022CorridorAssetSet.mjs`. It is data, not prose, so the gate
can re-derive it. It is not a second registry: it carries no paths or hashes, only the membership
claim and the derivation evidence. `parts_manifest.json` and `release_manifest.json` remain the
identity authority.

---

## 2. Required-set enumeration — 72 assets

| Family | Count | Derivation |
|---|---|---|
| `place-station` | 4 | machine — `SECTOR_ANCHORS.<sector>.stations[].archetypeGlb` |
| `place-infrastructure` | 7 | machine — anchors, world-site stages, PQ-019 facilities |
| `place-wreck` | 2 | machine — `SECTOR_ANCHORS.<sector>.pois[].landmarkGlb` |
| `place-geology` | 2 | machine — field type → `ASTEROIDS[].authoredPlaceId` |
| `place-landmark` | 1 | machine — `WORLD_SITE_MANIFESTS` (Ceres) |
| `place-interior` | 1 | traced — `src/ui/shipPreviewMount.js:52` |
| `wholeship-player` | 3 | traced — fail-closed player hull + LOD catalogue |
| `wholeship-production` | 3 | traced — `requiresProductionWholeShip` on `ship_wasp` |
| `wholeship-hostile` | 3 | traced — `WHOLE_SHIP_FILE_BY_HOSTILE_ID` |
| `wholeship-traffic` | 3 | traced — `WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE` |
| `modular-hull` | 10 | traced — seeded pick over the regular-hull slot |
| `modular-*` (cockpit/engine/fin/weapon/greeble/gear/pod) | 33 | traced — seeded pick per slot |

**13 assets are at horizon 30**; 59 default to 90.

### Derivations worth recording explicitly

**Asteroid geology is GLB-backed, and only one rock per field carries it.**
`world.js:1158` maps a field's `type` to `ASTEROIDS[].authoredPlaceId`, and `world.js:1127` passes it
only when `i === 0` — so each field's *first* asteroid is the authored skin and the rest are
procedural. Corridor consequence: `place_asteroid_seamed` leads 4 of the 6 corridor fields
(`ast_common_rock`), and `place_asteroid_rock_a` leads the two Ceres metallic fields plus the
`poi_claim_rookery` claimable body. **`place_asteroid_rock_b` and `_c` are NOT on the corridor** —
they bind to `ast_icy` / `ast_crystalline`, which no corridor sector declares as a field type. Two of
the three "awaiting re-authoring" rocks are therefore out of scope for this milestone.

**The player hull is fail-closed, not a silent modular fallback.**
`isPlayerKestrel` → `requiresProductionWholeShip` → `requiredWholeShip: true` →
`resolveRequiredWholeShipRecord`, which **throws** when the record is absent
(`partsLibrary.js:516`). `authoredPreloadPlanForEntity` returns `{hull:[whole.file]}` in that case,
so the modular parts are not even preloaded. Any prior note describing the Kestrel as "wired but
falling back to modular assembly" is stale and should not be carried forward.

**Hostile and traffic whole-ships are selected unconditionally.**
`wholeShipVisualForEntity` resolves `lootTableId` and `trafficRole` *before* the
`options.requiredWholeShip` guard (`partsLibrary.js:473-492`). Ambient traffic and combat archetypes
therefore always render authored bodies, never modular ones.

**Whole-ship LOD families are catalogued but runtime-unreachable.**
`lodFamily` is written at `partsLibrary.js:499` and has **zero consumers**. The only other reference
is `WHOLE_SHIP_URLS`, used by the whole-ship body validator and by the filter that *excludes* those
files from modular hull selection (`partsLibrary.js:2548`). LOD0 is canonical live truth, exactly as
the source comment states. This is what demotes the four missing LOD manifest rows from blockers to
dormant-identity gaps.

**The modular slots are a genuine family requirement.**
`authoredPreloadPlanForEntity` picks cockpit/engine/fin/weapon/pod/gear/greeble uniformly from the
contract slot by entity-id hash, so *every* file in those slots is reachable by ordinary corridor
traffic (the express, smuggler, rescue and pirate roles have no whole-ship). Hulls are enumerated as
the full ten-file regular-hull slot because an unmapped `defId` falls back to a uniform pick over all
ten. These are enumerated as families rather than per-entity.

---

## 3. Reconciliation

**Read `never-touched` correctly.** PQ-022's own text says the parent completes when its *named
representative families* are individually accepted, and explicitly warns that one accepted subslice
does not complete the parent. `never-touched` on a modular greeble is the expected steady state, not
a defect. The 61 count below is a map of where acceptance evidence does and does not exist — it is
not 61 blockers.

### Acceptance status

| Status | Count | Meaning |
|---|---|---|
| `accepted` | **0** | No corridor asset has a closed independent visual verdict. |
| `focused-green` | 4 | Structural/headless proofs closed; headed verdict not claimed. |
| `offline-checkpoint` | 6 | Offline source/release checkpoint integrated; blocked at live G5/G6/G7. |
| `awaiting-re-authoring` | 1 | Artifact known-inadequate and named for re-authoring. |
| `never-touched` | 61 | No leaf has ever claimed it. |

`focused-green`: `place_lane_beacon` (PQ-020), `place_claim_outpost_relay` (PQ-022 relay-collar leaf),
`place_landmark_wreck_cathedral` (PQ-018), `pod_cargo_container` (PQ-019A).
`offline-checkpoint`: `place_debris_chunk`, `place_dead_hulk`, `place_dock_interior`, `kestrel`,
`kestrel_lod1`, `kestrel_lod2`.
`awaiting-re-authoring`: `place_asteroid_rock_a`.

### Manifest and hash binding

**67 of 72** assets have a source manifest row, a release manifest row, and sha256 values recomputed
from the bytes on disk that bind to the manifest. The five exceptions:

| Asset | Source row | Release row | Hashes bind | Reading |
|---|---|---|---|---|
| `place_asteroid_rock_a` | yes | yes | **no** | On-disk source is a different artifact from the one both manifests describe. |
| `kestrel_lod1` | **no** | yes | yes | Release side hash-bound; source catalogue asymmetric. |
| `kestrel_lod2` | **no** | yes | yes | Same. |
| `wasp_production_v1_lod1` | **no** | **no** | n/a | Named by the runtime LOD table, in neither manifest. |
| `wasp_production_v1_lod2` | **no** | **no** | n/a | Same. |

The third hash authority — `src/data/worldSiteAssetBindings.js`, which duplicates source and release
hashes for four place ids — **agrees with the release manifest on all four**. No drift between the
duplicated copies.

### Known open issues, with owner lanes

| Issue | Assets | Owner lane | Class |
|---|---|---|---|
| `place_asteroid_rock_a` source provenance broken | 1 | visual production lane (NOW.md: not yet started) | **HARD** |
| Awaiting re-authoring | `place_asteroid_rock_a` (only; `_b`/`_c` are off-corridor) | visual production lane | **HARD** |
| Blocked at G5/G6/G7 after offline keep | `place_debris_chunk`, `place_dead_hulk`, `place_dock_interior` | primary-checkout remaster, behind PQ-034 | verdict-pending |
| Runtime G5/G6 open after offline keep | `kestrel` + 2 LODs | Kestrel material-truth remediation, behind PQ-034 | verdict-pending |
| Relay reads as generic grey primitives | `place_claim_outpost_relay` | PQ-022.exterior-relay-collar, behind PQ-034 | verdict-pending |
| Cathedral Phase 4 headed set | `place_landmark_wreck_cathedral` | PQ-018 (relocated into PQ-020's route) | verdict-pending |
| Superseded live pair; V2 deliberately unwired | `ashline_dart/lode/rig` | Ashline V2 lane, promotion behind PQ-034 | verdict-pending |
| Modular hull texture-role repair offline-only | 10 `hull_*` | modular-hull texture-role correction | verdict-pending |
| Unrecorded identity on dormant LOD artifacts | 4 LOD files | Kestrel lane / **unowned** for the Wasp LODs | moderate |
| `parts_manifest.bytes` metadata drift | `place_lane_beacon`, `place_nav_buoy`, `place_station_billboard` | unowned; fold into any asset-manifest holder | low |

**Correction to a carried-forward belief.** The Ashline V2 row concerns
`ashline_dart/lode/rig` only. `pelican` is *not* a broken whole-ship: it is deliberately absent from
`WHOLE_SHIP_FILE_BY_DEF_ID` because `partsLibrary` wires only production-validated complete bodies,
so `ship_pelican` renders modular by design. `wasp.glb` is superseded by `wasp_production_v1.glb`.
Both are recorded exclusions, not gaps.

---

## 4. Machine gate

`scripts/check-pq022-corridor-assets.mjs`, aliased as `npm run check:pq022:corridor-assets`.
**Deliberately not wired into `check:baseline`** — it is the milestone's standing gate, not a fast-gate
link. One `package.json` line, added after the direct command passed.

Per asset it proves: source manifest row exists, release manifest row exists, both artifacts exist on
disk, and sha256 recomputed from the bytes binds to the manifest row. It additionally crosses
`worldSiteAssetBindings` against the release manifest.

**The standing-gate property — the part of this deliverable with the longest half-life.** The gate
re-derives the machine-derivable membership from the live data modules
(`sectorAnchors`, `sectors`, `mining`, `claimableBodies`, `heistFacilities`, `worldSiteManifests`)
and from the live `PART_LIBRARY_CONTRACT`, then diffs against the static set **in both directions**.
Adding a POI to Ceres, or editing a contract slot, fails this gate until the required set is updated.
The set cannot rot silently. `test/pq022-corridor-asset-set-contract.test.mjs` proves this by
injecting a synthetic corridor POI and asserting it is caught as drift.

**Expected-gaps allowlist.** `--expected-gaps=<file>` lets the gate be green-with-named-gaps until
completion. It is strict in three ways, or it becomes a graveyard: entries are exact
(`assetId` + gap kind) with **no wildcards**; any gap *not* allowlisted fails; and any allowlisted gap
that **no longer reproduces** also fails, telling the reader to delete the entry. All three properties
are covered by tests.

**The original scoping leaf deliberately did not build admission probing.** No cheap importable
admission predicate existed in the static checks, and the `browser-gpu` lease was held elsewhere.
Phase H1 later added a registered, one-use presentation cell without turning this static census into a
second runtime registry; the shipped world, traffic, renderer, loader, and admission owners remain
authoritative.

### Original scoping gate results

```
[pq022] required : 72 assets (17 machine-derived places, 13 recorded exclusions)
        binding  : 67/72 assets have source row + release row + on-disk hashes that bind
[pq022] PASS — 11 gap(s), all named in the allowlist, none stale.
```

Bare run (no allowlist) failed with 11 unexpected gaps in the original scoping run — that was the
intended behaviour and the finding. The 11 gaps were 4 `source-manifest-row-missing`, 2
`release-manifest-row-missing`, 4 `source-bytes-mismatch`, and 1 `source-hash-mismatch`.

### Phase H1 headed presentation update — 2026-07-29

H1 Row 7 ran the registered `pq022-corridor-asset-leaves` manifest at fixed seed `47` and **passed on
its first and only headed Browser launch** (`browser=1`, `electron=0`). The durable record is
[row7-pq022-asset-leaves](../evidence/h1/row7-pq022-asset-leaves/EVIDENCE.md).

The cell admitted and photographed these exact release identities through the production renderer:

- four station archetypes — `place_station_trade_hub`, `place_station_military`,
  `place_station_refinery`, `place_station_mining`;
- three lane-furniture identities — `place_gate_jump_ring`, `place_station_billboard`,
  `place_nav_buoy`;
- three traffic whole-ships — `wholeship_helios_lark`, `wholeship_helios_span`,
  `wholeship_helios_cradle`;
- the relay collar — `place_claim_outpost_relay`, at close/default/far framing on a live asteroid.

All thirteen still records report ready authored admission from release artifacts with no readable
fallback. Station/furniture travel was compressed through the registered `world.enterSector` owner,
so this is presentation evidence rather than inter-sector route-completion evidence. The traffic
roles were selected deterministically while `makeShipEntitySpec`, traffic durable identity and cargo
manifest assignment, `wholeShipVisualForEntity`, rendering, and admission stayed production-owned.
`distributionClaim: false`: the fixture proves exact role-to-hull paths, not random ambient-role
frequency.

The standing gate immediately before claim issue now reports **9 named allowlisted gaps, none stale**.
The original `place_asteroid_rock_a` source-provenance gap no longer reproduces. The remaining
source-byte metadata gaps include `place_lane_beacon`, `place_nav_buoy`, and
`place_station_billboard`; the latter two stills bind live source bytes and release-manifest identity,
but H1 does not pretend their stale `parts_manifest` byte fields are synchronized.

Open boundaries after H1:

- [x] exact headed presentation for the four stations, three lane-furniture identities, three traffic
      whole-ships, and relay collar;
- [ ] relay accept-versus-re-author verdict — intentionally one of the six H2 decisions;
- [ ] broader PQ-022 leaf/parent closure; stations, furniture, and traffic do not receive extra H2
      decision headings in this batch;
- [ ] matched performance and resource/cleanup evidence — Phase H3 only. No H1 timing field is
      evidence.

---

## 5. Completion plan

### Historical HARD milestone blocker — resolved before H1

**At the original scoping pin, `place_asteroid_rock_a` had broken source provenance and was named for
re-authoring.** The Phase H1 pre-claim gate no longer reproduces that gap; this paragraph is retained
to explain the original completion plan, not to report a current blocker.

- *What is missing:* the on-disk source GLB (9,118,128 bytes,
  `fd08251e…`) is a different artifact from the one both manifests describe (1,970,132 bytes,
  `e9997140…`). The **release** artifact's hash still binds to its manifest row, so release identity
  is intact and the asset is not absent from the route — but the release provably **cannot be
  reproduced from the recorded source**, because the recorded source is not the file on disk. This is
  also the exact assertion that makes `check:graphics:asset-receipts` red today.
- *Fix:* re-author the rock (already named in NOW.md), then rebuild source + release together and
  update all three catalogues — `parts_manifest.json`, `release_manifest.json`, and the
  `check-graphics-asset-receipts.mjs` receipt.
- *Mutex:* Blender + asset-manifest. Both currently free.
- *Blast radius:* one place GLB pair, three manifest/receipt rows. Two Ceres fields and one claim
  site. No runtime code.
- *Historical verdict:* blocked the milestone at this pin. Current H1 gate: resolved; no longer among
  the nine allowlisted gaps.

### Verdict-pending — headed evidence partially captured; human/H3 closure remains

H1 Row 7 now supplies admitted game-camera stills for `place_claim_outpost_relay`, the four corridor
stations, the jump ring/billboard/nav-buoy furniture set, and the Lark/Span/Cradle traffic set. The
relay still needs H2 Decision 1; the other three groups are supporting PQ-022 evidence and do not add
standalone decisions to the six-decision H2 agenda.

Other named graphics leaves — `place_debris_chunk`, `place_dead_hulk`, `place_dock_interior`,
`kestrel` (+2 LODs), `place_landmark_wreck_cathedral`, `pod_cargo_container`,
`place_lane_beacon`, the 10 modular hulls, and `ashline_dart/lode/rig` — retain their own receipt and
owner-lane boundaries. Matched performance for every group remains Phase H3.

### Moderate and low — bounded, non-blocking

- **4 LOD manifest rows** (`kestrel_lod1/2` source-side; `wasp_production_v1_lod1/2` both sides).
  *Fix:* add manifest rows for artifacts that already exist. *Mutex:* asset-manifest. *Radius:* four
  rows. The Wasp LODs are **unowned** — no lane has ever claimed that family.
- **3 `parts_manifest.bytes` drifts** (`place_lane_beacon`, `place_nav_buoy`,
  `place_station_billboard`). Release manifest binds in every case, so identity is sound and only the
  byte metadata is stale (~2 KB each). *Fix:* one metadata refresh. *Radius:* three integer fields.

---

## 6. Recommendation — the minimal leaf set to reach `milestone_accepted`

PQ-025's entry condition is that *"PQ-022 required leaves have integrated receipts."* This document
defines what "required leaves" means. The minimal set is **this scoping receipt plus four named
leaves** — grouped by mutex so the list is dispatchable rather than a wish:

| Leaf | Assets | Mutex | Why it is minimal |
|---|---|---|---|
| `PQ-022.ceres-geology-rock-a` | `place_asteroid_rock_a` | Blender + asset-manifest (free) | The only HARD blocker. Also clears the standing `check:graphics:asset-receipts` red. |
| `PQ-022.corridor-station-identity` | `place_station_trade_hub`, `place_station_refinery`, `place_station_military`, `place_station_mining` | asset-manifest | The first dock on every career route, never judged by any leaf. Four stations, one family, one review. |
| `PQ-022.corridor-lane-furniture` | `place_gate_jump_ring`, `place_station_billboard`, `place_nav_buoy` | asset-manifest | `place_gate_jump_ring` has 13 corridor instances — the highest count of any asset — and every inter-sector transition shows it. Folds in the two low-severity byte drifts. |
| `PQ-022.corridor-traffic-bodies` | `helios_lark`, `helios_span`, `helios_cradle` | asset-manifest | Ambient traffic is present from minute one; `hauler` is the highest-weight role in the game (30). |

Rationale for the cut: of the 13 horizon-30 assets, 7 are already claimed by an existing lane and are
verdict-pending behind PQ-034 — those must **not** be re-opened. The remaining 6 never-touched
horizon-30 assets are covered by the three identity leaves above, and `place_asteroid_seamed` (which
leads 4 of 6 corridor fields) should be folded into whichever geology leaf runs, since it shares the
rock-a lane's Blender mutex.

Everything at horizon 90 that is `never-touched` — the 33 modular parts and 10 modular hulls — is
explicitly **out** of the minimal set. PQ-022's parent contract does not require every family, and
these are crowd assets whose screen-space class does not justify blocking a milestone.

**Sequencing update.** The rock-a provenance gap no longer reproduces, and H1 Row 7 has supplied the
headed admitted still set for the three identity groups. That does not silently promote them to
`milestone_accepted`: retain the exact Row 7 evidence, take the single relay visual verdict in H2,
close any broader leaf/parent evidence requirements explicitly, then run matched performance in H3.

---

## 7. Gates run

| Gate | Result |
|---|---|
| `node --check` on all three new files | clean |
| `node --test test/pq022-corridor-asset-set-contract.test.mjs` | **15/15 pass** |
| `npm run check:pq022:corridor-assets` | **PASS** — 11 named gaps, 0 unexpected, 0 stale |
| `node scripts/check-pq022-corridor-assets.mjs` (bare) | FAIL, 11 unexpected — intended; this is the finding |
| `npm run check:sim:compare` | ok, `hashEqual: true`, `firstDivergentTick: null` |
| `git status --short` | clean |

**Honest reading of `check:sim:compare`.** It reports `hashEqual` between the uninterrupted and
reload runs. Per `NOW.md`, this gate returns ok whenever the two runs agree *with each other* and
explicitly tolerates a stale `expectedHash` — it is a determinism check wearing a correctness check's
name. The actual evidence that no gameplay changed here is the **diff scope**: this branch touches
only `scripts/`, `test/`, one `package.json` line, and this receipt. No gameplay source, no asset, no
manifest was modified.

At the original scoping pin, `check:graphics:asset-receipts` was red at
`place_asteroid_rock_a`; this leaf reported the finding and did not repair it. The later H1 standing
gate no longer reproduces that source-provenance gap, consistent with an upstream owner-lane repair.

---

## 8. Scope discipline

The original scoping leaf performed no asset authoring, Blender work, GLB/manifest mutation, broker
execution, Electron run, performance capture, or gameplay-source change. The later H1 addendum adds
only a registered Browser presentation harness, static contract, durable evidence, and receipt links.
It still performs no asset/gameplay mutation and introduces no runtime asset registry. Known corpus
bookkeeping gaps remain named and unfixed; all time-valued broker metadata is informational/contended,
not performance evidence.

## 9. Write set

```text
scripts/lib/pq022CorridorAssetSet.mjs          new — the required set as data + live re-derivation
scripts/lib/pq022CorridorExpectedGaps.json     new — the exact, non-wildcard expected-gaps allowlist
scripts/check-pq022-corridor-assets.mjs        new — the standing gate
test/pq022-corridor-asset-set-contract.test.mjs new — 15 contracts incl. anti-rot properties
package.json                                   +1 line — check:pq022:corridor-assets
design/program/roadmap/receipts/PQ-022-gold-corridor-required-assets-SCOPING.md  this report
```
