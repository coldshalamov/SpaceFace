<!-- LIFETIME: DURABLE -->
# SpaceFace Build Map — done ledger

Completed and historical sections, moved out of build_map.md on 2026-09-09 so the front door stays a todo board. Headings keep the section numbers they held there. Nothing here dispatches work; reviews read this file.

When a unit or campaign closes, move its entry here from build_map.md: keep the heading, add the landed commit and the receipt path, and one sentence on what it cost.

---

### 1B.1 Retained campaign laws (verbatim from the previous front door)

**PQ-050 campaign law:** Hitch/Kestrel stays frozen. Stay off INFERENCE, the
dock/hulk remaster, and the expansion-research brief. A live copy is not a
quality-close.

**The player camera is the only close camera.** SpaceFace is a 60° tilted
top-down chase (`src/render/camera.js`, default 144 WU, tightest legal zoom
58 WU). Capture cycle stills with
[`tools/blender/spaceface_chase_camera.py`](./tools/blender/spaceface_chase_camera.py).
How to chunk one ship, when to generate reference (or call Codex for imagen), and
how hidden glued-on faces get handled by the computer:
[`docs/visual-assets/FLYABLE_SHIP_WORKFLOW.md`](./docs/visual-assets/FLYABLE_SHIP_WORKFLOW.md).
Studio three-quarter, starboard beauty, rear hero, and `bay_interior` crops
do not count. Seats, consoles, and walkable cabins that only exist in a crop
are not remaster work. That is why the Hornet loop stopped: many cycles, little
change the chase camera could see.

- **Hornet (`PQ-050.01`)** is a **wired candidate, not quality-closed**. Resume
  only as a chase-camera form pass. Do not model another seat.
- **Drifter (`PQ-050.02`)** is a wired pancake-dart. **Not accepted art.** Same
  camera law. After Hornet actually closes at chase size, this is next.
- **Remaining ships** have not had a chase-camera close. Ranger
  (`PQ-050.03`) through Survey pin (`PQ-050.22`). One ship at a time.
- Quality remaining on every unfinished leaf: silhouette, wells, canopy, and
  drive throats that read at 144 WU; lofted wings/nacelles; unique surfaces;
  MTX ledger bound to the close hash with chase-camera proof; five valid
  reviewed chase cycles; then wire only that ship. A factory loft with boxes
  still does not close a leaf. A walkable interior does not close a leaf.
- Do not run the all-fleet promote script. Do not overwrite Hitch.

Remaining PQ-050 leaves (one ship at a time; Hitch/Kestrel frozen):

| Leaf | Ship | This campaign |
|---|---|---|
| `.01` | Hornet | wired candidate, **not quality-closed**. Chase-camera form remaining. An orange seat is not progress. |
| `.02` | Drifter | seven form attempts this campaign (C18–24). Three volumes + ringed throats in candidate. C20 still live. **Not quality-closed.** |
| `.03` | Ranger | not started |
| `.04` | Ironback | not started |
| `.05` | Bastion | not started |
| `.06` | Atlas | not started |
| `.07` | Warden | not started |
| `.08` | Colossus | not started |
| `.09` | Leviathan | not started |
| `.10` | Pelican | not started |
| `.11` | Mule | not started |
| `.12` | Wasp | not started (live production body is already mapped; it still fails the authored loader) |
| `.13`–`.15` | Ashline dart / lode / rig | not started |
| `.16`–`.18` | Helios lark / cradle / span | not started |
| `.19` | Ore barge | not started |
| `.20` | Repair tender | not started |
| `.21` | Salvage cutter | not started |
| `.22` | Survey pin | not started |

**Graphics / place-asset remaster (resume):** if the task is continuing the interrupted remaster of
`place_dock_interior`, `place_dead_hulk`, and/or `place_debris_chunk` (Blender/EEVEE form work, not a
queue packet), start at
[`assets/ships/parts/places/REMASTER_HANDOFF_dock_hulk_debris.md`](./assets/ships/parts/places/REMASTER_HANDOFF_dock_hulk_debris.md)
before touching those GLBs. That handoff owns live residuals, bans, KEEP/RESTORE rules, and player-route
meaning (dock = shipyard UI backdrop; hulk/debris = freeflight landmarks). For ordinary admitted
roadmap work, still use `program-dispatch` above—do not substitute this handoff for a PQ packet.

**Orphan harvest / unused models / leftover `C:\sf-agents` copies:** if the task is to mine
orphaned agent checkouts, finish near-done work, wire unused models that already beat live,
or stop finished work rotting on a side copy, start at
[`design/program/ORPHAN_HARVEST_GOAL.txt`](./design/program/ORPHAN_HARVEST_GOAL.txt)
and follow [`design/program/ORPHAN_HARVEST_PLAYBOOK.md`](./design/program/ORPHAN_HARVEST_PLAYBOOK.md).
The checkpoint is [`ORPHAN_HARVEST_LEDGER.md`](./design/program/ORPHAN_HARVEST_LEDGER.md).
This campaign may rebuild the live Hitch *release* from the later polish that never reached
the compressed file; it still must not overwrite KTX2 with uncompressed source, and it must
not dump factory remasters that lose to Hitch. It is not INFERENCE and not a default PQ-050
overnight.

**3D world-object / same-bar remaster:** if the owner wants models in the world brought up to
the Hitch/Helios chase-camera bar (beacons, pods, 47-A tube+ring, then Hornet skin) without
colliding with hitch work, start at
[`design/program/GRAPHICS_3D_CAMPAIGN.md`](./design/program/GRAPHICS_3D_CAMPAIGN.md)
(operator: [`GRAPHICS_3D_GOAL.txt`](./design/program/GRAPHICS_3D_GOAL.txt)). Packaged GLBs
live in `assets/ships/release/release_manifest.json`; live loaders in `partsLibrary.js`;
47-A spindle/beacon/pod are procedural in `src/render/scenarioProps47a.js` and are **not**
in the manifest. Do not edit hitch-owned renderer files. Do not touch Hitch.

**Asteroid Works playfield:** if the owner cannot see the mining board, tell cells
apart, find the rover, move it one cell on purpose — or the screen still looks like
a gray vibe-coded console — start at
[`design/ASTEROID_WORKS_DESIGN_LAW.md`](./design/ASTEROID_WORKS_DESIGN_LAW.md)
(the 2026-08-20 owner design session's positive target: ground-up warm UI, perfect
axis-aligned chess grid, fog of war removed, events on the board with sound, ≤15
visible words, board ≥88% of the glass), then
[`design/program/ASTEROID_WORKS_PLAYFIELD.md`](./design/program/ASTEROID_WORKS_PLAYFIELD.md)
(operator: [`ASTEROID_WORKS_PLAYFIELD_GOAL.txt`](./design/program/ASTEROID_WORKS_PLAYFIELD_GOAL.txt))
and the admitted packet
[`design/program/roadmap/active/PQ-130.md`](./design/program/roadmap/active/PQ-130.md).
Dispatch `node scripts/program-dispatch.mjs --id PQ-130` (leaves `.01`–`.10`). The
2026-08-20 playtest remains the defect list; a polished copy of the gunmetal console
also fails. Chrome idea:
[`design/frontend/SCREENS_E_ASTEROID_WORKS.md`](./design/frontend/SCREENS_E_ASTEROID_WORKS.md).
This is not INFERENCE, not `PQ-050`, not `PQ-129`, and not Waves 1–4.

**Performance hitch campaign:** if the owner reports hitching, stutter, or the game not playing
smoothly, start at
[`design/program/PERF_HITCH_CAMPAIGN.md`](./design/program/PERF_HITCH_CAMPAIGN.md)
and the admitted packet
[`design/program/roadmap/active/PQ-129.md`](./design/program/roadmap/active/PQ-129.md).
This is not INFERENCE and not `PQ-050`. Reserved identities `PQ-061`–`PQ-128` stay the catalog;
`PQ-129` is the executor that finally admits them as leaves. Wave A names every >32 ms frame.
Wave B removes compose/compile/upload/admission bricks. Wave C crowded 60 fps waits until hitch
count is halved. Default quality stays on.

**Flight HUD attention pass:** if the task is the windshield-keys / toast-over-HUD / ship-instrument
work the owner authorized, start at
[`design/HUD_FLIGHT_ATTENTION.md`](./design/HUD_FLIGHT_ATTENTION.md)
(operator: [`design/HUD_FLIGHT_ATTENTION_GOAL.txt`](./design/HUD_FLIGHT_ATTENTION_GOAL.txt)).
That plan owns success criteria, flight order, bans, and process-artifact cleanup. It does not
replace VISION/GDD. Do not revive `HUD_THREE_ANCHOR` or `GEMINI_HUD_BRIEF` as layout law.

**Graphics / non-Hitch flyable fleet remaster:** remaining work to make every player and NPC flyable
ship except Hitch/Kestrel honestly better than live Hitch is admitted as `PQ-050`
(`GFX-FLEET-REMASTER-HITCHPLUS`). Start at
[`design/program/roadmap/active/PQ-050.md`](./design/program/roadmap/active/PQ-050.md), then
`node scripts/program-dispatch.mjs --id PQ-050` or `--next` for the first ready ship. One leaf is
one ship: apply [`docs/visual-assets/ADVANCED_MODEL_TECHNIQUE_CONTRACT.md`](./docs/visual-assets/ADVANCED_MODEL_TECHNIQUE_CONTRACT.md)
(form, unique UVs, mesh bakes, authored surfaces, LOD), fill that ship’s technique ledger, then
wire only that ship. A factory loft with boxes or a tinted shared sheet does not close a leaf.
Do not resume this campaign on studio cameras or cabin interiors. Hornet is a wired candidate
that stalled on seats the chase view cannot see; Drifter is unfinished. One ship at a time.
Do not touch Hitch.

**Graphics / expansion research (A-list parity):** when planning work that spans graphics,
animation, VFX, variety, or world density — as opposed to one admitted asset packet — the durable
research brief is
[`design/program/EXPANSION_PROGRAM.md`](./design/program/EXPANSION_PROGRAM.md). Its §1 records twelve
controlled experiments against one scene and scoring harness; use those results to avoid repeating
the exact disconfirmed hypotheses, not as proof that every renderer or composition axis is closed.
Its §2 records the production loop (research → worldbuild → concept → build → adversarial review)
and §5 records measurement traps that have already cost real time. The repository performance
contract remains [`design/PERF_BUDGET.md`](./design/PERF_BUDGET.md): target-profile p95 ≤16.7 ms,
p99/hitch protection, and no quality reduction; the measured 16.80 ms Intel-iGPU route is an
additional guardrail, never a relaxation. Pair the brief with
[`design/graphics-sprints/GRAPHICS_ORPHAN_CENSUS.md`](./design/graphics-sprints/GRAPHICS_ORPHAN_CENSUS.md),
which preserves a historical plan/literal-source-reference screen and withdrawn-claim evidence.
Refresh its named manifest, bundle, catalog, route, and ownership checks before treating any captured
disposition as current. The current research ranking is
`design/graphics-sprints/TOP10_ROI_ASSET_PLAN.md` (removed 2026-09-08; expired VOLATILE, superseded by the DURABLE ledgers in the same dir; see git history).
It grants no lease, priority, or dispatch authority: implementation still requires an admitted
packet from the queue, and any overlapping Physics-as-Spectacle row remains downstream of that
packet's R5/five-minute-Ceres/R8 gates. Craft and acceptance still belong to
`docs/visual-assets/` below.

**Material flatness (G0-2 is DONE; ROI items 3-5 are part-finished).** The corrected roughness
audit has been run and its tooling is committed. Measure with
`node scripts/measure-orm-roughness.mjs <glb...>` — it resolves ORM maps through the glTF material
graph, never by filename, which is what invalidated the earlier audit. Its reference check:
`engine_ion_small` reads 0.2015 against the independently derived 0.2011.

Measured state, superseding the withdrawn "twenty assets at stdev exactly zero" headline:

| Asset | Roughness stdev | Reading |
|---|---:|---|
| Ten kit hulls (`hull_*.glb`) | **0.0000** | 1024² textures holding one constant |
| `wholeship_kestrel` | 0.05–0.07 | not flat, but ~3x under reference |
| `engine_ion_small` | 0.2015 | healthy — **ROI item 4 is largely a non-issue** |

Root cause for the hulls: the ORM is packed correctly and six hulls carry a real per-material AO
bake in R, matching their authored source PNGs to four decimals. The geometry-derived data was
authored, baked and shipped into the channel that only modulates ambient light, while the channel
deciding specular response got a flat class value. The other four (frigate, capital, multirole,
gunship) had no AO anywhere because each GLB carries LOD0/LOD1/LOD2 as **coincident meshes at
identical bounds**, so the bake self-occluded to black. `tools/blender/bake_hull_ao.py` removes the
coincident shells first; all four are now repaired at source and committed.

**Remaining work — RESOLVED 2026-08-10** (commits `ebebc2d2`, `ceae0456`..`5e494efe` on master):

1. **Repack applied (ROI item 5) — DONE at `ebebc2d2`.** All 29 hull materials left stdev 0.0000,
   landing 0.088–0.172 **proportional to each material's real AO signal** (the earlier "0.15–0.17"
   line was an aggregate approximation; dry-run == apply byte-parity was verified independently).
   Releases republished through `scripts/build-hull-release-assets.mjs` — the canonical hull lane
   (ETC1S color/ORM + UASTC normals, GLBs + `release_manifest.json` in one transaction; 31.77 MiB
   source → 5.65 MiB release). The generic `tools/art/build_release_parts.mjs` named here before
   encodes UASTC-everything (~10x release size) and refreshes no manifest — do not use it for hulls.
2. **Kestrel hull (ROI item 3) — no repack applicable; measured and closed 2026-08-10.** The tool's
   `FLAT_G_STDEV = 0.02` gate correctly skips every Kestrel material (0.049–0.072 — authored
   variation present, not the flat-defect class). Forcing amplification on the hero ship without an
   art verdict was declined. The real remaining Kestrel surface work is the
   `assets/ships/foundry/spacepunk_markings_v1/` integration (32 authored cells,
   `runtimeWired: false`, Blender + KTX2 release work). Live player ship remains
   `assets/ships/parts/wholeships/kestrel.glb`; `kestrel_borrowed_time_v4/` is not loaded.
3. **Receipts coverage extended — DONE at `5e494efe`.** `check:graphics:asset-receipts` now
   verifies manifest-vs-disk SHA/byte truth for all three rocks, the ten hulls, and the live player
   ship, with per-asset diagnostics and a corruption-detection test. On its first run it caught and
   forced repair of twelve stale `parts_manifest.json` rows (rockB/rockC family-source bytes and
   LOD0-only tris; ten pre-repack hull byte counts). Still uncovered, recorded honestly: the ~37
   other release-manifest assets, Kestrel LOD1/LOD2 rows, `stats().bakedTexMB`, and all G1–G7
   visual gates.

No independent G7 art verdict has been obtained for any of the above — the codex image-generation CLI
remains unrepaired (G0-3), and per `docs/visual-assets/README.md` that substitution is recorded here
rather than left implicit.

**Graphics / visual assets:** every player-facing graphics task starts at
[`docs/visual-assets/README.md`](./docs/visual-assets/README.md), which routes authored 3D, portraits,
concept/reference generation, cinematics, VFX, and UI art to their owning quality contract. For
repository-wide asset recovery, then use the current
[`VISUAL_ASSET_CATALOG.md`](./design/graphics-sprints/VISUAL_ASSET_CATALOG.md) to distinguish live
assets from candidates, legacy donors, rejected evidence, and protected foreign work. Any
Blender/GLB form or surfacing pass uses
[`docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md`](./docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md)
and
[`.grok/skills/spaceface-blender-material-truth/SKILL.md`](./.grok/skills/spaceface-blender-material-truth/SKILL.md)
and completes its proportional material-truth preflight before modeling, whether or not a reviewer
has already named a plastic/clay/primitive defect. Tier C/D may group a repeated manufactured family,
but no changed visible zone may inherit a DCC default. Claim
the exact source/candidate paths first. The catalog is routing evidence, not permission to merge old
branches, promote candidates, or bypass G0-G7 acceptance.

**Physics as Spectacle (graphics / VFX / Massline program):** the user-authorized R8 program starts at
[`design/program/roadmap/active/PHYSICS_AS_SPECTACLE_PROGRAM.md`](./design/program/roadmap/active/PHYSICS_AS_SPECTACLE_PROGRAM.md).
Its hierarchy is bright force against colored, materially varied hulls: deep space remains darkest;
world geometry uses varied industrial materials; ships retain strong faction paint and identity;
engines and machinery are bright; Massline, fields, weapons, and destruction are brightest. The
unchanged [`MASSLINE_PRESENTATION_UVP.md`](./design/program/roadmap/active/MASSLINE_PRESENTATION_UVP.md)
is its implemented foundation and focused receipt, not a new route-acceptance claim. Execute the
recovery dependency chain and five-minute Ceres gate before R8 showcase work; only after that
showcase is also accepted, use the active packet for the gated five-cell, asset-promotion, and
technical-finish rollout. Do not rewrite physics, tumble immunity, damage ownership, or renderer
authority.

**Orphaned worktree / branch recovery:** when the explicit task is evaluating stopped-agent work,
harvests, orphan refs, or a corrupt local clone, start at
[`design/program/WORKTREE_RECOVERY.md`](./design/program/WORKTREE_RECOVERY.md). Current master,
accepted receipts, exact manifests, and exact live-path writers outrank the recovered bytes and their
historical prose. The 2026-08-17 closeout of the external `SpaceFace-archives` parking lot is
[`SPACEFACE-ARCHIVES-2026-08-17-REPORT.md`](./design/program/roadmap/receipts/SPACEFACE-ARCHIVES-2026-08-17-REPORT.md).
The 2026-08-08 `_recovery` transaction remains durable in
[`WORKTREE-RECOVERY-2026-08-08-REPORT.md`](./design/program/roadmap/receipts/WORKTREE-RECOVERY-2026-08-08-REPORT.md).
Do not recreate `SpaceFace-archives`. Do not treat repeated exports as separate projects, and do not
keep a safe disjoint unit idle because one exact path has a live writer.

That archives folder hid **no new ship or place**. Unfinished look-dev from it is already admitted:

- Ashline dart / lode / rig → `PQ-050.13`–`PQ-050.15` from current factory bodies and `m4_ashline_v2`.
  Do not restore the rejected July 21 v1 depth polish.
- Helios lark / cradle / span → `PQ-050.16`–`PQ-050.18`. The civilian family on master already
  matches the scratch byte-for-byte.
- Other flyable remasters → remaining `PQ-050` leaves. Hitch stays frozen.
- Stopped-Lark express liner → `PQ-049` (already tracked; not in that folder).
- Dock / hulk / debris → the place remaster handoff above.

Recovery effort uses `XS` (up to 30 minutes), `S` (0.5-2 hours), `M` (2-4 hours), `L` (4-8 hours),
and `XL` (multi-day) only as scheduling metadata. Finish `XS` through `L` in the active recovery
campaign; preserve inputs and defer only a genuinely `XL` authored/cross-owner outcome with an
executable route. `GFX-MASSLINE-EXPRESS-LINER` is now admitted as `PQ-049`; its parent remains
`ready` / `unproven` until its ordered route-acceptance leaf closes:

| Stable route | Size | Required outcome |
|---|---:|---|
| `PQ-049` / `GFX-MASSLINE-EXPRESS-LINER` | `XL`, about 4-8 focused artist-engineer days plus independent review | Adapt the tracked stopped-Lark donor into a **separate** express-only ship through five ordered leaves: fresh DCC/LOD candidate; source/candidate/release/manifests; render package; express-only runtime maps; then Browser/Electron route/tether/save/performance and exact-hash G7. Never replace accepted courier Lark or fold it into the Massline presentation showcase. |
| `PQ-018.cathedral-reauthor` | existing multi-day active packet | Use the current packet for Cathedral DCC/release and exact route/art acceptance. Recovered Cathedral GLBs are rebuild variants, not alternative art, and no standalone PQ-018 broker harness should return. |

`PQ-049` is the admitted execution of `GFX-MASSLINE-EXPRESS-LINER` and executes in this order:

1. **`PQ-049.01` — Freeze identity, preflight, and reauthor; do not rename.** Keep accepted
   `wholeship_helios_lark` and its hashes/runtime maps unchanged. Admit
   `SF_WHOLESHIP_MASSLINE_EXPRESS_LINER_V1` / `wholeship_massline_express_liner_v1` with a
   passenger/drive/service fiction, supported views, component/material bill, and explicit
   tether/dock/service load paths. The two files under
   `assets/ships/massline_express_liner_v1/reference/stopped_lark_iter19/` remain reference-only. Own
   `assets/ships/massline_express_liner_v1/blender/massline_express_liner_v1.blend`, its source GLB,
   bakes, matched-view evidence, and authored LOD0/1/2. Repair macro/meso construction, material
   zones, floating parts, and plastic/clay response before integration work.
2. **`PQ-049.02` — Build and promote.** Produce `wholeships/massline_express_liner_v1.glb` through the normal source,
   candidate, optimized release, source-manifest, generated release-manifest, and conditional
   release transaction. Do not hand-edit generated metadata or borrow the accepted Lark release slot.
3. **`PQ-049.03` — Generate the render package.** Build the conditional
   `assets/ships/release/render-packages/massline-express-liner-v1/` transaction and regenerate its
   runtime table through the sanctioned package pipeline.
4. **`PQ-049.04` — Wire sequentially after current writers release.** Add only the `express` entries in
   `WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE` and `WHOLE_SHIP_ASSET_ID_BY_TRAFFIC_ROLE` in
   `src/render/partsLibrary.js`, consuming the already-generated render-package runtime table. Existing
   `src/systems/traffic.js` express behavior remains authoritative; this is presentation identity, not
   an AI/route rewrite.
5. **`PQ-049.05` — Accept.** Prove Browser and Electron natural express spawn, label, route,
   dock/service context, passenger-only custody with no invented freight manifest, boost, tether
   latch/reel/release, and save/Continue itinerary; run a matched dense-pocket
   and tether-close performance comparison; finish with independent exact-hash G7 and whole-asset
   G1/G2/G4. Any missing gate leaves the mapped asset unproven and non-accepted.

Do not begin from an old handoff, screenshot directory, review transcript, archived plan, raw whole-queue dump, or broad repository grep—**except** the place remaster handoff linked above when that is the explicit task, the massline presentation UVP packet when that is the explicit task, or the tracked worktree-recovery playbook when leftover agent work is the explicit task.


---

### 11.10a What the reviews changed, and what they cost

Four independent design reviews ran against the shipped J3/J5 code and captured frames. They are
recorded here because several findings **generalise to every job below**, and two of them were
defects in the *verification*, not the feature.

**The checks were wrong in the same way the repo has been bitten before — twice, in one session.**

- `check-data-states` asserted a `forced-colors` branch existed by substring, and **matched the
  words in a comment** while the `@media` rule was gone. Its reduced-motion assertion read a
  fixed-size window that **spilled into the next block** and was satisfied by *that* block's rule.
  Both now parse the brace-balanced at-rule with comments stripped.
- It scanned `font-size:` only, so an **11px keycap shipped inside the block whose own comment
  claims a 12px floor**. It reads the `font:` shorthand now too.
- `probe-data-states` captured every frame at ~535px while the live sites render in a **~287px
  inspector column**, and no fixture passed `verb.key`, so the offending keycap was never
  instantiated in any of 12 frames. **The worst case was the common case, and nobody had looked at
  it.** Adding the real column immediately exposed prose wrapping **one character per line** — which
  violated none of the type-floor, clipping or focus measures and reported green.
- `check-screen-memory` had two rules that **passed their own mutation**: an LRU test that a frozen
  clock satisfied by accident, and deny-list keys compound enough that three rules matched each, so
  removing one changed nothing. Both rewritten.

> **The generalised rule, now the standard for every job below: negative-test every rule you write.
> A check that has never been seen to fail is a check you have not written yet.** Four of the
> fourteen rules added this session were too weak to catch the defect they existed to catch, and all
> four were found by mutation, not by reading.

**Findings that change the plans below** are folded into J1, J2, J6–J10 directly. The two worth
stating once, globally:

- **Adoption is the deliverable, not the primitive.** J3 shipped with three EMPTY sites in one tab
  of one screen; LOADING, ERROR and DENIED had zero production consumers. J5 shipped with three
  tagged nouns. A `tagged > 0` check passes both and proves nothing. **Every job below states a
  named minimum adoption set, and its check asserts that set — not a non-zero count.**
  **`check:data-states` and `check:entity-links` do NOT yet do this** — they still fail only on a
  zero/near-zero count. Encoding the named sets is part of finishing each job's adoption pass, not a
  separate task; until then the rule binds J1 onward and those two are explicitly grandfathered.
- **Tier 2 does not exist yet.** `[data-why]` has one match in `src/ui/` and it is a *comment*. The
  disclosure ladder runs 1 → 3 across every surface built so far, and §7 calls tier 2 "the mechanism
  that lets this game be deep without being a spreadsheet." It is cheap — `causeLedger`'s enumerated
  phrase bank is the pattern — and it is now a line item in J2, J6 and J8.

**Also landed from the earlier direction document:** the live-overlay fix (`body.ui-live-screen #hud { opacity: .5 }`) so a non-pausing screen no longer blinds the player, and an `sf-select` primitive. **Adoption is complete** — verified 2026-08-23 by call site, not by reading for `<select>`: all three named files (`galaxyMap.js`, `screens/automationPanel.js`, `screens/starmap.js`) import `enhanceSelects` and call it, which swaps the node in place. The native `<select>` still in the markup is the SOURCE the widget is built from, not a surviving OS dropdown — grepping for the tag reports a false gap.


---

### 11.12 The sequenced jobs (J01 – J16)

Each job states the A-list pattern it borrows, the player outcome, the exact seams, the build steps,
how it is verified, and the traps that will bite. Full narrative in
[`design/frontend/NEXT_JOBS.md`](./design/frontend/NEXT_JOBS.md).

---

#### J01 · The four data states, as a shared primitive — *short* — **LANDED `09111881`, NAMED ADOPTION SET ENCODED `c571c478`**

**Pattern:** the skeleton/empty-state discipline of every shipped consumer app.
**Player outcome:** never a blank screen that is technically correct.

**Shipped:** `dataState` / `dataStateHtml` / `mountDataState` / `settleDataState` in
`src/ui/uiPrimitives.js` + `styles/ui.css` §13. `headline`, `fills` and `verb` are **required and
throw** — optional arguments get omitted, and this decays back into the dead `.sf-empty` with more
ceremony. A **string form** exists because most screens here assemble `innerHTML`; a DOM-only
primitive could not be adopted where the defect lives.

**Named minimum adoption set:** the Chart's market-feed path (ERROR), THE SHIP's hull-resolve gate
(LOADING, replacing `sx-sw__acquiring`), and the station dock-refusal path (DENIED — `dockDeny.js`
already enumerates the reasons).

**Verify:** `check:data-states` (contract, statically) + `probe-data-states` (the capture matrix).

---

#### J02 · Screen state memory — *short* — **LANDED `16067c5e`**

**Pattern:** universal. Invisible when present, infuriating when absent.
**Player outcome:** the map, ship and station open where they were left.

**Shipped:** `src/ui/screenMemory.js`, a bag on `state.ui.screenMemory` persisted per save under
`data.uiScreenMemory` (schema **v13** + migration). Adopted by the Chart for tab, commodity, layer
set and bookmarks; `screenManager` owns scroll generically via `[data-sf-scroll]`.

---

#### J03 · Everything is a link — *medium* — **LANDED `61497eab`, NAMED TAGGING SET ENCODED `c571c478`**

**Pattern:** EVE Online "Show Info", Destiny inspect — every noun is a door.
**Player outcome:** twelve menus stop being twelve menus. Read a contract naming a company → click →
standing, doctrine, territory, your history → click a sector → the Chart opens focused there.

**Shipped:** `src/ui/entityResolver.js` (all eight nouns, `null` for anything unknown) and
`src/ui/entityLinks.js` (delegated handler + tier-3 drawer). `check:entity-links` exercises the
resolver for real; `probe-entity-drawer` drives it in the running game.

**Tagging pass owed:** the Chart inspector's Jurisdiction value, mission-log rows, station market
and contract rows, and the codex.

---

#### J04 · Fast Component Snapshot & Visual Iteration Lab (`probe-frontend-snapshot.mjs`) — *short* — **LANDED `c571c478`**

**Pattern:** Storybook / Component isolation testbed with instant headless visual capture.
**Player / Developer outcome:** agents and developers can iterate on frontend styling, icons, and cards with sub-second visual feedback without booting full 60 FPS Three.js gameplay.

**Build steps.**
1. Create `scripts/probe-frontend-snapshot.mjs` and wire `package.json` (`npm run probe:frontend-snapshot`).
2. Extend `_uilab.html` with component isolation fixtures for HUD anchors, cards, gauges, and faction roundels.
3. Output clean `.devshots/frontend/<component>.png` and side-by-side visual diffs.

**Seams:** `scripts/probe-frontend-snapshot.mjs`, `_uilab.html`, `package.json`.
**Verify:** standalone probe executes in <1s and outputs sharp PNGs into `.devshots/frontend/`.

---

#### J05 · Unified Vector Iconography, Faction Crests & Asset Purge — *short* — **LANDED `e23a9ba9`**

**Pattern:** Homeworld / Wipeout precision aerospace vector standard (`currentColor` 24×24 stroke SVG).
**Player outcome:** zero cartoonish OS emojis; distinct heraldic vector crests for all 14 galactic factions; unified aerospace symbols across station, outfitting, and flight.

**Build steps.**
1. Replace all Unicode emoji symbols (`fitTree.js` ⛴, `accessibility.js` 🛡, ⚡, ♨, ⛔) with dedicated 24×24 `currentColor` stroke SVGs.
2. Author 14 distinct geometric vector heraldic crests/roundels for factions (SCN, MTS, DMC, Reach, Quiet Choir, Vael, etc.) to replace `<rect><text>S</text></svg>`.
3. Consolidate competing metaphors (`uiPrimitives.js` balance scale, coffee mug, knight shield) into `src/ui/station/icons.js`.
4. Purge unreferenced raster reference sheets (`assets/ui/icons_atlas.jpg`, `assets/ui/reticle.jpg`).

**Seams:** `src/ui/station/icons.js`, `src/ui/fitTree.js`, `src/ui/accessibility.js`, `src/ui/uiPrimitives.js`, `src/data/factions/`, `src/ui/station/screens/factions.js`, `src/ui/galaxyMap.js`, `assets/ui/`.
**Verify:** `check:ui-identity`, `check:asset-reachability`, `check:wcag-contrast`, headless snapshot audit.

---

#### J06 · The Power Rail — *short* — **LANDED `79e56c06`**

**Pattern:** the MMO/looter action bar (WoW, Destiny) — permanent, numbered, fills as you grow.
**Player outcome:** *"I can see what I can do, and I can see it growing."* The direct answer to
*"I can't look at the HUD and see the big game."*

**Build steps.**
1. Render the rank bottom-centre in three bands of three — **ORDNANCE** (1–3, instantaneous, leaves
   nothing behind), **FIELDWORK** (4–6, spawns a persistent bounded object), **RIG** (7–9,
   ship-attached sustained toggle).
2. Slot states: ready · cooling (radial) · armed · locked · unaffordable · empty socket.
3. Implement the **slot-claim contract**: `hud:slotClaim { claimId, slots[], answers[], expiresAt, mode }`
   on prompt open, `hud:slotRelease { claimId }` on close. Modes `SINGLE` / `PARTIAL` / `FULL`.
4. Icons: generate from the 16 committed prompts, author to 24 × 24 `currentColor` stroke SVG per
   `ICON_PIPELINE.md`.

**Seams:** `src/ui/hud.js`, `injectHudCss` in `src/ui/uiRoot.js`, `src/systems/input.js`,
`src/ui/bindings.js`, new `src/ui/powerIcons.js`.
**Verify:** slot fires verb; claim/release round-trips through encounter prompt; capture at hour-1/10/50.

---

#### J07 · Tactical HUD Overhaul — "Ink on Vacuum", Column Grid & Wireframe Ship Condition — *medium* — **LANDED `ad4764b5 … f94a3368`**

**Pattern:** DCS / Elite Dangerous high-glancability non-diegetic HUD telemetry.
**Player outcome:** instantaneous combat parsing without reading text paragraphs; no misaligned staggered cards; dynamic ship damage wireframes matching the active hull.

**Build steps.**
1. **Right Dock Alignment**: lock `.sf-target`, `.sf-overview`, and `.sf-radar` into a unified 220px column width, eliminating the 232px staggered card overhang.
2. **De-box the UI ("Ink on Vacuum")**: strip heavy semi-transparent glass cards, 1px/2px harsh borders, and generic box-shadows. Replace with open-frame hairline corner brackets.
3. **Target Panel Streamlining**: move primary combat health into 3D in-world reticle arcs around the enemy target; condense the 8-line monospace paragraph into a compact visual threat badge + range bar.
4. **Enlarge & Upgrade Radar**: expand compact radar diameter from 180px to 220px (matching the dock width); replace 4px dots with directional heading chevrons, double-stroke capital ship silhouettes, and high-threat pulsation rings.
5. **Dynamic Vector Ship Condition**: replace static Scout PNG (`ship-condition-scout.png`) with dynamic SVG wireframes of the active player hull (`SHIP_SILHOUETTES`) with localized damage flashing.
6. **Comms Ribbon**: reposition the floating top-left comms button into a quiet, integrated frequency tape above the left contextual stack.

**Seams:** `src/ui/hud.js`, `src/ui/uiRoot.js`, `src/ui/targetPanel.js`, `src/ui/radar.js`, `src/ui/comms.js`, `styles/ui.css`.
**Verify:** `check:ui:perf`, `check:wcag-contrast`, visual snapshot capture of Cruise, Fight, Latch, and Low-Hull states.

---

#### J08 · Dynamic Combat Reticle & 3D Off-Screen Threat Halo — *medium* — **LANDED `bea90b47`**

**Pattern:** Ace Combat / Project Wingman dynamic targeting reticle and spatial threat awareness.
**Player outcome:** fluid dogfighting without looking away from the crosshair; intuitive reaction to flanking hostiles and incoming missile locks.

**Build steps.**
1. Dynamic aim reticle with weapon lead calculation pips, projectile convergence arcs, and lock-on bloom.
2. 360° off-screen threat halo: subtle screen-edge arc showing incoming missiles, flanking interceptors, and high-threat attack vectors without requiring eye movement down to the radar.

**Seams:** `src/ui/uiRoot.js` (`RETICLE_SVG`), `src/ui/hud.js`, `src/ui/targetPanel.js`, `src/systems/flightV3.js`.
**Verify:** combat lab scenario capture, lead pip convergence test.

---

#### J09 · Ship bands 2–3: handling, power, condition, capability — *short* — **LANDED `0f503607`**

**Pattern:** Elite Dangerous outfitting comparison + Warframe ghost-preview on hover.
**Player outcome:** the answer to *"why does my ship fly like this"*, a power budget with a capacity
to draw against, visible damage, and progression stated as capability.

**Build steps.**
1. **HANDLING** — mount `handlingProfile` verbatim. Bars kick and settle in proportion to their own
   value. Hovering a fitted module runs `massDelta` and **ghosts the bars to where they would go**.
2. **POWER** — headroom = `capRegen − continuousDrain` against `capMax`. `routeBeam` runs reactor → each
   drawing slot with dash velocity ∝ headroom; over budget the dashes march backwards.
3. **CONDITION** — mount `src/core/livingHull.js` scars (kill tally, repair patches, heat scorch).
4. **CAPABILITY** — every tech node's headline is the physical act it grants, second person.

**Seams:** `src/ui/station/screens/shipworks.js`, `src/ui/shipPreviewMount.js`, panels.
**Verify:** probe assertions on handling, power beam reversal, condition scars.

---

#### J10 · THE FOOTPRINT — *medium* — **LANDED `583f7893`**

**Pattern:** Red Dead 2's wanted system + Crusader Kings' *"why does this person hate me"* causal chain.
**Player outcome:** the world visibly remembers. A hostile patrol is traceable back to the collision
that caused it. Key `F3`.

**Build steps.**
1. Append-only `provenanceLedger` listener for `law:incidentReceipt`, `faction:repChanged`, `faction:repSpillover`.
2. Three linked panes: **Rap sheet** (crimes, sector, bounty) · **Standing** (nodes + spillover edges) · **Log** (queryable ship history + 12 named aces).
3. Verbs: pay bounty, bribe, find accuser, take amends contract, jump to sector on Chart.

**Seams:** `src/ui/screens/footprint.js`, `src/systems/lawSecurity.js`, `src/systems/factions.js`.

---

#### J11 · THE RANGE — *medium* — **LANDED `9d242df7`**

**Pattern:** Titanfall 2's gauntlet, Hitman training, Deep Rock tutorial bays — teaching by doing.
**Player outcome:** learns the physics toolkit by flying it, and can return to the lesson. Key `F4`.

**Build steps.**
1. Three playable drills: Massline swing with asteroid/drone; mass-vs-turn slalom; energy-budget hold.
2. Weak-point passes per enemy class (absorbs bestiary: `src/data/enemies.js`, `encounters.js`, `weakPoints.js`).

**Seams:** `src/ui/screens/range.js`, flight physics harness.

---

#### J12 · THE CHART as a dispatch console — *long* — **LANDED `06a8161c`**

**Pattern:** X4's map, Total War's campaign layer, Death Stranding route planning.
**Player outcome:** answers *"where should I take this cargo, and is that route survivable?"* in
seconds — and lets the player act on the answer without leaving the map.

**Build steps.**
1. Economic pressure flows (computed from surplus vs equilibrium).
2. Real route risk calculation (`dangerModel` + `securityReadout` + `factionPresence`).
3. Pure function traffic layer (`trafficRoleMixForSector`).
4. Live conflict zones and sector dossiers.

**Seams:** `src/ui/galaxyMap.js`, `src/ui/map/`.

---

#### J13 · Loadout presets and build identity — *long* — **LANDED `4dbd0257`**

**Pattern:** Destiny loadouts, Monster Hunter equipment sets.
**Player outcome:** *"different kinds of gameplay"* becomes real, because switching is cheap enough
to experiment with.

**Build steps.** Save named fits; swap at any station; a preset rail in THE SHIP's APRON.
Labelled by playstyle — *"Tow & Swing"* vs *"Skirmish"*.

**Seams:** `src/ui/station/screens/shipworks.js`, save schema.

---

#### J14 · Atmospheric Audio-Visual Feedback & Haptic Micro-Animations — *medium* — **LANDED `f85507a9`**

**Pattern:** Alien: Isolation / Dead Space analog-tactile interface feel.
**Player outcome:** physical, living instruments with inertial needle settling, CRT phosphor decay on capacitor discharge, sound-synced frequency visualizers on comms, and tactile click audio.

**Build steps.**
1. Physics-based gauge easing (subtle spring/mass easing).
2. Sound-synced audio frequency visualizer on incoming comms transmissions.
3. Tactile switch and chip click audio integration.

**Seams:** `src/ui/audio.js` / `src/audio/`, `styles/ui.css`, `src/ui/comms.js`, `src/ui/hud.js`.
**Verify:** `check:ui-frame-sleep` (zero CPU/rAF leaks at rest), `check:ui-effects`.

---

#### J15 · Contextual Quick-Comms Radial & Tactical Hail Deck — *medium/long* — **LANDED `6cd90065`**

**Pattern:** Mass Effect / Star Wars Squadrons tactical comms and faction diplomacy wheel.
**Player outcome:** in-flight dynamic interaction with NPC traffic (demanding surrender, paying bribes, requesting docking clearance) without breaking flight flow.

**Build steps.**
1. Non-pausing tactical hail radial (`Alt` or `H` key).
2. Integrated low-bandwidth holographic frequency visualizers and faction-crested pilot badges.

**Seams:** `src/ui/contactHailPrompt.js`, `src/ui/wingmanRadial.js`, `src/ui/comms.js`, `src/data/contactHail.js`.
**Verify:** `check:one-voice`, browser hail interaction test.

---

#### J16 · Visual regression in CI — *long, start early* — **LANDED `scripts/check-visual-regression.mjs, thresholds calibrated 2026-08-20`**

**Pattern:** standard practice at every A-list studio — reference frames diffed automatically.
**Player outcome:** nothing silently regresses.

**Build steps.** Extend the probes into a **capture matrix**: default · reduced-motion ·
`forced-colors` · pseudo-localized, at 2560 × 1080 · 1920 × 1080 · 1280 × 720. Commit reference
frames; diff on change; fail on threshold.

---

### 11.13 Sequential Execution Order (J01 ➔ J16)

```
PHASE 0: FOUNDATIONS & LAB TOOLING
  J01 (Four Data States) ──┐
  J02 (State Memory)     ──┼─► J04 (Visual Snapshot Lab) ──► J05 (Vector Icons & Crests)
  J03 (Entity Links)     ──┘

PHASE 1: FLIGHT HUD & TELEMETRY
  J05 (Icons) ──► J06 (Power Rail) ──► J07 (Tactical HUD Overhaul) ──► J08 (Combat Reticle & Threat Halo)

PHASE 2: STRATEGIC SCREENS
  J07 (HUD) ──► J09 (Ship Bands) ──► J10 (The Footprint) ──► J12 (The Chart)
                                └──► J11 (The Range)
                                └──► J13 (Loadout Presets)

PHASE 3: POLISH, DIPLOMACY & CI
  J08 (Reticle) & J09 (Ship) ──► J14 (Tactile Haptics & Audio)
                             └──► J15 (Quick-Comms Radial)

  J16 (Visual Regression in CI) diffs reference frames continuously from J06 onward.
```

**Key Execution Rules:**
1. **J01–J03 (Properties) & J04 (Visual Lab) come first**: every screen built after them inherits state safety, linking, and instant visual verification without rework.
2. **J05 & J06–J08 deliver the immediate high-visibility flight upgrade**: eliminating emojis, de-boxing the HUD, and establishing combat glancability.
3. **J09–J13 reveal the deep simulation**: surfacing ship handling, crime history, gauntlet drills, economic flows, and playstyle fits.
4. **J14–J16 finish sensory feedback, diplomacy, and automated regression safety**.


---

### 15.9b The Studio Recovery Audit (2026-09-05), graded

An independent ~22,000-word source-grounded review of `571659e8` (full text in git history;
its four analytical reference modules live under `tools/reference/`, diagnostic only). Its thesis —
that the repo keeps promoting an implementation, a diagnosis or a convenient surrogate into binding law
and then optimises the law — is right, and it is the failure §1.3 law 9 and §19 exist to catch. Graded
by the integrator; nothing below is an owner ruling until the owner says so.

- **Adopted, done in place (`PQ-189.01`):** §1.6 split into blockers and required proofs (a polarity
  error); law 3 exempts controls and instruments; the fun loop's critic count is a coverage score
  with a hard blocker for a stand-in, not a yes-count verdict; KEEP/REVERT compares the intended bar
  against a declared tradeoff instead of demanding every bar move; the quiet-window metric is scoped
  to combat benches; `FEEL_CONTRACT` §A rows A6–A13 read what landed (they still said OPEN); B8 names
  admissible stroke geometry (a universal ≥ 70 % promise is infeasible on short strokes); the perf
  operator no longer orders the shipped scheduler (`PQ-129.15` is deferred as shipped); the README no
  longer says Space fires.
- **Adopted as leaves:** the control contract generated from the bindings (`PQ-189.00`, pulls the
  `PQ-164` slice forward); minimal action audio in the first playable (`PQ-158.06`); reduced motion
  keeps information (`PQ-165.03`); the production baseline route matrix on named hardware
  (`PQ-144.01`, with the audit's frame-audit tool); the critic's verdict as blockers + intent result +
  play judgment (`PQ-173.04`); Swarm's earned breathing room / pressure reservoir (`PQ-174.08`);
  explicit cargo custody and one-commit transactions (`PQ-177.06`); visible operational limits
  replacing the passive-income haircut, with a save migration (`PQ-177.07`); forecast quality judged by
  calibration, not a 30 % uplift (`PQ-177.01` rewritten); the first durable site loop with an exterior
  consequence (`PQ-145.01`); the style slice and the effect-class VFX matrix (`PQ-190` — world art and
  effects only; screens, HUD and type belong to the frontend direction, `design/FRONTEND_DIRECTION.md`).
- **Adopted with a guard:** "mutate, never fail" (`PQ-138.04`) becomes a bounded policy — recovery
  where meaningful, clean failure and partial success allowed, never recursive busywork; the first-ten-
  minutes candidate sequence is attached to `PQ-163` as a candidate, not a script; industrial danger
  stays chosen and visible (no periodic raids as balancing); "never add drag" keeps its meaning — an
  explicit brake, a drive family, authored angular damping and a visible thruster correction are not
  drag, a hidden velocity clamp is.
- **Declined:** a new independent backlog (the audit itself says so); an engine or worker migration as
  recovery; treating the paperwork ratchets (single writers, goldens with causal records, normal-route
  evidence, independent acceptance) as waste; a global bloom increase as art direction.
- **Provenance conflict surfaced, owner's call:** the audit found `VISION_ALIGNMENT_PLAN.md` Big-Five
  item 4 (2026-08-10) recording the owner's REJECTION of a hull scar / recognition system, while §15
  (2026-09-03) admitted `PQ-142.01` from VISION Part II and it landed on 2026-09-05 as a record and
  words (no paint on the hull). The later admission stands until the owner rules; the packet carries
  the note.


