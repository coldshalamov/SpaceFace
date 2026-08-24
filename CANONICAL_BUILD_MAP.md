<!-- LIFETIME: STABLE -->
# SpaceFace Canonical Build Map

This is the repository's implementation front door. It routes an agent to the smallest authoritative packet and the live owners it must respect. It deliberately contains no current queue snapshot, branch name, lease, test transcript, or completion history.

## 1. Start here

Before changing anything:

1. Run `git status --short` and inspect the current branch/HEAD. Do not create a worktree by default.
2. Read root [`AGENTS.md`](./AGENTS.md).
3. Read only the relevant sections of [`ARCHITECTURE.md`](./ARCHITECTURE.md) and [`design/GDD_2_0.md`](./design/GDD_2_0.md).
4. Read the short shared-edit board: [`design/program/NOW.md`](./design/program/NOW.md).
5. If the user did not name an exact unit, use the copy-ready
   [`design/program/AGENT_TASK_PROMPTS.md`](./design/program/AGENT_TASK_PROMPTS.md), then run
   `node scripts/program-dispatch.mjs --next` for the first exact dependency-front unit,
   `node scripts/program-dispatch.mjs --ready` for every currently dependency-front unit, or
   `node scripts/program-dispatch.mjs --id PQ-XXX` for one parent outcome. The dispatcher includes
   implementation, acceptance-repair, capture, evidence-review, performance, and integration units, so a
   headless-complete parent is not redispatched as feature work. Open the raw
   [`program-queue.json`](./design/program/roadmap/program-queue.json) only when maintaining its
   index/dispatch units or diagnosing dependency/identity history.
6. Open the returned packet in [`design/program/roadmap/active/`](./design/program/roadmap/active/README.md).
   If an already-queued unit lacks an executable packet, shape the smallest packet from the template
   as part of that unit instead of stopping. Do not invent a new outcome that is
   absent from both the queue and the user's direction.
7. Use [`docs/MODULE_MAP.md`](./docs/MODULE_MAP.md), then generated [`docs/SYSTEM_REGISTRY.md`](./docs/SYSTEM_REGISTRY.md) or [`docs/EVENT_ROUTING.md`](./docs/EVENT_ROUTING.md), to locate live owners. Search only those owners, their tests, and their checks.
8. Follow [`design/program/roadmap/00_EXECUTION_PROTOCOL.md`](./design/program/roadmap/00_EXECUTION_PROTOCOL.md) through a terminal receipt.
9. Add one short `NOW.md` row only when mutation begins. Reading, research, testing, and review hold
   no file. Release the row as soon as mutation stops; task-long path reservations are forbidden.
10. **Single chat / “next task”:** finish one unit, commit and push, return
    `RESULT: DONE` or `RESULT: NOT DONE`, and stop. **Overnight, “do all of it”, “the work in
    this map”, or “non-INFERENCE work”:** this is a campaign — see the campaign door below.
    Do not stop after one leaf.

Several threads may follow these steps at once in the same checkout. The first thread that actually
edits records its exact files in `NOW.md`; the others take the next returned task or continue on
disjoint files. No coordinator, task-long reservation, or worktree is required.

**Two doors for "what to work on"** — the `SPACEFACE COMMANDS` block at the top of
[`design/program/INFERENCE_LANES.md`](./design/program/INFERENCE_LANES.md):

- `NEXT` → one admitted queue unit, then stop. Use `program-dispatch --next/--ready/--id`.
  Ordinary `--next` still prefers fleet remaster (`PQ-050`). Hitching is not that door.
- **The game is hitching / stuttering / unplayable-smooth** → §8.4,
  [`design/program/PERF_TABLE_ANALYSIS.md`](./design/program/PERF_TABLE_ANALYSIS.md),
  and [`design/program/PERF_PERSISTENCE_CAMPAIGN.md`](./design/program/PERF_PERSISTENCE_CAMPAIGN.md).
  Copy [`design/program/PERF_PERSISTENCE_GOAL.txt`](./design/program/PERF_PERSISTENCE_GOAL.txt).
  Dispatch `node scripts/program-dispatch.mjs --id PQ-129` only for hitch leaves that do not
  collide with persistence Phase 1. Do not skip to Worker/WebGPU/quality cuts. Do not
  delete off-screen actors.
- **3D objects look like toys next to real ships** (tube+ring beacons, cargo pods, 47-A
  spindle, uneven quality) → [`design/program/GRAPHICS_3D_CAMPAIGN.md`](./design/program/GRAPHICS_3D_CAMPAIGN.md)
  and the operator [`GRAPHICS_3D_GOAL.txt`](./design/program/GRAPHICS_3D_GOAL.txt). Same
  chase-camera bar as Hitch/Helios. Stay off the hitch thread’s renderer files. This is
  not `PQ-129` and not a default-quality cut.
- **Asteroid Works / mining minigame is unreadable, undrivable, or ugly** (tan wash,
  HUD is ugly *and* eats the board, gray vibe-coded chrome, rover too small or too
  fast, hover is a wall of text) → the ground-up positive design is
  [`design/ASTEROID_WORKS_DESIGN_LAW.md`](./design/ASTEROID_WORKS_DESIGN_LAW.md)
  (2026-08-20 owner session: warm UI reboot, perfect flat chess grid, fog removed,
  events on the board); campaign bans in
  [`design/program/ASTEROID_WORKS_PLAYFIELD.md`](./design/program/ASTEROID_WORKS_PLAYFIELD.md)
  and the operator
  [`ASTEROID_WORKS_PLAYFIELD_GOAL.txt`](./design/program/ASTEROID_WORKS_PLAYFIELD_GOAL.txt).
  Dispatch `node scripts/program-dispatch.mjs --id PQ-130`. The board is the game.
  **The mine's objects are procedural stand-ins** (owner 2026-08-21: "8-bit NES model inside
  this 3d world") → [`design/program/ASTEROID_WORKS_ART_CAMPAIGN.md`](./design/program/ASTEROID_WORKS_ART_CAMPAIGN.md)
  (operator [`ASTEROID_WORKS_ART_GOAL.txt`](./design/program/ASTEROID_WORKS_ART_GOAL.txt)),
  dispatch `--id PQ-131`: authored rover, machines, derrick, conduits, inclusions through the
  ship pipeline, reviewed through the works camera beside a flight still. `PQ-130` acceptance
  is blocked on it. This is not `PQ-050`, not `PQ-129`, and not Asteroid Ops Waves 1–4.
- **Any 2D / HUD / menu / screen work** → §11 below, then
  [`design/frontend/INSTRUMENT_GRAMMAR.md`](./design/frontend/INSTRUMENT_GRAMMAR.md) **before you
  design or build anything.** The grammar is binding; per-screen specs live beside it in
  [`design/frontend/`](./design/frontend/README.md). Frontend work that skips it is the documented
  cause of "cheap and uninspired" output.
- **Crucible / Survival mode / Combat Lab / arcade combat / wave mode / attack modifiers / arenas** → §12 below and
  [`design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md`](./design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md).
  Dispatch `node scripts/program-dispatch.mjs --id PQ-133`. Leaves run `.00 → .04` strictly. The arcade
  structural VFX pool is `PQ-134` (§13). This is not PQ-050, not PQ-129, and not the Physics-as-Spectacle gates.
- `INFERENCE <Nx> [optional scope]` → [`design/vision/INFERENCE_CONVERGENCE_METHOD.md`](./design/vision/INFERENCE_CONVERGENCE_METHOD.md)
  plus [`INFERENCE_LANES.md`](./design/program/INFERENCE_LANES.md). That door does **not** run the
  flyable-ship remaster.
- **Campaign / overnight / “non-INFERENCE work in this map” / “non-inference graphics work” /
  “do all of it”** → stay on admitted
  program work and **keep going**. Do not open the INFERENCE method. Do not take a single `--next`
  and quit. That phrase means **`PQ-050`**, not the dock/hulk handoff and not the expansion-research
  brief. Default unfinished campaign is **`PQ-050`** (every remaining non-Hitch flyable ship
  under [`ADVANCED_MODEL_TECHNIQUE_CONTRACT.md`](./docs/visual-assets/ADVANCED_MODEL_TECHNIQUE_CONTRACT.md)).
  Loop `node scripts/program-dispatch.mjs --id PQ-050`, finish the first claimable ship leaf
  under the technique contract **and**
  [`MODEL_ADVERSARIAL_REVIEW_WORKFLOW.md`](./docs/visual-assets/MODEL_ADVERSARIAL_REVIEW_WORKFLOW.md)
  (five-plus full-job cycles, three valid **chase-camera** stills, three subagent reviews that list
  obvious defects at play size, then cleanup), commit, then the next ship, until every PQ-050 leaf is
  done or honestly blocked. Hitch stays frozen. A factory loft with boxes, a zoomed gray
  crop, or a seat nobody can see from the chase camera does not close a ship.
  Only after PQ-050 is exhausted, take other `--ready` implementation units. Acceptance-capture
  leaves that need a human or a headed machine you do not have may be recorded `unproven` and
  skipped; do not stall the campaign on them.

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
[`design/graphics-sprints/TOP10_ROI_ASSET_PLAN.md`](./design/graphics-sprints/TOP10_ROI_ASSET_PLAN.md).
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

## 2. Product north star

SpaceFace is an open-source systemic space game with the legible economic and navigational base of games such as Endless Sky, but its distinctive play is physical. Gravity, inertia, collision, Massline attachment, boost, payload mass, fields, recoil, orbital geometry, and improvised physical tricks should produce tactics that are visible, learnable, and surprising.

A strong implementation therefore does all of the following:

- creates a meaningful player decision rather than merely another data row;
- lets existing physical systems interact instead of scripting a decorative imitation;
- keeps cause and consequence readable at the normal game camera;
- preserves deterministic simulation, single-writer state ownership, save/Continue, and Browser/Electron parity;
- treats ambitious graphics as part of the feature, not a luxury to suppress;
- pays for new spectacle through structural performance work—LOD/HLOD, batching, instancing, culling, cadence, admission, compression, pooling, and bounded queries—not through silent quality cuts;
- leaves one coherent game path rather than a second implementation for probes, Electron, or a special mission.

When a plan and live evidence disagree, preserve the intended player outcome and repair the execution path. Do not preserve a stale technique merely because prose once named it.

For cross-system game-direction expansion, start at
[`design/vision/GAME_DIRECTION_EXPANSION.md`](./design/vision/GAME_DIRECTION_EXPANSION.md). It owns
durable portfolio axes and player-story coherence, never priority, leases, implementation, status, or
acceptance. Shape one bounded slice, then return to §1 and admit it through the normal program route;
graphics-only work still follows the standing graphics route above.
The optional
[`design/vision/INFERENCE_CONVERGENCE_METHOD.md`](./design/vision/INFERENCE_CONVERGENCE_METHOD.md)
captures the useful PR #92/ChatGPT research loop for comparing alternatives and cutting weak ideas;
it supplies no task, ownership, gate, quota, or acceptance authority.

## 3. Authority and truth

Use this order when sources disagree:

1. the user's current direction;
2. [`ARCHITECTURE.md`](./ARCHITECTURE.md) for technical invariants and owner boundaries;
3. [`design/VISION.md`](./design/VISION.md) for the owner's fantasy and UVP — wins on product emphasis;
4. [`design/GDD_2_0.md`](./design/GDD_2_0.md) for product intent;
5. `design/program/` for admitted work, live status, and acceptance;
6. the selected active packet or activated spec;
7. supporting plans and references;
8. historical handoffs and archives, for archaeology only.

A lower source cannot impose a palette, layout recipe, asset ceiling, implementation technique, process quota, permanent ownership lane, or gameplay prohibition that contradicts a higher source.

Live code, current checks, and player-route evidence determine whether descriptive claims and packet
seam maps are true. They do not overrule a higher architectural or product contract merely because a
buggy implementation is current.

## 4. The five control surfaces

| Surface | Lifetime | Owns | Must not own |
|---|---|---|---|
| [`NOW.md`](./design/program/NOW.md) | volatile | threads actually mutating now, exact dirty hunks, brief publication windows, unassigned dirty work | history, task-long ownership, subsystem lanes, dependencies, completion, test transcripts |
| `scripts/program-dispatch.mjs` + [`program-queue.json`](./design/program/roadmap/program-queue.json) | compact read view + durable machine index | exact dispatch units, parent identity, integration dependencies, broad checks/evidence, coarse parent state | active mutation windows, implementation prose, acceptance transcripts |
| [`active/`](./design/program/roadmap/active/README.md) | active packet | executable outcome, live seams, phases, write budget, proof budget, stop conditions | global status, unrelated backlog, permanent architecture |
| `receipts/` and acceptance pages | evidence | exact-revision proof and honest residuals | future requirements or dispatch state |
| module/event/system maps | generated or maintained reference | low-context code navigation | product priority or completion claims |

Status is two-dimensional:

- **Lifecycle:** `planned → ready → claimed → implemented → integrated`, with `deferred` and
  `historical` as explicit dispositions. The legacy `blocked` enum remains only for schema
  compatibility and has no current queue rows. Named human-only work uses `deferred`; internal
  dependencies, another thread, dirty files, tools, reviews, or hardware never become blockers.
- **Acceptance:** `unproven → focused_green → route_accepted → milestone_accepted`.

These axes do not imply each other. Integrated code may still lack route acceptance; a source asset may be implemented but not runtime-wired; a focused-green packet is not automatically fun, readable, or complete.

The existing queue's `state` field is transitional and can contain legacy acceptance labels. Treat it only as a coarse index value. The active packet and exact-revision receipts own the separate lifecycle and acceptance claims until the queue schema is migrated.

## 5. Selecting and shaping work

Choose the first dependency-front dispatch unit, or an exact unit named by the user, and reduce it to
the smallest coherent slice that can reach its declared terminal state. `--ready` is the preferred
integration order, not a list of the only work that exists. `NOW.md` prevents one dirty hunk from
being overwritten: if that exact hunk is actively changing, continue the task's disjoint work or take
the next returned unit. Never turn the overlap into a blocked packet, subsystem, or roadmap.

An executable packet must name:

- one player outcome and one normal route;
- current owner modules and the events/APIs they expose;
- integration dependencies and any exact live handoff needed at mutation time;
- exact or bounded write surfaces;
- explicit non-goals;
- deterministic/save/single-writer invariants;
- graphics and accessibility semantics;
- expected entity, query, allocation, draw, texture, and residency growth;
- a focused test ladder and an expensive-probe launch budget;
- review convergence rules;
- checkoff and receipt updates;
- conditions that require stopping and returning a shared-change request.

If the packet still needs several unrelated owners, several visual families, or several independently releasable player outcomes, split it. Queue rows such as a graphics overhaul may remain portfolio containers; agents implement leaf packets, not the umbrella in one heroic blur.

## 6. Implementation posture

Prefer owner reuse and new narrow seams over parallel authorities. Characterize the current behavior before changing it. Write a failing seconds-scale regression before debugging through a browser route. Keep public behavior and state transitions deterministic; wall time and callback order may observe or present state, never decide simulation truth.

For physics-heavy work, ask four questions early:

1. What physical state is authoritative?
2. Which existing systems can couple to it without a special case?
3. What counterplay or failure mode keeps it from becoming a button that wins?
4. What cue makes mass, force, risk, and ownership legible without requiring hidden telemetry?

For visual work, do not instruct agents to make less. Require the exact authored identity, stable transforms and sockets, appropriate LOD/HLOD, bounded residency, normal-camera review, and one measured route. Placeholder clay is diagnostic only; it is not a shipping style.

## 7. Verification that converges

**A check that runs a `node:test` file with `await import()` CANNOT FAIL.** Found 2026-08-23 in a
brand-new check whose own header promised "a `count > 0` rule is expressly rejected". Importing a
`node:test` module registers its tests and the runner executes them, but a failing assertion is
reported to the REPORTER — it does not reject the import. The block had a `try`/`catch`, an error
message and a failure counter, and still exited **0** with a deliberately failing test injected.

Run the suite as a child process and honour its exit code:

```js
const suite = spawnSync(process.execPath, ['--test', join(ROOT, 'test/x.test.mjs')], { cwd: ROOT });
if (suite.status !== 0) { /* fail */ }
```

This is the §11.10a rule in its sharpest form: **reading that block would never have revealed it —
mutating it took one minute.** A check that cannot fail is worse than no check, because it converts
"unverified" into "verified" in everyone's mind. Before trusting any new gate, inject a failure and
watch it go red.


Choose the proof layer through [`docs/VALIDATION_WORKFLOW.md`](./docs/VALIDATION_WORKFLOW.md). The
finite review and validation state machine lives in
[`00_EXECUTION_PROTOCOL.md`](./design/program/roadmap/00_EXECUTION_PROTOCOL.md). Its essential rules
are:

- focused deterministic checks precede broad or live probes;
- every packet names its lab scenario and executor before L3, or records why the claim is not
  representable headlessly and what smallest lab/schema gap prevents it;
- a broker manifest uses `requiresScenario` when an eligible lab scenario already exists, binding
  that scenario's fresh pass to the current candidate before a Browser/Electron claim is minted;
- each predeclared acceptance cell receives at most one attempt per candidate digest, while a campaign
  claim may contain several distinct cells;
- a product, harness, or nondeterminism failure must be reduced to a seconds-scale regression before
  another affected acceptance attempt;
- retain unchanged failure fingerprints as evidence; change the candidate or approach instead of rerunning them;
- evidence review closes with discovery, repair, and a causal re-review rather than a succession of
  open-ended fresh audits; use a separate reviewer when one exists, but the finishing agent may issue
  the verdict from retained evidence and must disclose that it is a self-review;
- unrelated new ideas become follow-ups, not reasons to reopen the packet indefinitely;
- every execution ends `PASS`, `FAIL`, `NEEDS HUMAN`, or `DEFERRED` with an exact-revision receipt,
  then reports plain `DONE` or `NOT DONE` to the user.

Certification remains fail-fast. A diagnostic route may collect several independent recoverable
failures in one run, but it must abort when boot, navigation, or observation authority is lost and
its aggregate report cannot promote acceptance.

The repository already contains a validation broker. New expensive routes should add a manifest and
use it instead of inventing another retry loop.

## 8. Performance is part of design

Every packet that can add per-frame work, entities, colliders, DOM, particles, materials, textures, asset admission, save payload, or queries must declare a cost model before implementation and report matched before/after evidence at acceptance.

Use [`design/PERF_BUDGET.md`](./design/PERF_BUDGET.md). Preserve the target and floor profiles. Optimize invisible work first. Do not pass by lowering default render scale, effects, shadows, particles, asset detail, or content density. The durable multi-approach tradeoff board lives in [`design/PERFORMANCE_OPTIMIZATION_CONSTELLATION.md`](./design/PERFORMANCE_OPTIMIZATION_CONSTELLATION.md). The exhaustive same-picture option space — including investigations, scaffolding, tabletop-correct cuts, and large Worker/WASM/WebGPU/native/Rust jobs — lives in [`design/PERF_OPTION_SPACE.md`](./design/PERF_OPTION_SPACE.md) and is reserved as §8.2.

Feature code should be naturally bounded:

- no unbounded per-frame scans or append-only journals;
- no unmeasured or avoidable per-frame allocation in hot paths;
- no hidden screen continuing expensive render or DOM work;
- no duplicated asset loads or material programs for equivalent roles;
- no gameplay entity published before its authored identity and interaction envelope are ready;
- no save serializer whose cost grows without an explicit cap and evidence.

### 8.1 Later performance PQ sequence

The existing modernization series remains authoritative for its current scopes:
`PQ-038` dense `PresentationWorld`, `PQ-040` dirty GPU ranges, `PQ-041` Electron modernization,
`PQ-042` evidence-selected GPU correction, `PQ-043` the conditional simulation Worker, and
`PQ-044` the conditional WebGPU/TSL vertical slice. Do not duplicate those packets or treat their
implementation state as player-route acceptance.

The following later PQ identities are reserved by the owner for the remaining smoothness program.
They are durable plan routes, not current leases or a queue snapshot. Before implementation, admit
the exact parent and its smallest executable leaves into `program-queue.json`, create its active
packet, refresh live code and ownership, and keep the outcome inside the scope below. A packet closes
on the direct player result, not on counters, reports, test volume, or lower default quality.

| Later plan | Player outcome | Production scope | Direct done condition and dependencies |
|---|---|---|---|
| **`PQ-051` / `PERF-11-FRAME-LIVENESS`** | Continue and ordinary flight never leave a permanently frozen 3D picture behind a still-moving HTML HUD. | Repair the actual renderer/presentation latch on the real player path: authoritative entity identity, frame/draw exceptions, WebGL context recovery, presentation scheduling, and canvas present. Promote the bounded runtime witness only as the failure classifier needed to fix the owner. Never clear/catch/skip work merely to keep the HUD alive. | On the owner's real save in Browser and Electron: leave loading, fly for 30+ seconds, and observe simulation, movement, renderer frames, and canvas pixels continuing together with no repeating frame error or unrecovered context loss. This is the release-blocking prerequisite for every later performance claim. |
| **`PQ-052` / `PERF-12-RIGID-OPAQUE-BATCHING`** | Crowded fleets keep their authored appearance while materially reducing GPU submission cost. | Adopt, repair, or reject the existing material-keyed heterogeneous `THREE.BatchedMesh` candidate. Pool only rigid opaque render-package surfaces behind exact material identity; preserve owner release, LOD, damage, semantic proxies, pipeline/residency admission, context recovery, and bounded geometry capacity. Keep canopies, plumes, fans, nav lights, decals, animated surfaces, and transparency-sorted work out of this lane. | A clean same-scene before/after shows a material GPU-frame reduction and fewer opaque submissions/chunks with identical geometry, materials, transforms, animation, damage, and visible pixels. Depends on `PQ-051`, the `PQ-034` measurement seam, and current render-package authority; do not wire the older generic batcher merely because it exists. |
| **`PQ-053` / `PERF-13-LIVE-LOD-HLOD-IMPOSTORS`** | Near ships and places retain full authored quality while distant fleets, stations, and landmarks become genuinely cheap. | Repair the Wasp separate-file demotion, generalize safe projected-pixel LOD0/1/2 selection to every valid ship family, spawn distant traffic at the appropriate resident level, and produce authored station/place HLOD clusters and far impostors through the offline package pipeline. Bound far greebles, animation, decals, and realtime shadow casting by projected contribution without reducing close detail. | Moving through the same route changes actual resident/drawn geometry and scales triangles, meshes, shadows, and GPU time with projected size without blank frames, visible popping outside the declared transition band, identity/socket drift, or extra LOD0 residency. Depends on `PQ-037`, `PQ-051`, and coordination with `PQ-052`. |
| **`PQ-054` / `PERF-14-BOUNDED-GPU-ADMISSION`** | Continue, New Game, sector entry, and first combat no longer move the same unbounded shader/upload stall between loading and flight. | Finish the finite identity-bound opening pipeline/residency cohort, context-restore fail-closed behavior, low-LOD/opening-shell-first admission, and bounded post-paint draining. Compile and upload only exact critical roots before handoff; later roots use the normal per-root gate. Do not wait on a growing pending set, render the whole live scene as warmup, skip shaders, or raise timeouts as a fix. | The owner's real Continue and a heavy sector entry reach a changing playable canvas; every blocking slice stays within the performance budget's target/hard limits, late admissions cannot extend the opening watermark, and first-use combat/traffic produces no permanent freeze or seconds-scale shader/upload hitch. Depends on `PQ-051` and the live `PQ-037`/pipeline-residency seams. |
| **`PQ-055` / `PERF-15-IMMUTABLE-ASSET-TRANSPORT`** | Boot, Continue, hub opening, and sector entry stop repeatedly transferring, hashing, decoding, and shipping the same large asset bytes. | Give immutable release assets content-derived cache identity and headers; retain no-cache only for mutable documents and saves. Remove duplicate package/source encodings from the retail bundle where the package is canonical, split the largest places into opening shell plus independently resident detail, and add validators/range or packaged-file transport only where a boot trace justifies them. Keep KTX2 and meshopt; use Brotli for code/text rather than recompressing already-compressed GLBs. | Warm launch and repeat-sector entry reuse immutable bytes; cold entry presents the bounded shell first; installed/runtime bytes fall without missing fallback/dev sources or visual drift; the largest package no longer has to decode as one monolith before useful presentation. Depends on `PQ-037` and coordinates with `PQ-053`/`PQ-054`. |
| **`PQ-056` / `PERF-16-PRESENTATION-AND-AA-CONSOLIDATION`** | The default image pays once for anti-aliasing and presentation while retaining bloom, grade, grain, vignette, exposure, shadows, and authored detail. | After `PQ-042` selects the real GPU owner, maintain one default present path; prove whether canvas MSAA is dead work behind the single-sampled HDR/fullscreen-composite route, integrate one quality-preserving post-AA solution when needed, and perform only the selected shadow, transparency, opaque-order, depth, or post fusion. Do not promote the optional render graph, add a global depth prepass, or clamp supersampling without a net same-image win. | Same-camera image/temporal parity holds at default settings and the selected GPU scope plus aggregate frame time improves on Browser and Electron. Depends on terminal `PQ-042`; if its evidence selects another owner, this plan narrows to that result or closes with no product mutation. |
| **`PQ-057` / `PERF-17-DETERMINISTIC-ACTIVITY-SCHEDULER`** | World density can grow without every registered system, AI cohort, query owner, and physics body paying 60 Hz work while inactive. | Remeasure after the civilian-threat cadence change, then add deterministic tick-quantized schedules and active-owner wake/sleep rules. Keep input, flight, weapons, collisions, and required physics authority at 60 Hz; cadence or sleep slow AI perception, traffic planning, remote economy/story, inactive world owners, and eligible Rapier bodies. Reuse the spatial hash and dirty journals rather than replacing working indices. | Fixed-seed/save parity remains exact; player response and combat authority remain 60 Hz; simulation p95 meets its 5 ms budget in crowded flight and query/candidate work scales with active cohorts rather than total registered systems. Depends on `PQ-039`; completion decides whether existing `PQ-043` is still causally necessary. |
| **`PQ-058` / `PERF-18-LONG-SESSION-RESOURCE-GOVERNOR`** | Repeated sector travel and long sessions do not accumulate RAM, GPU resources, decoder state, render targets, or stale pools until the game hitches or loses its context. | Extend the existing ref-counted asset residency and context-resource lifecycle only where a bounded travel/restore trace shows retained growth. Add explicit CPU/GPU byte and owner budgets, deterministic eviction priority, previous-sector warmth, pooled-resource retirement, and context-rebuild accounting without evict/reload thrash. | A bounded multi-sector/Continue/context-restore soak reaches a stable memory/resource plateau, releases unowned generations, keeps the next required shell resident, and introduces no recurring decode/upload hitch. Depends on `PQ-054`/`PQ-055`; if the trace is already flat, close with the retained evidence and no new governor. |
| **`PQ-059` / `PERF-19-WEBGPU-GPU-DRIVEN-SCALEOUT`** | A larger fleet or place scene gains substantial headroom from GPU-owned visibility and submission without becoming a visually different game. | Execute only if `PQ-044` adopts WebGPU. Move one representative RenderWorld slice from CPU draw enumeration to stable render bundles, compute visibility/instance compaction, indirect draws, texture-array material families, and offline cluster/meshlet LOD while retaining the WebGL2 rollback path. | At least the backend-decision gain floor holds over the required representative frames with zero visual/gameplay parity regressions, improved p99/hitches, and bounded pipeline/device recovery. A failed or marginal `PQ-044` ends this route without implementation. |
| **`PQ-060` / `PERF-20-NATIVE-RENDERER-TRIGGER`** | The project has an evidence-based final platform decision if browser/Electron rendering still cannot meet the low-end floor after structural work. | Apply the existing backend trigger only after batching, LOD/HLOD, admission, asset transport, scheduling, and the WebGPU slice are exhausted. If triggered, produce one narrow native presentation vertical slice against the same RenderWorld/input/save contracts before authorizing a port; otherwise retain the browser/Electron architecture. | Native work begins only when repeated quiet-machine p99 remains beyond the declared ceiling, the work families are actually exhausted, and the representative slice beats the supported web path without product divergence. Otherwise this PQ closes `not-triggered`; it is never a reward for skipping unfinished optimizations. |

Execution order is outcome-driven, not merely numeric: `PQ-051` first; then `PQ-052` through
`PQ-055` where their exact paths are free; `PQ-042` selects the scope that permits `PQ-056`;
`PQ-057` determines whether existing `PQ-043` should run; `PQ-044` determines whether `PQ-059`
exists as implementation; and `PQ-060` remains the final conditional boundary. Use one clean matched
player-route comparison per candidate and pivot on a repeated failure fingerprint instead of turning
the sequence into an audit or capture campaign.

### 8.2 Full same-picture option space (`PQ-061`–`PQ-128`)

SpaceFace is a tilted top-down table. Later work must optimize **the glass plus a short approach
runway**, not a horizon. Huge jobs stay listed. A plan is legal only if the player-facing game is
unchanged. Full protocols, investigation scaffolds, and implement-after-census rules:
[`design/PERF_OPTION_SPACE.md`](./design/PERF_OPTION_SPACE.md).

These identities are reserved, not admitted. Admit a parent and its smallest leaves into
`program-queue.json` before implementation. `PQ-094` may mint new reserved leaves when a sweep
finds a pole this table does not name.

| Plan | Horizon | Player outcome |
|---|---|---|
| **`PQ-061` / `PERF-21-TABLETOP-CENSUS`** | Near INV | Glass vs fake-visible vs resident vs sim counts on a fixed-seed fly. |
| **`PQ-062` / `PERF-22-HITCH-CLASSIFIER`** | Near INV | Every >32 ms frame named (compile, upload, compose, shadow, GC, save, …). |
| **`PQ-063` / `PERF-23-PHASE-TIMERS`** | Near INV | Honest sim / prep / submit / present / UI / VFX clocks on the bloom path. |
| **`PQ-064` / `PERF-24-SHADER-VARIANT-CENSUS`** | Near INV | Live program keys vs precompile keep-alives. |
| **`PQ-065` / `PERF-25-ALLOC-GC-SOAK`** | Near INV | Long-session heap/GPU retainers named or declared flat. |
| **`PQ-066` / `PERF-26-DETERMINISM-LAB`** | Near INV | Cadence/Worker/WASM candidates rejected if hashes move. |
| **`PQ-067` / `PERF-27-PLATFORM-SPIKE-MATRIX`** | Mid INV | Worker, WASM, WebGPU, native spikes; keep/reject each with picture parity. |
| **`PQ-068` / `PERF-28-GLASS-BOX-SUBMIT`** | Near IMPL | Off-glass ships not drawn; on-glass picture identical. |
| **`PQ-069` / `PERF-29-APPROACH-RESIDENCY`** | Near IMPL | Meshes exist just before they can enter the glass. Loading compose uses glass + the immediate authored runway, not a leftover 2400 WU ship horizon. The Helios starting hub is still an exact exception. |
| **`PQ-070` / `PERF-30-OFFSTAGE-WORK-FREEZE`** | Near IMPL | LOD, shadows, closures, pools do not run for unsubmitted roots. |
| **`PQ-071` / `PERF-31-OFFGLASS-LANDMARKS`** | Mid IMPL | Far stations are map facts until approach, not live 3D residents. |
| **`PQ-072` / `PERF-32-EXACT-KEY-PREWARM`** | Mid IMPL | First sight of a live shader key is not one display callback. |
| **`PQ-073` / `PERF-33-COMPOSE-PART-SLICE`** | Mid IMPL | Building a ship cannot drop a 40–250 ms present brick. |
| **`PQ-074` / `PERF-34-UPLOAD-AFTER-PRESENT`** | Mid IMPL | First texture/buffer upload does not share the present beat. |
| **`PQ-075` / `PERF-35-NEXT-CONTACT-WARM`** | Mid IMPL | Only hulls about to enter the glass are warmed. |
| **`PQ-076` / `PERF-36-ONGLASS-LANES`** | Mid IMPL | Shared-program canopy/plume/transparent lanes collapse on-glass. |
| **`PQ-077` / `PERF-37-SHADOW-GLASS-SET`** | Near IMPL | Only casters that can fall on the visible table pay a depth pass. Live radius is `tableShadowCastRadius` (tilted glass + skirt); 280 is the no-camera fallback. |
| **`PQ-078` / `PERF-38-PRESENT-FUSION`** | Mid IMPL | One bloom/HDR present; extra AA only if present is the pole. |
| **`PQ-079` / `PERF-39-BUFFER-POLICY`** | Mid IMPL | Instance/batch buffers do not hitch-grow or leak VRAM. |
| **`PQ-080` / `PERF-40-TABLE-CADENCE`** | Mid IMPL | 60 Hz is the table and the fight; off-table owners sleep. Traffic/bark use `tableSimAuthorityWuFromState` (requested zoom + settings FOV + fixed 48:9, not liveZoom/viewport). Hostiles stay awake. |
| **`PQ-081` / `PERF-41-SNAPSHOT-FENCE`** | Mid IMPL | Present reads a dense snapshot, not live entity objects. |
| **`PQ-082` / `PERF-42-SIM-WORKER`** | Long IMPL | Sim tick on another core; implements `PQ-043` when sim is the pole. |
| **`PQ-083` / `PERF-43-WASM-SIM-ISLAND`** | Long IMPL | One hot CPU island in Rust/WASM; snapshot in/out; not Three.js. |
| **`PQ-084` / `PERF-44-PHYSICS-SLEEP`** | Mid IMPL | Far Rapier bodies sleep; table collisions stay authoritative. |
| **`PQ-085` / `PERF-45-PLACE-SHELL`** | Mid IMPL | Large places decode a table-visible shell first. |
| **`PQ-086` / `PERF-46-TEXTURE-RESIDENCY`** | Mid IMPL | Off-glass maps evict; on-glass maps never thrash. |
| **`PQ-087` / `PERF-47-AUTOSAVE-HITCH`** | Mid IMPL | Autosave cannot occupy a display callback. |
| **`PQ-088` / `PERF-48-HUD-AUDIO-CADENCE`** | Mid IMPL | HUD/audio do not full-tick hidden or off-glass work. |
| **`PQ-089` / `PERF-49-WEBGPU-BACKEND`** | Long IMPL | Same game on WebGPU with WebGL rollback. |
| **`PQ-090` / `PERF-50-NATIVE-PRESENT`** | Long IMPL | Native present slice on the same snapshot/input/save. |
| **`PQ-091` / `PERF-51-RUST-ISLANDS`** | Long IMPL | Further Rust/WASM islands; full engine rewrite only as a `PQ-090` successor. |
| **`PQ-092` / `PERF-52-ELECTRON-PRESENT`** | Mid IMPL | Electron hitch/p95 matches the browser on the same save. |
| **`PQ-093` / `PERF-53-SHARED-ARRAY-SNAPSHOT`** | Long IMPL | Worker/WASM publish through SharedArrayBuffer. |
| **`PQ-094` / `PERF-54-POLE-SWEEP`** | Standing | Recurring census; mint new reserved leaves when a pole has no plan. |
| **`PQ-095` / `PERF-55-SKY-ON-A-TABLE`** | Near INV→IMPL | Sky/parallax/deep-field cost what a tabletop uses. |
| **`PQ-096` / `PERF-56-EVENT-LIGHT-CARDINALITY`** | Mid INV→IMPL | Event lights do not bake extra program variants. |
| **`PQ-097` / `PERF-57-BLOOM-RESOLVE`** | Mid INV→IMPL | Cheaper bloom/HDR at the same halo. |
| **`PQ-098` / `PERF-58-SPEEDLINE-OFFTHREAD`** | Mid INV→IMPL | Boost lines do not hitch the 3D present. |
| **`PQ-099` / `PERF-59-SCENE-GRAPH-FLATTEN`** | Mid INV→IMPL | Matrix/child walks do not scale with off-glass graphs. |
| **`PQ-100` / `PERF-60-ORIGIN-REBASE-HITCH`** | Mid INV→IMPL | Floating-origin rebase is not a hitch. |
| **`PQ-101` / `PERF-61-CATCHUP-SPIRAL`** | Near INV→IMPL | One late frame does not cascade extra sim steps. |
| **`PQ-102` / `PERF-62-MENU-WORLD-UNLOAD`** | Mid INV→IMPL | Station/map/pause do not keep submitting the flight world. |
| **`PQ-103` / `PERF-63-DECODE-WORKER`** | Mid INV→IMPL | GLB/KTX2/Basis decode is off the present thread. |
| **`PQ-104` / `PERF-64-BINARY-SHADER-CACHE`** | Mid INV→IMPL | Repeat boots reuse driver program binaries. |
| **`PQ-105` / `PERF-65-AUDIO-TABLE-CULL`** | Near INV→IMPL | Audio follows the table, not a 900 WU horizon. |
| **`PQ-106` / `PERF-66-HOT-ALLOC-SHAPES`** | Mid INV→IMPL | Per-frame allocation is not the hitch owner. |
| **`PQ-107` / `PERF-67-STATE-CHANGE-SORT`** | Mid INV→IMPL | On-glass draws minimize program binds. |
| **`PQ-108` / `PERF-68-TINY-ONGLASS-LOD`** | Mid INV→IMPL | 30-pixel on-glass fighters are cheap; close ships stay full. |
| **`PQ-109` / `PERF-69-GL-CONTEXT-FLAGS`** | Near INV→IMPL | Canvas/GL flags add no hidden copy. |
| **`PQ-110` / `PERF-70-ANGLE-BACKEND`** | Mid INV→IMPL | Fastest legal ANGLE backend on this GPU. |
| **`PQ-111` / `PERF-71-PIXEL-PARITY-GATE`** | Near INV | Glass still-diff for every same-picture A/B. |
| **`PQ-112` / `PERF-72-THERMAL-NOISE`** | Standing | Noisy A/B pairs cannot pass a leaf. |
| **`PQ-113` / `PERF-73-PROD-PROBES-OFF`** | Near INV→IMPL | Production default pays no debug-probe tax. |
| **`PQ-114` / `PERF-74-IDLE-ADMISSION`** | Mid INV→IMPL | Next-contact compile in true idle, never stacked on rAF. |
| **`PQ-115` / `PERF-75-VFX-ONGLASS`** | Near IMPL | Trails/lights/flipbooks follow the table. Station-side, seam, NPC job-signature, loot-magnet, and NPC engine-trail draw use `tableVfxDrawWuFromState` (live glass), not a 1500/640/300/580/2200/3600 WU horizon. Loot-magnet trails keep a separate 580 WU player-centered tractor cap. Station-side, seam, NPC, loot-magnet, and NPC engine-trail glass culls use `tableLookAtDelta` (frame-local focus + frameOrigin). Station side-event planning anchors on `tableSimAuthorityWuFromState` plus that station type's farthest eligible mover path, not a 1400 WU horizon. Player and current-target trails stay full. |
| **`PQ-116` / `PERF-76-HDR-BUFFER-FORMAT`** | Mid INV→IMPL | Cheapest HDR target that keeps the default halo. |
| **`PQ-117` / `PERF-77-HIDDEN-SYSTEM-SKIP`** | Near INV→IMPL | Registry systems do not full-tick when 3D is hidden. |
| **`PQ-118` / `PERF-78-REPLAY-PERF-BISECT`** | Mid INV | A hitch is reproducible from input+seed. |
| **`PQ-119` / `PERF-79-TABLE-MAP-SPEC`** | Near IMPL | Off-table contacts stay map/radar facts, never live 3D. |
| **`PQ-120` / `PERF-80-TABLE-READABLE-REMASTER`** | Near INV→IMPL | Remaster budget goes to mid-scale openings that read at default zoom, not micro-greeble stacks. |
| **`PQ-121` / `PERF-81-VFX-FOCUS-ORIGIN`** | Near IMPL | Cosmetic VFX cull from the live look-at, not only the player pin, so a combat/tether camera shove does not drop on-glass lights. Seams, station lamps, NPC signatures, and loot-magnet glass checks share `tableLookAtDelta`. Tractor cap stays player-centered. Sim traffic/bark still use requested zoom. |
| **`PQ-122` / `PERF-82-TABLE-ASPECT-CLAMP`** | Near INV | If a live window is wider than three 16:9 panes, either letterbox the camera to that bound or accept that far side-edge civilians sleep. Do not grow sim authority back into a horizon. |
| **`PQ-123` / `PERF-83-INSTANCE-FAR-CULL`** | Near IMPL | Instance far cull follows the live camera table (`tableInstanceFarCullWu`), not a leftover 9000 WU horizon. Default covers the supported 90° / 330 WU 16:9 table as 3D camera distance. The 420 WU owner-sphere pad stays so a large on-glass station cannot vanish. Submit still drops off-table roots first. |
| **`PQ-124` / `PERF-84-HAIL-HUD-HORIZON`** | Near INV | Leftover `CONTACT_HAIL_RANGE` / scanner / HUD-overview `5200` is hail and radar range, not a 3D submit box. Do not shrink who the player can hail. The 5 Hz overview hypot is cheap. Only admit a leaf if a census names that list as a hitch; then keep hail gameplay and cull only 3D/VFX work. |
| **`PQ-125` / `PERF-85-REGION-CROSSFADE`** | Near INV | `REGION_CROSSFADE_WU = 1500` is the authored sector-boundary sky/ambient fade, not leftover mesh tax. Shrinking it would change when the next region reads. Do not touch unless a census names the fade math as a hitch. |
| **`PQ-126` / `PERF-86-NPC-TRAIL-TABLE`** | Near IMPL | NPC engine trails follow `tableNpcTrailTier` (live look-at + `tableVfxDrawWuFromState`). Leftover 2200/3600/2800 player-camera horizons are retired. Player and current-target ribbons stay full. Off-glass NPC ribbons are map facts. |
| **`PQ-127` / `PERF-87-NON-SUBMIT-HORIZONS`** | Near INV | Leftover large numbers that are **not** 3D submit: camera shake 1200, director threat compose 600, pair-frame 280, planet/sun sky dressing at 2800–6000 with parallax below the horizon, and the unused 300 NPC-signature comment. Live signature draw already uses the table. GPU timers and hitch rings stay default-off. Do not shrink these as a cull. |
| **`PQ-128` / `PERF-88-HEADLESS-VFX-TABLE`** | Near IMPL | Headless/no-camera VFX “on-screen” fallbacks follow `TABLE_HEARING_FAR_WU`, not a leftover 900 WU pin. Live play already projects to the camera. Doctrine-tell cues near the player still fire; off-table headless cues stay map facts. Do not shrink hail, missile-threat, or faction gameplay 900s. |

Every leaf uses the investigate → invalidate → implement loop in
`PERF_OPTION_SPACE.md` §3. Default order when no campaign is named: `PQ-061` → `PQ-062` → `PQ-063`
→ then §7 of that file. Long platform leaves wait until that table points at them, unless the owner
starts that campaign.

### 8.3 Exhaustive same-picture technique inventory

This is the full list of performance optimizations that may later be investigated or implemented.
Each line is a legal leaf under the parent in parentheses. Admit via `PQ-094` minting if it has no
row yet. Size of the job is not a reason to omit it. **Illegal** as a win: default quality cuts,
emptying the glass, camera-facing soft cards for fly-past objects, or editing sim goldens.

**Loop for every line:** measure the live pole → census glass / runway / beyond → **invalidate**
if it is not the pole, A/B worsens, pixels change, the stall moves, or copy costs more than it
saves → else implement the smallest leaf → tests of real functions → matched A/B → keep or revert.

#### Glass vs off-stage (this camera)

- Shrink query/cull margin from multi-screen to glass + measured approach seconds (`PQ-061`, `PQ-068`)
- Do not submit roots outside glass + runway (`PQ-068`)
- Do not LOD-resolve off-glass roots (`PQ-070`)
- Do not run shadow policy off-glass (`PQ-070`, `PQ-077`)
- Do not run damage/drive/site closures off-glass (`PQ-070`)
- Do not instance-pool or BatchedMesh plates that will not submit (`PQ-070`)
- Mesh prefetch/evict = top-speed × fraction of a second, not 5200/6400-as-horizon (`PQ-069`)
- Whole-sector stations/planets/fx are map facts until approach (`PQ-071`, `PQ-119`)
- Neighbor-sector meshes never constructed (`PQ-069`)
- Authored-upgrade prefetch follows approach, not sector (`PQ-075`)
- VFX/trails/lights/flipbooks only on-glass + runway (`PQ-115`)
- Audio voices follow table hearing, not 900 WU (`PQ-105`)
- Layers / bitmasks so off-glass graphs are not in the walk (`PQ-099`)
- Scissor / viewport to the glass if a leftover pass still covers unused pixels (`PQ-078`)
- On-glass tiny-contact LOD (30 px fighter cheap; 120 px full) (`PQ-108`)
- Pixel-floor remaining VFX under N px (`PQ-115`)
- Skip decals / greebles / nav-light meshes under N projected px (`PQ-108`, `PQ-053`)
- Freeze animation/morph/skin off-glass (`PQ-070`)
- Sleep Rapier bodies off-table (`PQ-084`)
- Sleep AI/perception/path off-table; hostiles on-table stay 60 Hz (`PQ-080`)

#### Submit / GPU state (on-glass)

- Material-keyed instancing and BatchedMesh for rigid opaque (`PQ-052`)
- Separate legal lanes: canopy, plume, decal, ribbon, sprite, beam (`PQ-076`)
- Multi-draw / `WEBGL_multi_draw` (`PQ-052`)
- Indirect / multi-draw-indirect / count buffers (`PQ-059`, `PQ-089`)
- GPU compaction of instance lists (`PQ-059`)
- Texture arrays / atlas for same-role maps (`PQ-089`)
- Bindless / bindless-like grouping when WebGPU (`PQ-089`)
- Program-bind sort; optional front-to-back opaque (`PQ-107`)
- Reduce Three.js light/program churn; exact light cardinality (`PQ-096`)
- VAO reuse; avoid per-draw attribute setup (`PQ-076`)
- UBO / uniform packing vs many setUniform calls (`PQ-089`)
- Avoid geometry shaders / tessellation on this path (`PQ-064` census)
- 16-bit indices; quantized positions/normals; oct normals; half-float verts (`PQ-037`, `PQ-079`)
- Quantized instance matrices / quaternion+scale (`PQ-079`)
- Persistent / orphan / unsynchronized buffer maps (`PQ-040`, `PQ-079`)
- Ring buffers for dynamic ranges (`PQ-040`)
- Don’t grow BatchedMesh on the present beat (`PQ-079`)
- Shadow set = glass + skirt; cheaper PCF/ESM/VSM only if stills match (`PQ-077`)
- Cached static shadow for unmoving casters; atlas packing; one cascade (`PQ-077`)
- Contact/blob shadows only where directional cannot matter (`PQ-077`)
- Skip receiveShadow on transparents (`PQ-077`)
- Overdraw / fill-rate census; limit transparent layers (`PQ-063`, `PQ-076`)
- OIT / weighted blend / dithered alpha / A2C only if picture holds (`PQ-076`)
- Force single-pass canopy (already a policy) (`PQ-076`)
- Visibility buffer / deferred / forward+ / clustered lights — INV only (`PQ-067`, `PQ-089`)
- Depth prepass — INV only; close with no-mutation if not a net win (`PQ-078`)
- Occlusion / Hi-Z / small-primitive cull — INV; likely weak on a table (`PQ-061`)
- Meshlets / cluster LOD / virtual geometry — Long, same picture (`PQ-089`, `PQ-090`)
- Virtual / sparse / streamed textures (`PQ-086`)
- Format pick: BC7 / ASTC / ETC2 / UASTC / ETC1S per GPU (`PQ-055`, `PQ-086`)
- Anisotropy / mip bias only off-glass or if stills match (`PQ-086`)
- Skip mipgen when mip chain exists (`PQ-074`)

#### Present / post / HDR

- One bloom/HDR path; canvas MSAA dead behind it (`PQ-056`, `PQ-078`)
- Bloom resolve: fewer mips, dual-Kawase, half/quarter res, Karis — stills must match (`PQ-097`)
- HDR target: HalfFloat vs R11G11B10 vs RGBM (`PQ-116`)
- Memoryless / transient / aliased / pooled render targets (`PQ-078`)
- Don’t store unused attachments; correct load/store (`PQ-078`)
- Compute bloom / async compute when WebGPU (`PQ-089`, `PQ-097`)
- Grain/vignette/grade/LUT cost; skip identity ops (`PQ-078`)
- Optional SMAA/FXAA/TAA only if present is the pole and stills keep (`PQ-078`)
- FSR/XeSS/dynamic res are **illegal** as a default quality cut; INV only if same internal res (`PQ-078`)
- AO/SSGI/SSR/volumetrics/DoF/motion-blur/godrays — INV; do not add passes to “optimize”
- Speed-lines: stroke cache, OffscreenCanvas worker, GPU polyline (`PQ-098`)
- Canvas flags: `alpha:false`, `preserveDrawingBuffer:false`, `desynchronized`, `powerPreference` (`PQ-109`)
- ANGLE backend D3D11/D3D12/Vulkan (`PQ-110`)
- Mailbox vs FIFO vs low-latency swap (`PQ-092`)
- Exclusive fullscreen / compositor copies in Electron (`PQ-092`)

#### Admission / first use / hitch

- Exact-key dummy prewarm (lights, HDR, batching, shadow depth) (`PQ-072`)
- One new program per present after present; never whole-root on rAF (`PQ-054`, `PQ-072`)
- `KHR_parallel_shader_compile` / own readiness timer (`PQ-054`)
- Binary program cache / WebGPU pipeline cache (`PQ-104`)
- Idle/`scheduler.yield` admission **after** present; never `setTimeout(0)` on the next rAF (`PQ-114`)
- Next-contact warm from traffic intent (`PQ-075`)
- Compose yield between parts; merge cache; no sync compose on combat thread (`PQ-073`)
- Upload after present; one tex/buffer per beat (`PQ-074`)
- Decode GLB/KTX2/Basis/meshopt/Draco on a worker (`PQ-103`)
- `createImageBitmap` / ImageBitmap (`PQ-103`)
- Autosave slice / after-present / worker serialize (`PQ-087`)
- Floating-origin rebase dirty-only (`PQ-100`)
- Catch-up cap so one hitch does not force extra sim steps (`PQ-101`)
- Context restore retries, force-new-context, named terminal park (`PQ-051`)
- Opening cohort watermark; late roots cannot extend it (`PQ-054`)

#### Scene graph / CPU prep

- `matrixAutoUpdate` off for static children (`PQ-099`)
- Flatten merged station/place graphs (`PQ-099`)
- Don’t `updateMatrixWorld` the off-glass tree (`PQ-070`, `PQ-099`)
- Presentation snapshot / SoA columns; no entity-object walk on present (`PQ-081`)
- Dirty journals / bitsets / monomorphic hot functions (`PQ-106`)
- Pool events, avoid per-frame `{}` / strings (`PQ-106`)
- Event-bus coalesce; no unbounded journals (`PQ-106`)
- Skip registry systems when 3D is hidden (`PQ-117`)
- Unload or freeze flight world in station/map/pause (`PQ-102`)
- Production default: probes/timers/debug traversals off (`PQ-113`)

#### Simulation / AI / physics

- Tick-quantize inactive owners (`PQ-057`, `PQ-080`)
- Spatial hash / dirty broadphase; don’t rebuild every tick if unchanged (`PQ-039`, `PQ-080`)
- Query/candidate work scales with the table (`PQ-039`)
- Rapier island sleep; solver iterations scale with the table (`PQ-084`)
- Time-sliced path / steering / perception (`PQ-080`)
- Sim Worker after snapshot fence (`PQ-082`, `PQ-043`)
- WASM/Rust island for queries, scheduler, snapshot pack, traffic — not Three.js (`PQ-083`, `PQ-091`)
- SharedArrayBuffer snapshot; measure copy vs gain (`PQ-093`, `PQ-067`)
- SIMD / bulk-memory / threads in WASM (`PQ-083`)
- Determinism lab before any cadence change (`PQ-066`)

#### Assets / I/O / boot / long session

- Immutable / ETag / content-hash cache (`PQ-055`)
- Brotli for code/text; don’t recompress GLB (`PQ-055`)
- HTTP range / packaged-file transport if a boot trace asks (`PQ-055`)
- Place/ship opening shell + later detail (`PQ-085`)
- Texture residency / evict off-glass without thrash (`PQ-086`, `PQ-058`)
- GPU/CPU byte budgets; previous-sector warmth (`PQ-058`)
- Code-split menus vs flight; V8/Electron bytecode cache (`PQ-055`, `PQ-092`)
- Service worker only if it helps warm launch (`PQ-055`)
- COOP/COEP if SAB is chosen (`PQ-093`)

#### Audio / HUD

- Voice cull to the table (`PQ-105`)
- HRTF/convolution/reverb only if cheap or off-glass silent (`PQ-105`)
- Decode/resample off the present thread (`PQ-103`, `PQ-088`)
- HUD: one rAF-aligned write; virtualize lists; contain/layout isolation (`PQ-088`)
- MSDF/atlas vs DOM for hot numbers if DOM is the pole (`PQ-088`)
- Don’t run full HUD/audio when overlays are hidden (`PQ-088`, `PQ-117`)

#### Platform / language / engine (large jobs stay listed)

- WebGPU backend + rollback (`PQ-044`, `PQ-089`)
- Render bundles, GPU cull, meshlets (`PQ-059`)
- Native present slice, same snapshot/input/save (`PQ-060`, `PQ-090`)
- Further Rust islands; full engine (Bevy/Fyrox/custom) only as `PQ-090` successor (`PQ-091`)
- Electron GPU process, vsync, swap, hardware accel, process priority (`PQ-092`)
- OffscreenCanvas / WebGL-in-worker for overlays only (`PQ-098`)
- Dual-queue / copy-engine / timestamp queries on WebGPU (`PQ-089`)

#### Sky / background (tabletop-priced)

- Starfield / parallax / deep-field / sky planets cost what a table uses (`PQ-095`)
- Don’t update sky animation off-glass or when paused (`PQ-095`, `PQ-117`)
- Background stars remain the only camera-facing exception (`PQ-095`)

#### Lighting / variants

- Event-light pool cardinality matches compile (`PQ-096`)
- Intensity-only flashes; don’t add/remove visible lights mid-fight (`PQ-096`)
- IBL/PMREM size; rebuild off the present beat (`PQ-072`, `PQ-054`)
- Env / SH / probes only if they don’t add first-use keys (`PQ-064`)

#### Measurement / scaffolding (not outcomes)

- Glass-band census (`PQ-061`)
- Hitch owner ring (`PQ-062`)
- Phase + GPU timers on the real bloom path (`PQ-063`)
- Shader-key dump (`PQ-064`)
- Alloc/GC/VRAM soak (`PQ-065`)
- Hash pair lab (`PQ-066`)
- Platform spike matrix + interop bench (`PQ-067`)
- Glass still-diff parity gate (`PQ-111`)
- Thermal/clock pair discard (`PQ-112`)
- Replay + seed hitch bisect (`PQ-118`)
- Shell pair Browser vs Electron (`PQ-092`)
- Restore/TDR drill (`PQ-051`)
- Spector / RenderDoc / PIX / Intel GPA / Chrome trace / GC (`PQ-063`, `PQ-065`)
- Pole sweep that mints missing leaves (`PQ-094`)

A line with no parent yet is minted under `PQ-094` rather than invented ad hoc. Investigation-first
is the default. Implementation is only what a census selected and an A/B kept.

### 8.4 Hitch campaign (`PQ-129`) — admitted execution order

`PQ-051`–`PQ-128` remain reserved catalog identities. They do not dispatch until a campaign
admits them. **`PQ-129` is that campaign** for the owner-visible hitching problem.

Law: [`design/program/PERF_HITCH_CAMPAIGN.md`](./design/program/PERF_HITCH_CAMPAIGN.md).
Packet: [`design/program/roadmap/active/PQ-129.md`](./design/program/roadmap/active/PQ-129.md).
Dispatch: `node scripts/program-dispatch.mjs --id PQ-129`. `--next` still returns `PQ-050`.

**2026-08-20 headed Electron witness (Intel iGPU, real GPU, not SwiftShader):** Continue/new-game
flight verdict was hitching. Eight of the last eight samples were hitches. Biggest bucket
presentation (tail p95 ~99 ms, max ~515 ms). First-flight admission max ~2 s; one present max
~13 s. Shader programs still linked during the fly. Lifecycle reported `foreground-occluded`
(probe confounder for steady time, not for multi-second bricks). Live reviews the same day:
sync `buildComposedShip` still runs in flight via the empty-slot exception; hitch classifier is
default-off; off-glass 3D horizons are mostly retired; crowded p95 is still GPU submit once
bricks die; sim is not the hitch owner.

**CONFIRMED THE SAME DAY BY AN INDEPENDENT CLEAN-MACHINE RUN.** The first reading below was taken while a delegated lane was still live, so it was flagged as unconfirmed. **The reason given for that flag was wrong and is corrected here:** I read the frame-interval vs callback-interval disagreement (mean -220.4 ms) as a contention signature. It is not — the two quiet baseline runs show -259.6 ms and -234.4 ms, so that disagreement appears in EVERY run and is an artefact of how the witness measures, not evidence of a busy machine. **Do not use it to judge whether a run was contended.** A second lane then measured the same route twice on a quiet machine before changing anything, and **reproduced the brick**: `presentation` p95 **5.5 ms** / max **3237.5 ms**, 787 frames, **13 hitches**. Two independent runs, one contended and one not, both find a ~3.2-3.6 s stall at `stage entering-flight`. **The brick is real.** It is also highly REPRODUCIBLE — the two quiet runs peak at 3237.5 ms and 3248 ms, within 10 ms of each other on a 3.2 s stall, so an A/B against it is meaningful rather than chasing noise. Prefer the clean figures (p95 5.5, max 3237.5, 13/787 hitches) over the contended ones below.

**2026-08-23 gate reading (same instrument, same machine, real Intel GPU — `npm run probe:runtime-witness`, New Game seed 47, 20 s).** Wave C says *promote only after hitch count is halved or the classifier names that owner*, so this is the measurement that decides whether `.11`-`.18` dispatch at all. **Waves A and B are all ten DONE.** What the witness now sees:

- **Steady state is no longer the problem.** `presentation` p95 **5.8 ms**, `render` p95 4.4 ms, `sim` p95 4.5 ms, 182 draw calls. That is comfortably 60 fps with headroom.
- **One brick remains, and it is at `stage entering-flight`.** `presentation` max **3610 ms**, `render` max 3609 ms, `bloomScene` max 3607 ms. Read the distribution, not the average: 180 `bloomScene` samples with p95 5.1 ms but avg 22.9 ms means a SINGLE sample carries ~87 % of the total. This is one event, not a slow renderer. The 2026-08-20 baseline's *"one present max ~13 s"* is down to ~3.6 s but is not gone.
- 815 frames, 17 hitches, named coverage 0.824; owners bloom 8, unknown 3, sim 2, externalScheduling 2, present 1, vfx 1.
- Opening cost: 43 textures / 55.6 ms blocking upload; scene delta programs 40->41, geometries 19->39, textures 20->58.
- Also caught, unrelated to hitching: a **404 during ordinary flight**, and a shader warning (`use of potentially uninitialized variable (f_surfaceColor)`).

**2026-08-23 — THE GATE IS ANSWERED, AND WAVE C IS NOT WHAT THIS MACHINE NEEDS.**

Waves A and B are all ten done. Measured on a real Intel GPU with the campaign's own instrument:

- **Steady state already holds 60 fps.** presentation p95 **5.5 ms**, 182 draw calls, 15 hitches in
  830 frames. Wave C is "crowded 60 fps" work; the crowd is not the problem here.
- **One brick remains: ~3.2-3.7 s at entering-flight**, with the player in control. Four runs:
  3164, 3237, 3291, 3654 ms. That is Wave B's *kill bricks* business, not Wave C's.

**The obvious fix for it was built, measured, and REJECTED** — recorded here so it is not retried
blind. Moving authored compose off the display callback during flight, clean A/B, instrument held
constant, two runs per arm (p95 / max ms / hitches per frames):

| arm | run 1 | run 2 |
|---|---|---|
| with the change | 6.7 / **10** / **80** of 760 | 7.5 / **3164** / 14 of 849 |
| without | 5.5 / 3291 / 15 of 830 | 5.8 / 3654 / 15 of 819 |

It is **unreliable** — it killed the brick in one run of two, because the gate reads `mode` at
SCHEDULE time and a compose queued just before handover still takes the old path. And when it did
apply it took hitches from 15 to 80, which **this table's own promotion law forbids**. A prior
attempt had left a warning ("the scheduler must not turn some hitches into a 30 fps floor"); the
attempt deleted it, and it is now restored on `scheduleUpgradeFrame` with these numbers beside it.

**Next attempt should defer only the ONE huge first compose, not every flight upgrade frame** — the
display callback is right for the queue and wrong for that single job — and must gate on something
that cannot race flight handover. Do not promote `.11`-`.18` on the strength of this brick.

**2026-08-23, LATER THE SAME DAY — THE CAUSE IS NAMED, AND BOTH EARLIER GUESSES WERE WRONG.** The
instrumentation committed with the rejection immediately paid for itself. It logs what changes
whenever the bloom scene pass exceeds 80 ms:

```
[GPU brick] bloomScene 3229.3ms  programs 63 -> 70   geometries 116 -> 116   textures 127 -> 127
[GPU brick] bloomScene  806.6ms  programs 45 -> 47   geometries  55 ->  60   textures  60 ->  60
```

**Seven shader programs link inside a single scene render, ~460 ms each.** Geometry count does not
move; texture count does not move. **It is not upload, and it is not compose** — it is the first
DRAW of materials whose program has never been linked. `KHR_parallel_shader_compile` is absent on
this Intel/ANGLE part, so every link is a blocking wait.

That retires the "defer the first compose" hypothesis above: compose was never the cost. The opening
path already works (`exact opening plan: complete; admitted programs 3`); **the gap is everything
admitted AFTER the opening** — an NPC entering the glass mid-flight brings materials no opening plan
ever saw, and they link on first draw. The fix is to route those through the same precompile /
admission path the opening uses, spread across frames because parallel compile is unavailable here.
`precompile.js`, `pipelineReadiness.js` and `admissionSliceBudget.js` already exist for this shape.

**2026-08-24 (LATER) — THE BRICK IS FIXED, AND WAVE C's GATE IS NOW OPEN.** Opening GPU admission
(`e7c6dffd`) gets the opening's programs linked and geometry uploaded before the first presented
frame. Re-measured independently on a quiet machine, twice:

| | before | after |
|---|---|---|
| worst frame | 3237-3654 ms | **5-6 ms** |
| presentation p95 | 5.5 ms | **3.1 ms** |
| hitches | 13-15 of ~800 | **1 of ~1215** |
| `[GPU brick]` lines | several per run | **none** |

Typical frames got FASTER, so nothing was traded. **Hitch count 13 -> 1 clears the promotion law
("promote only after hitch count is halved") by a wide margin**, which is the law attempt 1 died on.

**But read what that means before dispatching `.11`-`.18`.** Wave C is *crowded 60 fps* work. The
machine now holds **p95 3.1 ms** — roughly a 5x margin on a 16.7 ms frame — with one hitch in 1,215
frames. The gate opening does NOT establish that the crowd is a problem; it establishes that the
brick that made everything look like a problem is gone. **Re-measure the actual crowded case before
admitting any of `.11`-`.18`, and close as no-op whatever the measurement does not justify.** §8.2's
own rule applies: these are reserved identities, and a plan is legal only if the player-facing game
is unchanged.

Still open, deliberately out of scope for that job: Continue/load logs two ~730 ms bricks
(programs 14 -> 17, geometries 13 -> 19). New Game is clean.

**2026-08-24 — THE COMPILE-ON-ADMISSION FIX DID NOT REMOVE THE BRICK. Measured, not assumed.**
Two runs on a quiet-ish machine (one UI lane, no GPU work):

```
run 1   p95 6.1   max 3387   hitches 28 of 923
run 2   p95 8.4   max 3173   hitches 17 of 902
baseline p95 5.5  max 3237-3654  hitches 13-15 of 787-830
```

The max is unchanged. **What DID improve is the part the instrumentation catches**: the logged
`[GPU brick]` events fell from 3229 ms / +7 programs to ~215 ms / +3 programs. So late admission is
compiling *something* earlier — it is simply not the thing that costs 3.2 s.

**And the 3.2 s is still inside `bloomScene`** (`bloomPhases` 180-sample max 3167.6 ms) while the
`[GPU brick]` warning never fired for it. That is an INSTRUMENTATION BLIND SPOT: the warning is gated
on `renderWorkEnabled`, and the costly event lands outside the window where that gate is true. **Fix
the blind spot before the next attempt** — three rounds have now been aimed by partial evidence, and
each time the evidence that was actually available pointed slightly wrong.

Also note `hitches` rose (13-15 → 17-28) and `p95` rose (5.5 → 6.1/8.4). Those runs were contended
by one active lane, so the rise is NOT established — but PQ-129's promotion law makes a hitch rise
disqualifying, so this needs a clean A/B before the change is defended, not after.

**This is why the instrumentation was kept when the fix was reverted.** One 20-second run then named
in a single line what two rounds of reasoning had guessed wrong twice.
**Reading:** the classifier DOES name an owner, so the gate's second clause is satisfied — but the honest conclusion is that Wave C's crowded-60-fps work is not what this machine needs next. Steady state already holds 60 fps; the remaining owner-visible cost is one ~3.6 s freeze entering flight, which is Wave B's *kill bricks* business, not Wave C's. Chase the brick before promoting `.11`-`.18`.

**The instrumentation was then extended to name the programs, and that narrowed it again.** Counts
said a brick happened; identities say which spawn caused it. The seven are one `depth,…` program plus
six `physical,STANDARD,…` variants differing only in which UV/map channels are bound — i.e. authored
SHIP materials. The smaller 843 ms brick adds two more map-less `physical` variants alongside
+5 geometries.

Two consequences:

1. **It is a PREDICTION MISS, not a missing mechanism.** `shipSpecsForSector` in
   `src/render/precompile.js` compiles a predicted population — traffic roles, ONE enemy pool chosen
   by `security`/`tier` via `enemyPoolForSector`, plus a boss if a `poi_boss` exists. Anything that
   spawns outside that prediction (another pool, a faction squad, a mission or story spawn) reaches
   its first draw uncompiled.
2. **One of the seven is a DEPTH program** — the shadow-map variant, a separate program from its
   colour twin. `SF_Precompile_ShadowDepth_KeepAlive` already exists for exactly this class, so that
   variant is escaping it.

So the fix is either to compile on ADMISSION (the ship is admitted before it is drawn; the seam is
`createPipelineAdmissionTracker` in `pipelineReadiness.js`) or to stop the prediction from missing.
Compiling on admission is preferred: broadening the prediction pays the cost for ships that may never
spawn, and the opening budget is already spoken for.


| Wave | Leaves | Reserved work | Player outcome |
|---|---|---|---|
| **A · name it** | `.01`–`.03` | `PQ-061` census, `PQ-062` live hitch classifier, `PQ-063` phase timers | Every >32 ms frame has a named owner on the real present path |
| **B · kill bricks** | `.04`–`.10` | `PQ-073` compose slice, `PQ-075` next-contact, `PQ-064`/`PQ-072` shader keys, `PQ-074` upload, `PQ-054` leftover admission, `PQ-101` catch-up | First hostile and Continue no longer drop 40–250+ ms bricks |
| **C · crowded 60 fps** | `.11`–`.18` planned | `PQ-068` submit, `PQ-052` batching, `PQ-076` lanes, `PQ-108` tiny LOD, `PQ-080` cadence, `PQ-097` bloom-if-pole, `PQ-087` autosave, `PQ-094` sweep | Promote only after hitch count is halved or the classifier names that owner |

Illegal here: default quality cuts, headless hitch-budget as acceptance, replaying the rejected
BatchedMesh candidate, starting Worker/WebGPU because Wave B is hard, shrinking hail 5200 as a
cull.

### 8.5 Open defect — a valid ship asset is rejected at load and NOTHING is drawn

**2026-08-23. `check:playable` passes 15/15 while warning that a ship renders as nothing.**

```
[partsLibrary] authored composition failed; no substitute visual published
Error: release mode requires .../wholeships/ashline_rig.glb for ship_wasp;
       it did not pass the live authored-asset loader
```

"No substitute visual published" means an **invisible enemy**. It is player-visible and was
untracked; no asset check flags it, and `check:playable` reports it as a WARNING and still passes —
the exact "a green check is not proof" pattern this document warns about.

Already ruled out, so nobody redoes it: the file is **not missing** (7,867,164 bytes, tracked) and
**not corrupt** (valid GLB, version 2, declared length == actual, JSON 55696 + BIN 7811440). It is in
`PACKAGED_LIVE_WHOLE_SHIP_FILES` and in `release_manifest.json` with the same entry count as its
sibling `ashline_dart.glb`, which loads fine. **The rejection is a live-loader policy, not the file.**

**The mapping lead was chased and DISPROVEN — do not repeat it.** `wholeShipVisualForEntity`
always takes the file and the assetId from the SAME map, so no cross-map mismatch is possible. The
four hostile ids that use `ashline_rig.glb` (`reaver_pirate`, `mine_layer_jackal`, `corsair_raider`,
`tether_control_raider`) all resolve to `SF_WHOLESHIP_ASHLINE_RIG`, and every one of the 12 hostile
file entries has a matching assetId — zero missing.

**So the record is simply not in `records` at lookup time.** `resolveRequiredWholeShipRecord`
(`partsLibrary.js:1365`) throws when no loaded record ends with the wanted file. The asset is
listed in `spawnableShipArchetypePrewarmUrls()`, so the sector prewarm is supposed to cover it —
which makes this a **prefetch/timing** defect, not a data-mapping one. The next step is to capture
the untruncated error, whose tail lists the whole-ships that DID load; that list is the evidence.

The fix must also add a check that **FAILS** when a whole-ship required by a live entity does not
load and no substitute is published. This class currently reports as a passing warning, which is
precisely why it survived.

## 9. Documentation and instruction hygiene

Documentation has a declared lifetime:

- `STABLE` files route and define durable contracts; they contain no live snapshots.
- `DURABLE` files preserve long-lived research, evidence, or rationale. They may inform planning,
  but never grant a lease, dispatch authority, acceptance, or priority over an admitted packet.
- `VOLATILE` files contain current mutation/status facts, a refresh base, and an expiry condition.
- `ACTIVE_PACKET` files guide one admitted packet and retire into evidence when done.
- `GENERATED` files are rebuilt from code.
- `HISTORICAL` files can explain a decision but cannot direct implementation unless explicitly reactivated.

An agent's preference is not a repository rule. New automatic instructions or checks are admitted only when they protect determinism, save compatibility, state ownership, security, accessibility, licensing/provenance, a measured performance invariant, or a demonstrated player-facing contract. Do not fossilize taste through CSS-property bans, palette allowlists, fixed technique counts, arbitrary geometry ceilings, source-string scans, or “never do X” prose that lacks an observed failure.

Run `node scripts/check-program-docs.mjs` after changing the program control surfaces.

## 10. Checkoff

The agent that finishes a unit updates that unit's packet checklist, receipt, queue row, and shared
status in the same bounded transaction after verifying the exact candidate revision. No separate
coordinator is required. A named human or independent-review gate remains a separate task only when
the packet explicitly requires that evidence.

A receipt must say what changed, what passed, what route was observed, what performance profile was measured, what remains unproven, and which follow-ups were deliberately excluded. “Tests pass” is not a substitute for those facts; neither is a screenshot a substitute for simulation truth.

## 11. The frontend is the strategic half of the game

The screens and the HUD are not connective tissue between the fun parts. They are where the player
understands the world, understands their ship, and decides what to do next. Owner direction,
2026-08-15:

> "The frontend screens and HUD **ARE** the gameplay… the home of the strategic experience that's
> symbiotic with the fast combat and spaceflight and keeps it grounded and understood. The map,
> menus, everything… The player needs to be able to understand the systems of the game through these
> screens, and understand the world outside the immediate view by the map, their ship by the ship
> menu."

> "I keep having agents working on the frontend and it's very cheap and uninspired… the moment to
> moment experience is weak right now partially because of the frontend and menu experiences."

**Design authority for every 2D surface is [`design/frontend/`](./design/frontend/README.md).**
Read [`INSTRUMENT_GRAMMAR.md`](./design/frontend/INSTRUMENT_GRAMMAR.md) before designing or building
any screen; it is binding.

### 11.1 Why frontend work keeps coming back cheap

It is a **specification** failure, not a talent failure. "Make the ship screen good" produces slop
from any author, human or agent. The grammar removes the guesswork — type roles with a hard 12 px
floor, colour assigned by meaning, a motion contract, one layout skeleton, three disclosure tiers,
and class-naming rules that survive the accessibility sanitisers. A per-screen document then only
supplies the *idea*, because everything else is already decided.

Three rules carry most of the weight:

1. **Screens differ by centerpiece and manipulation verb, never by styling.** The Ship is a *stage
   you orbit*; the Chart a *table you push things around on*; the Footprint a *board you trace*; the
   Range a *box you play in*. **If two screens share a silhouette, one of them has no idea in it.**
2. **No motion ships without a named state variable behind it.** Overshoot amplitude is your hull's
   inertia; power beams reverse when you overdraw. Anything that cannot name its variable is
   decoration and is cut in review.
3. **The UI never invents.** Explanatory phrases come from an enumerated bank; an unknown tag renders
   *nothing*. Already the discipline in `src/ui/causeLedger.js`; promoted here to house law.

### 11.2 The finding that sizes the work

**SpaceFace is a very large simulation with almost no windows into it.** Verified by audit of every
system in `src/systems/` and dataset in `src/data/`, cross-checked by reverse-import map, `state.*`
subtree grep, and event emit ∩ subscribe:

| Running now | What the player sees |
|---|---|
| **183 KB** of NPC careers (hauler, miner, salvor, surveyor, patrol, tender) with full phase machines | `state.npcJobs` read by **0 UI files** |
| **350 KB** of traffic simulation moving real prices — the largest file in the repo | `state.traffic` read by **0 UI files** |
| **124 KB** encounter director deciding what attacks you and when | no read on accumulating danger |
| **78 KB** law system — incidents, witnesses, warrants, custody, sanctuary | a **5-second banner** |
| **73 KB** claims — 15 sites, 6 buildable modules, raids, defenses | undifferentiated dots on a map |
| **53 KB** surrender & custody — capture, prisoners, escape | **a mercy outcome is indistinguishable from a kill** |
| **28 KB** ace memory — 12 named pilots who remember your fights and adapt | **nothing ever names them** |

> **Spot-checked 2026-08-23, and the table has partly aged. Verify a row before acting on it.**
> Three rows were re-tested against the current tree: traffic is now read by three UI files
> (`commsRadial`, `dockArrival`, `worldSiteMapLayer`), so "read by 0 UI files" is stale; and a
> mercy outcome is no longer indistinguishable from a kill — `combatOutcome` speaks four distinct
> lines ("fled the fight", "disabled; capture window open", "surrendered", "destroyed").
> The ace-memory row is stale too, and I got that wrong on the first pass: a returning ace speaks
> its own name (`"<name>: you should have finished me."`), sets `ai.name` on every ship it
> spawns, and `src/ui/targetPanel.js` reads `ai.name` — so targeting one shows who it is. My
> first grep searched for `ace`-shaped identifiers and missed the field the UI actually reads.
> All four rows re-tested have aged, which makes the point below stronger, not weaker.
>
> This is a diagnosis from a point in time, not a live status board. Rebuilding something that
> already exists because a row still says it does not is the failure mode to avoid here — the same
> one that left §13 claiming the arcade structural FX had zero consumers long after it had four.
| `player.bounty`, which decides who hunts you | appears in **zero** UI files |
| `getDerivedStats` returns **~35** ship fields | the ship screen shows **6** |
| Living hull already accrues kill tallies, patches, scorch, grime, graffiti | its only UI reader is **dead code** |
| Five physics powers already bound to keys `4`–`8` | `clearingCone` / `skimCollector`: **zero** HUD refs |

**The MMO depth the owner asked for does not need inventing — it needs revealing.** This is also the
literal answer to *"I can't look at the HUD and see the big game that it will become"*: the game is
already bigger than the HUD admits.

### 11.3 The surface manifest

Four instruments, one non-pausing quick tier, the docked station, and the meta layer. **Everything in
the invisible-simulation inventory is absorbed into one of these — four surfaces, not twenty screens.**

| Surface | Key | Archetype · verb | Absorbs |
|---|---|---|---|
| **THE SHIP** | `F2` | a stage you **orbit** | condition, living-hull scars, handling, energy budget, capability/tech, insurance |
| **THE CHART** | `M`/`N` | a table you **push** | economy pressure, risk, living-world traffic, live events, holdings, sector dossiers, history |
| **THE FOOTPRINT** | `F3` | a board you **trace** | crime, bounty, faction standing + spillover, ledgers, surrender outcomes, named rivals, titles |
| **THE RANGE** | `F4` | a box you **fly in** | systems teaching, recoverable onboarding, bestiary, weak points |
| **Verb wheel** | `Alt` held | non-pausing radial | Massline head, fleet orders, consumables |
| **Power Bar** | `1`–`9` | HUD, permanent | the number-key abilities — see §11.4 |
| **Docked station** | dock rail | 7 pinned destinations | market, contracts, industry, bar, factions, ledger, shipworks |
| **Meta** | — | — | title, pause, settings, save/load, codex, mission log, game over |

Owner ruling: **menus pause the world, Skyrim-style.** Full-depth full-viewport strategic screens in
flight are legitimate; the four instruments join `PAUSING_SCREENS`. Quick mid-combat verbs stay on
the non-pausing radial. Pause is for *thinking*; the radial is for *doing*.

### 11.4 The Power Bar

The owner's headline request — *"boxes for the different powers you could accumulate on the HUD,
activated by the number keys"* — is **already half-built at the input layer.** `src/systems/input.js`
`VERB_BINDINGS` binds `Digit4` Mass Seed · `Digit5` Well (pull) · `Digit6` Repulsor (shove) ·
`Digit7` Clearing Cone · `Digit8` Skim Collector. `Digit0` is brake, `Digit1`–`3` answer modal
prompts only, `Digit9` is free repo-wide. **Two of those five powers have zero references anywhere in
`src/ui/`.**

So the work is *surfacing what exists and defining how the rest of the bar fills*, not inventing an
ability system. An empty socket is a promise, not clutter; **a filling bar is the only progression
display that needs no explanation.** Slot map, states, and the hour-1/10/50 densification are
specified in [`SCREENS_A_FLIGHT.md`](./design/frontend/SCREENS_A_FLIGHT.md); a rendered prototype of
all three stages is in `_uilab.html`.

Icons follow [`ICON_PIPELINE.md`](./design/frontend/ICON_PIPELINE.md): one fixed style anchor and one
parameterised template, because the hard problem with an AI icon set is generating twenty that look
like **one set**. Generated raster is concept reference only — the shipped artifact is authored
24 × 24 `currentColor` stroke SVG, because `currentColor` carries ready/cooling/locked state and
`forced-colors` strips `background-image` outright. Sixteen ready-to-run prompts are committed at
[`design/frontend/icon-prompts/`](./design/frontend/icon-prompts/).

### 11.5 Sequencing

Phase 0 is not optional; every later phase depends on the shell and the motion contract, and doing it
late means rebuilding.

| Phase | Work | Payoff |
|---|---|---|
| **0 · Foundation** | **add the `--sf-you/foe/goal/calm/paper` role tokens to `styles/ui.css`** (they do not exist yet); **build the entity resolver** (id → dossier + label + route) that ideas 1/3/7 of `ADDITIONS.md` all share; screen shell with `onEnter`/`onExit` + per-screen backdrop; motion contract as shared helpers; adopt `uiPrimitives`; hover audio; type scale; add the four ids to `PAUSING_SCREENS`; **plus the A-list properties every screen must inherit rather than remember** — state memory, the empty/loading/error/denied state set, the responsive scalar (incl. the ultrawide HUD safe box), and text-expansion-safe layout primitives (see §11.7) | nothing visible — but every screen after is faster, consistent, cross-linkable, and does not fall over in pseudo-loc, on ultrawide, or when its data set is empty. **Retrofitting the tokens or the resolver into finished screens costs several times more than emitting them as you build.** |
| **1 · THE SHIP** | promote `shipEngineeringStage` into live shipworks; mount `handlingProfile` + `massDelta`; power budget with beam reversal; **living-hull scars projected onto the hull**; capability sentences | biggest visible win, mostly assembly of code that already exists |
| **2 · THE FOOTPRINT** | append-only `provenanceLedger` listening to already-emitted events; rap sheet + bounty; standing with spillover edges; queryable log; named rivals | the world visibly remembers what you did |
| **3 · THE CHART** | pressure flows; real risk in route ranking; living-world traffic layer; live events; holdings; sector dossiers; history | the world outside the window becomes legible and actionable |
| **4 · THE RANGE** | three drills first, not thirty; then bestiary and weak-point passes | the game finally teaches itself |
| **5 · HUD + Power Bar** | slot bar, capacitor headroom, contextual bands, retained craft rulings | sequenced late deliberately — this is where the live performance work sits |
| **6 · Station interiors** | flatten `station-workbench.css` with appearance held constant, **then** redesign | success test is "looks identical, file is half the size" |
| **7 · Cleanup** | retire ~10,780 lines of dead station UI after repointing `check-ui-screen-imports.mjs` and `check-command-deck-ui.mjs` at `src/ui/station/` | both checks currently require the dead files to exist, and neither lints the live station |

### 11.5a Asteroid Works is a playable inset, not a HUD with a tiny board

Owner playtest 2026-08-20 failed the live mining screen, and the same-day owner
design session replaced the old console with a **ground-up design**:
[`design/ASTEROID_WORKS_DESIGN_LAW.md`](./design/ASTEROID_WORKS_DESIGN_LAW.md) —
the game reduced to four visible laws (mine-once/farm-forever, machines feed
through faces, geology is the tech tree, tunnels are streets + rock is the
radiator), a perfect axis-aligned chess grid, **fog of war removed**, a warm
"field equipment at dusk" art direction replacing the gray/tracked-caps console
voice (owner: "gray, bleak, and vibe-coded, harsh fonts"), events on the board
with sound instead of a text tape, and instruments that mount only when they
first have data. Defects and bans stay in
[`design/program/ASTEROID_WORKS_PLAYFIELD.md`](./design/program/ASTEROID_WORKS_PLAYFIELD.md);
chrome idea in [`design/frontend/SCREENS_E_ASTEROID_WORKS.md`](./design/frontend/SCREENS_E_ASTEROID_WORKS.md);
execution is `PQ-130` (leaves `.01`–`.10`; deeper sim laws — seam scaling, the
parked thermal model, gas-tap power, import complements, the economy curve,
drones/field — are future packets listed in the law's §12).

**Art (2026-08-21 owner review): `PQ-130` is implemented, not accepted.** Every object in
the mine is a procedural stand-in — "the rover is like this 8-bit NES model inside this 3d
world … you're intentionally cutting corners." The authored-asset campaign is
[`design/program/ASTEROID_WORKS_ART_CAMPAIGN.md`](./design/program/ASTEROID_WORKS_ART_CAMPAIGN.md)
(`PQ-131`: a works-context release loader + works camera first, then rover, Core, extractor,
refinery, derrick, conduit kit, gas tap, fabricator, port/crates/pod, inclusions — each
reference-first, Blender, PBR, LOD, KTX2 via the canonical builder, three reviews at play size
beside a flight still). `PQ-130`'s acceptance is blocked on its units `.00`–`.06`.

The cutaway is the STAGE. The verb is **BORE**. Manifest tape, site-systems trivia,
and hover paragraphs are deleted per the law's §10, their jobs relocated onto the
board and into drawers. `SCREENS_D` B.10 (“leave the drill screen alone
and use it as the bar”) is void — owner playtest outranks it.

Do not fold this into Phase 5 HUD work or into Asteroid Ops Waves 1–4.

**Out of scope by owner ruling: progression rebalancing.** The pacing defects are real and recorded
(start 5,000 cr vs cheapest node 6,000; the Massline's top tier behind a 2,500,000 cr capital node;
research points have exactly one writer) but the numbers are not changed under this program —
presentation only.

### 11.6 Verification

Standard UI suite plus a **capture matrix**, not a single screenshot: every new surface captured in
**default · reduced-motion · `forced-colors` · pseudo-localized**, at **2560×1080 · 1920×1080 · 1280×720**.
Pseudo-loc and ultrawide are where this design is most likely to silently degrade, and both harnesses
already exist. Reference frames are diffed in CI (§11.7 item 13) — otherwise "a green check is not
proof" stays permanently true. A screen is not done until its silhouette is distinguishable from every other screen with
the text removed, its APRON holds at least one verb, and it has been *looked at* in a captured frame.

**A green check is not proof, demonstrated three times here:** the clipped Mission Log card passes
every check in the suite; `check:ui-frame-sleep` inspects `rAF` and cannot see compositor-side
`infinite` CSS keyframes; and `src/ui/screens/techTree.js` renders in browser-default 10 px sans on
every frame because Canvas 2D silently ignores `var()` in `ctx.font` — with nothing reporting it.

### 11.7 A-list standards — properties every screen must have

Beyond the per-screen designs, a top-tier frontend is defined by the screens that **do not fall over**
in conditions the author was not thinking about. Full detail:
[`design/frontend/A_LIST_GAPS.md`](./design/frontend/A_LIST_GAPS.md). The four that will visibly
break this build if ignored:

| # | Standard | Status | The rule |
|---|---|---|---|
| 1 | **Text expansion** | **missing from every spec** | The game has a live localization system and a pseudo-loc capture harness — every `.devshots/alpha/m6-*` frame is pseudo-localized. No spec mentions it, while the specs are full of fixed widths and `nowrap`. **No fixed-width text container; design against +40 %; never concatenate a sentence; capture in pseudo-loc, not just English.** |
| 2 | **Empty / loading / error / denied states** | unspecified | A correct-but-blank screen reads as broken (the Chart's Economy tab returning empty until you have priced two stations is the live symptom). Every pane defines all four, each naming *what would fill it* and carrying a verb. |
| 3 | **Screen state memory** | **verified missing** | `galaxyMap.js` persists no layer toggle, commodity, zoom or tab — every open is a fresh open. Every instrument restores the state the player last chose, per save. Invisible when present, infuriating when absent. |
| 4 | **Responsive strategy** | **verified missing** | Exactly one breakpoint exists (`max-width:900px`). Ultrawide must **clamp the HUD to a centred safe box** rather than stretch to unreadable corners; 4K scales by `--ui-scale`; handheld gets a reduced-density variant. Capture at 2560×1080 / 1920×1080 / 1280×720. |

Tier-2 and tier-3 standards in the same document cover: skill-tree needs an A-list tree has and this
plan lacks (search, "what leads to this?", a planned path, preview-before-commit, branch comparison,
and an explicit respec decision); Chart gaps (measurement, route comparison, authored fog-of-war,
layer presets); data-presentation conventions; list virtualization and a UI frame budget;
destructive-action policy; key-rebinding conflict display; a notification priority ladder across all
transient channels; returning-player re-establishment; **visual regression testing** (the only real
answer to "a green check is not proof"); text scaling; and the three absent meta screens — credits,
lifetime statistics, and photo mode.

### 11.8 Candidate additions

Ranked backlog in [`design/frontend/ADDITIONS.md`](./design/frontend/ADDITIONS.md), each verified as
genuinely absent from the codebase, with a deliberately-rejected list so they are not re-proposed.

The three that would most change how the game feels:

1. **Everything is a link.** Every entity name rendered anywhere — faction, commodity, station, hull,
   captain, sector, module — is clickable and opens that entity's dossier in place. **This is what
   makes a large game feel like one system rather than twelve menus**, and it is the cheapest answer
   to "the player needs to understand the systems through these screens": rather than a screen per
   system, every mention of a thing becomes a door into it.
2. **Loadout presets.** Customisation only produces *different kinds of gameplay* if switching is
   cheap enough to experiment with. Each preset is labelled by playstyle, never by stats.
3. **The watch list.** Pin a price, a rival, a deadline, a faction; it follows you onto the HUD. The
   game tracks far more than a player can hold in their head — let the player choose the slice.

**All three share one entity resolver**, which is why it sits in Phase 0.

**Rejected and recorded:** a separate stats screen (folds into the Footprint), a fleet-management
screen (VISION.md forbids the empire manager — the player never orders anything but their own ship),
a player market, skill *points* to allocate (progression grants verbs, not sliders), a second
minimap, tutorial popups (THE RANGE replaces them), and floating damage numbers (the HP-bar
dogfighting VISION.md forbids).

### 11.9 The one scheduling law

Three separate reviews reached the same conclusion by different routes:

> **Anything every screen needs must exist before the first screen is built.**

The colour token block, the canonical entry-key table, the entity resolver, state memory, the four
required states, the responsive scalar and text-expansion-safe layout are all in this class. Each was
discovered as a *defect* — a divergence between parallel authors, or a gap only visible once
rendered. Retrofitting any of them means touching every screen a second time.

That is what Phase 0 is for, and it is why Phase 0 is not optional.

### 11.10 Implementation status

| Phase | State | Evidence |
|---|---|---|
| **0 · Foundation** | **NEARLY DONE.** Role/type/motion tokens, the CREST/STAGE/APRON/DRAWER skeleton, text-expansion base rules and delegated hover audio landed (`8adcd339`, `65b81ee8`). **J3 the four data states, J5 the entity resolver + drawer, and J4 screen state memory have now landed** (`09111881`, `61497eab`, `16067c5e`). **Responsive / ultrawide safe frame landed (`0996a2e4`).** J01 named adoption set and J03 named tagging set are encoded and negative-tested in `check:data-states` / `check:entity-links` (`c571c478`). | `styles/ui.css` §11/§13/§14; `src/ui/entityResolver.js`; `src/ui/screenMemory.js` |
| **1 · THE SHIP** | **DONE.** Pausing in-flight screen (`F2`), shared WebGL mount, polish pass (`c01e55c4`); bands 2–3 handling/power/condition/capability landed as J09 (`0f503607`); loadout presets J13 (`4dbd0257`). | `src/ui/ship/shipScreen.js`, `src/ui/ship/loadoutPresets.js` |
| **2 · THE FOOTPRINT** | **DONE** — J10 (`583f7893`): provenance ledger + rap sheet / standing / log (`F3`). | `src/ui/screens/footprint.js`, `src/systems/provenanceLedger.js` |
| **3 · THE CHART** | **DONE** — J12 (`06a8161c`): pressure flows, route risk, traffic layer, dossiers. | `src/ui/galaxyMap.js`, `src/ui/map/` |
| **4 · THE RANGE** | **DONE** — J11 (`9d242df7`): three drills + weak-point passes (`F4`). | `src/ui/screens/range.js` |
| **5 · HUD + Power Bar** | **DONE** — J05 icons/crests (`e23a9ba9`), J06 Power Rail (`79e56c06`), J07 tactical HUD (`ad4764b5`…`f94a3368`), J08 reticle + threat halo (`bea90b47`), J14 tactile feedback (`f85507a9`), J15 quick-comms (`6cd90065`), responsive/ultrawide safe frame (`0996a2e4`). | `src/ui/hud.js`, `src/ui/powerRail.js`, `src/ui/threatHalo.js`, `src/ui/commsRadial.js` |
| **6 · Station interiors** | **Stage 0 repair DONE** (`376fcc8f`: `translate` instead of `transform` on `button:active`, popover anchor exemption, `resolveTarget`). **Flatten DONE** (`9b424bbe`: 982 cascade-dead declarations removed with an independent cascade proof, 0.0000 % pixel diff on the pure-DOM tabs at three bands, Kimi vision IDENTICAL; 2,905 → 2,496 lines — "half the size" was not honestly reachable without changing appearance). **Stage 2 DONE** (`cff8fa37`): the sub-12 px declarations were taken to the grammar floor by layout rather than by shrinking anything else, and every figure now binds `--sf-data-face`. Verified 2026-08-23 against the file, not the commit message: the smallest `font-size` in `station-workbench.css` is 12 px (43 declarations sit at 13 px, none below 12), and `--sf-data-face` is bound 29 times. | `styles/station-workbench.css`, `src/ui/station/` |
| **7 · Cleanup** | **Premise refuted 2026-08-21.** A resolved reverse-import walk reaches **27 of 27** files in `src/ui/screens/`; `stationHub.js` (4,057 lines) is imported by the live `stationApp.js`/`stationScreen.js`, and the live station screens import shared logic from the legacy `market.js`/`bar.js`/`services.js`/`shipLedger.js`/`factions.js`. Nothing is deletable without first refactoring the live station. What was wrong is fixed: both checks now lint the LIVE station (`30be9b1d`). A future Phase 7 is a refactor (lift shared logic out of the legacy modules), not a deletion. | `scripts/check-ui-screen-imports.mjs`, `scripts/check-command-deck-ui.mjs` |

**Phase-0 addendum — three rulings the build produced, binding on every job below.**

1. **`--sf-data-face` is not optional.** It was declared "numerals only, tabular-nums" and used **zero
   times**, while the Chart's own inspector — directly behind the first drawer built on it — already
   sets its numbers in mono. Every figure on every new surface binds it. This one change did more
   for "reads as an instrument, not a web component" than any other in the pass.
2. **No motion without a state variable — enforce by subtraction.** J3's LOADING sweep shipped as
   `animation: … infinite`, which §5 forbids (nothing supplied progress) and which
   `check:ui-frame-sleep` structurally cannot see, because it inspects rAF and this is a compositor
   keyframe. It was **deleted**, not tuned. The state is carried by the word, the glyph, `aria-busy`
   on the host, and the skeleton's shape. `check:data-states` now fails any `infinite` in the block.
3. **Shape tokens exist now — use them, don't re-declare.** `--sf-rail-w`, `--sf-goal-edge`,
   `--sf-track-micro`. Sections 13 and 14 had already drifted apart on rail width, radius and micro
   tracking before a second screen adopted anything; three overrides in the first two consumers is
   how `station.css` became a 202-selector override pile.

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

### 11.11 What inhibits the player's best experience

Measured, not asserted. Ranked by cost to the player. This table is the *why* behind §11.12.

| # | Inhibitor | Verified evidence |
|---|---|---|
| 1 | **The simulation is invisible** | `state.npcJobs` (183 KB of career sim) and `state.traffic` (350 KB, largest file in the repo) are read by **0 UI files**. `player.bounty` — the number deciding who hunts you — appears in **0** UI files. |
| 2 | **You cannot read your own ship** | `getDerivedStats` returns ~35 fields; the ship screen shows **6**. Every module advertises a power `DRAW` against a capacity never displayed. Condition/damage absent. |
| 3 | **Nothing explains a rule** | `screens/help.js` = four blocks of keybindings. `screens/codex.js` = 8 story-gated *narrative* tabs. `systems/onboarding.js` speaks one 6-second line, unrecoverable. Station tooltips: factions 0, industry 0. |
| 4 | **The world does not remember you** | `heat` is a 0..1 scalar that decays. `factions.js` overwrites rep by scalar. Both emit a `reason` and discard it. No crime log, no standing history. |
| 5 | **The good powers are unreachable** | Start = 5,000 cr; cheapest of 29 tech nodes = 6,000. `mod_massline_spool_l` (the signature mechanic's ceiling) requires `tech_flagship_command` = 2,500,000 cr behind Capital Hulls. RP has exactly one writer. |
| 6 | **The HUD hides what you can already do** | Keys `4`–`8` fire five physics powers today. `clearingCone` and `skimCollector` have **zero** references in `src/ui/`. |
| 7 | **Screens forget everything** | `galaxyMap.js` persists no layer toggle, commodity, zoom or tab. |
| 8 | **Correct-but-blank reads as broken** | Fixed once by hand (THE SHIP showed an empty bay for 12 s cold). No shared state policy, so the next screen repeats it. |
| 9 | **The UI would break in translation** | A live localization system and pseudo-loc harness exist; no spec accounted for +40 % string growth. |
| 10 | **One breakpoint** | `@media (max-width:900px)` is the only one. No ultrawide, 4K or handheld strategy. |

> **The through-line: this is a surfacing problem, not a content problem.** Nearly every inhibitor is
> *"the game already computes this and never shows it."* Several jobs below are therefore assembly,
> not invention.

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

## 12. Crucible — Survival, Combat Lab, and arcade-physics convergence (`PQ-133`)

**Source:** [`design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md`](./design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md)
(**updated to v2 on 2026-08-24: 6,875 → 9,299 lines**; §30 is the phase roadmap, §31 the 69 provisional
packets `CRU-000`–`CRU-068`, Appendix A the schemas, Appendix E the owner map, Appendix F the open
product decisions with recommendations).

**What that file IS, in its own words (§32.1): a DURABLE DESIGN PROPOSAL / EXPERIMENT BANK — NOT
ADMITTED WORK.** It "does not establish queue order, status, implementation, or acceptance", and must
not be called active scope unless the owner admits the whole program. Its labels separate **CORE**
(durable decision) from **FIRST SLICE** (narrow candidate, still needs admission) from **EXPERIMENT**
/ **CONTENT BANK** / **FAR FUTURE**. Its own agent contract warns: *"Never turn this file into a
giant checklist whose unchecked boxes imply a blocked game."* Read it as a quarry; admit work through
a queue ID and an active packet, as `PQ-133` was.

### 12.0 The v2 delta — a CORE CORRECTION that reorders the program

The entire v2 addition is **one new section, §21A "Flight, formation, and enemy-motion convergence"**
(2,095 lines, 30 subsections). Everything else is unchanged. It carries a **CORE CORRECTION dated
2026-08-23**, and it is directional for anything touching flight or enemy motion:

> Crucible cannot deliver the intended experience if the ships themselves remain mushy, indecisive,
> or visually incoherent. Survival is a forcing function for combat density, and **density magnifies
> every flaw in flight control and enemy movement.** The movement layer therefore becomes a
> **prerequisite shared program, not post-launch Survival polish.**

Its one-line target: **"Every ship should look like it meant to do what it just did."** Not faster —
*intentional*. Speed without intention is pinball noise.

The dependency order it asserts:

```text
Motion Lab → player handling convergence → hull-relative enemy actuator
→ virtual formation + attack choreography → cheap coherent swarm motion
→ ten-wave Survival shell → attack/modifier expansion → arena and boss breadth
```

**This reframes what "PQ-133 done" means.** The leaves below shipped their SYSTEMS and are correctly
stamped; §21A adds a gate they were never measured against — *"no Survival vertical slice should be
called representative until the motion-convergence gate passes."* That is a NEW bar from a newer
document, not a defect in the delivered work, and it is not admitted work until the owner says so.

Its named first slice (§21A.28) is deliberately small and is the obvious admission candidate: player
Hitch and Wasp selectable; ONE four-ship wing that enters in wedge, widens to fan, sends two ships
down distinct crossing lanes while two screen, extends without instant turn-back, and reforms through
merge corridors; ONE twelve-body fodder cohort that reads as a river and stays physically throwable;
ONE heavy brawler with a pressure corridor and a clean breakaway. Proof is deterministic scenarios
M1/M4/M6/M8/M11 plus capture at the shipping camera — with **no new direct position/velocity writes,
no campaign AI fork, and no performance regression hidden by cutting entity count or quality.**

§21A explicitly does not prescribe permanent tuning values: every number in it is a candidate
experiment band until an admitted packet promotes it.
**Admitted 2026-08-21 as `PQ-133`.** Packet: [`design/program/roadmap/active/PQ-133.md`](./design/program/roadmap/active/PQ-133.md).
Dispatch: `node scripts/program-dispatch.mjs --id PQ-133`.

The thesis in one line: *Crucible discovers what is fun. Adventure makes it matter. Combat Lab explains why
it worked or failed.* The central move is a **shared attack algebra** (emitter · trajectory · propagation ·
payload · trigger · constraint) so one Pulse Laser can become a bank shot, a chain primer, a returning
cutter, or a clean gun without a bespoke code path for each.

**Binding architecture rulings from the plan (§27), restated because every leaf below depends on them:**

- `state.mode` stays `'flight'`. Survival is an **orthogonal** `state.run` envelope (`kind:'survival'`),
  never a mode value that stops flight systems updating.
- A run starts from **fresh ephemeral state through the real New Game path**. It never mutates the live
  Adventure save, shares campaign credits, shares inventory by reference, or writes run modifiers into
  persistent fittings. `A.8` campaign-contamination test is mandatory from Phase 2 onward.
- Phases are **explicit and validated** (`inactive → loadout → arena_intro → wave_intro → active →
  cleanup → draft → … → refit → … → victory | ended`). No UI infers phase from whether enemies exist.
- The wave planner is a **pure function** (`planWave({seed, arenaId, wave, act, difficulty, mutators,
  buildSummary})` → intent). Runtime owners materialize it through `spawnBudget` and the canonical
  materializer. No cap bypass; `DEFAULT_MAX = 24`, `HARD_MAX = 40` are re-audited, not overridden.
- Attack modifiers compile into an **immutable `AttackSpec`** with lineage (root/descendant, generation,
  visited targets) and a **shared proc budget**. Containment invariants (§9.7) are tests, not prose.
- Crucible **consumes** Physics-as-Spectacle (contact provenance, kill receipts, priority-aware VFX) and
  never closes that program's gates by using its code.
- One game path: Browser, Electron, Sandbox, Crucible and the deterministic Lab share registry, input,
  data, physics, combat, rendering, settings, assets. Wrappers select setup and rules; they never fork.

### 12.1 Phases → dispatch leaves

> **Status stamped 2026-08-23.** This table previously carried no status at all, so a reader could
> not tell a finished phase from an unstarted one — the truth lived only in
> `design/program/roadmap/program-queue.json`. Every leaf now says where it stands, in the canonical
> document, with the commit.
>
> **Phases 0-12 are complete as engineering.** Phase 13 is not engineering: the plan's own text calls
> it "a separate product decision with infrastructure, security, moderation, determinism, and cost
> implications", so it is the owner's call rather than outstanding work.
>
> Where a leaf says SYSTEMS DONE, what remains is art or a screen — boss hulls, prop meshes, VFX —
> and is named on the row. Those need the GPU lane and, in several cases, owner acceptance; nothing
> self-promotes.


| Leaf | Plan phase | Player outcome | Exit gate (verbatim from §30) | `CRU` packets absorbed |
|---|---|---|---|---|
| `PQ-133.00` **[DONE]** | **0 · Assimilation + seam audit** | Plan registered; seam map names exact owners, files, reusable code, missing seams, tests, perf limits, first packet | Seam map exists and the first two packets are shaped against live code | CRU-000, CRU-001 |
| `PQ-133.01` **[DONE]** | **1 · Combat Lab extension** | Launch a real-path combat setup with chosen hull, weapons, physics loadout, enemy package, seed, arena prototype; same-seed restart; speed/debug toggles; telemetry overlay; build-code v0; one deterministic physics-swarm scenario | Same build+seed launches repeatedly in Browser and Electron and the deterministic scenario agrees | CRU-002 … CRU-008 |
| `PQ-133.02` **[DONE]** | **2 · Ten-wave shell** | Complete replayable ten-wave run with existing weapons/enemies/fields/pickups and one greybox arena: run state, phases, pure wave planner, spawning through canonical materialization, run XP + Arena Credits, physical credit pickup, three-choice draft, wave-10 boss from an existing enemy, results screen, build code, contamination checks | Start → play → die or win → results → restart same seed; Adventure state unchanged | CRU-009 … CRU-018 |
| `PQ-133.03` **[DONE]** | **3 · AttackSpec compiler + lineage** | Existing projectile weapons accept bounded deterministic topology modifiers: trait schema, compiler, lineage, shared proc budget, child inheritance, multishot/pierce/split, owner-seam metrics, Lab inspector | Pulse Laser + one projectile weapon produce ≥3 distinct legal compiled forms with repeatable metrics and bounded descendants | CRU-019 … CRU-024 |
| `PQ-133.04` **[DONE]** | **4 · Surface receipt + Ricochet Foundry slice** | Authoritative surface-contact receipt (point/normal/material/velocity), material compatibility, reflection through physics, Bank Shot + Smart Bank, greybox Foundry with moving shutters and a loose reflective plate, ten Foundry recipes, Mirrorjaw Foreman, causal VFX/audio, route + perf acceptance | Same Pulse Laser supports direct, bank, and smart-bank; all three finish the ten-wave block; bounce cause is visible and deterministic | CRU-025 … CRU-031 |
| `PQ-133.05` **[SYSTEMS DONE]** | **5 · Chain, payload, bridge modifiers** | Deterministic chain selection; Ion Payload, Relay Arc, Gravity Tag, Incendiary Payload; bridge traits (bounce→chain, tether→payload, status→propagation); causal score tags; draft compatibility/exclusions; results causal distribution | ≥3 mature build identities viable in Foundry with measurably different causal distributions | CRU-032 … CRU-038 |
| `PQ-133.06` **[DONE incl. 06b]** | **6 · Orbit fields, Cryo Lock, reactions** | Bounded orbiting field nodes; Cryo Lock (momentum preserved, control authority reduced); Thermal Shock; Cryo Gyro Rack prototype; active-positioning requirement for orbit efficacy; grammar, Lab controls, perf metrics, one thermal pocket | Orbit builds require movement; Cryo preserves translational momentum; Thermal Shock is repeatable and understandable | CRU-039 … CRU-042 |
| `PQ-133.07` **[SYSTEMS DONE (e948066f)]** | **7 · Thirty-wave Foundry** | Acts I–III, wave-20 system event, wave-30 boss variant, refit cadence, build evolutions, difficulty composition, score/style, results history, unlock scaffolding, swarm AI tiering + spawn-scale profile, run HUD, refit/draft polish | Early identity, mid-run resistance, late spectacle, complete victory arc without HP inflation | CRU-043, CRU-049 … CRU-054 |
| `PQ-133.08` **[SYSTEMS DONE (de5f17cb)]** | **8 · Lagrange Crucible + Cinder Sluice** | Gravity arena and current arena with their controllers, bosses, recipes, props; existing builds cross-tested | The strongest Foundry build is not automatically strongest in both, but stays intelligibly viable | CRU-044, CRU-045 |
| `PQ-133.09` **[SYSTEMS DONE (b49d65a6)]** | **9 · Cryo Drift + Storm Lattice** | Thermal quadrants, coolant/heat props, conductivity graph, movable relays, Massline conduction, two bosses, act coverage, cross-arena tuning | All five arenas express distinct laws with the same combat owners and data grammar | CRU-046, CRU-047, CRU-048 |
| `PQ-133.10` **[DONE]** | **10 · Meta, challenges, endless** | Unlock catalog (possibility, not stats), local records, mutators, boss circuit, deterministic endless after wave 30, one-hull/one-weapon trials, run history, versioned build codes | Reasons to replay beyond score; a fresh account stays competitively viable | CRU-055, CRU-056, CRU-057 |
| `PQ-133.11` **[DONE (bca4c34e)]** | **11 · Adventure migration** | Proven traits mapped to modules/Rigs/variants/tech/salvage; arena laws as authored sites; enemy doctrines from wave roles; acquisition arcs; law/collateral | Adventure combat shows the same combinatorial grammar without run economy or random drafts | CRU-058, CRU-059, CRU-060 |
| `PQ-133.12` **[DONE (f4814182)]** | **12 · Content factory** | Schemas, validators, compatibility lint, preview tools, wave-recipe simulator, arena module library, localization-ready text, balance dashboards | A new legal modifier or wave recipe can be authored, validated, previewed and tested without editing the combat kernel | CRU-061, CRU-062 |
| `PQ-133.13` **[NOT ENGINEERING]** | **13 · Community / network** | **Research only** — daily seeds, ghosts, leaderboards, co-op feasibility | Explicitly *not implied* by local completion; separate product decision | CRU-063 … CRU-068 |

Order is `.00 → .01 → .02 → .03 → .04` strictly (the plan's §32.7 admission order), then `.05/.06` may
run in parallel on disjoint files, `.07` after both, `.08/.09` in parallel after `.07`, `.10`–`.12`
after `.09`. `.13` is deferred research and never blocks anything.

### 12.2 Product decisions adopted (Appendix F recommendations, binding until the owner overrides)

Umbrella **Crucible**, scored ruleset **Survival**, experiment surface **Combat Lab**, existing surface
**Sandbox**. Direct main-menu entry, fiction later. Manual aim default; auto-fire only as accessibility.
Full pause during drafts. Hull changes only at ten-wave refits. Physical collisions and arena hazards hurt
enemies; ordinary enemy projectile friendly fire stays limited. No mid-run save in the first slices.
Seeded offers and waves, deterministic build-code reproduction, a draftless control ruleset. Meta
progression unlocks possibility, never permanent stats. Victory at wave 30; endless optional. No campaign
material reward in v1. Five authored arenas before any generation. No architectural distortion for
hypothetical network play.

### 12.3 Anti-patterns that fail a leaf on sight (§33)

Generic bullet-heaven drift (passive auras that clear screens), a second-game architecture (parallel
combat registry, alternate physics), modifier soup (stat-only drafts), proc explosion (unbounded
descendants), visual soup, HP inflation as difficulty, hard-counter director, physics as garnish (no
causal participation) or as chaos (unreadable), campaign contamination, debug divergence (Lab path that
is not the game path), harness treadmill (validation machinery instead of a better playable game),
content-before-foundation, boss immunity theater.

## 13. Arcade VFX foundation (`PQ-134`)

The orphan branch `feat/arcade-vfx-foundation` (one commit, `20216c9c`) was pulled to master as
`ce340812`: [`src/render/combat/arcadeStructuralFx.js`](./src/render/combat/arcadeStructuralFx.js) — a
pooled, instanced structural-FX primitive set (**blades** 128, **broken arcs** 48, **shards** 64) with
priority-aware slot admission, no camera-facing sprites, no radial alpha fields, no full shock rings. It
had **zero consumers** when this was written and no longer does (see the leaf table). `PQ-134`
wires it and becomes the VFX half of Crucible's causal grammar
(`CRU-051`): family / generation / material / status must read under saturation.

| Leaf | Outcome | Done when |
|---|---|---|
| `PQ-134.00` | File on master, lint/import green | **DONE `ce340812`** |
| `PQ-134.01` | `ArcadeStructuralFx` mounted in the presentation adapter behind `cueArbitration`; kill, hard-collision, and bank-shot cues request blades/arcs/shards with priority; capacity never grows on the present beat | **DONE** — mounted in `src/render/vfx.js`, admitted through `admitStructuralFxCue`, and driven by four live cue paths (`entity:killed`, `combat:collisionConsequence`, the bank-shot cue, and `presentation:vfxCue`). 16 tests green across `arcade-structural-fx-mount` and `vfx-arcade-structural-fx`, with a live probe wired as `check:arcade-structural-fx` |
| `PQ-134.02` **[DONE - accepted by capture]** | Causal VFX/audio grammar (`CRU-051`): direct, bank, chain, collision, terrain, tether, field, reaction each own a readable family/colour/shape; hero events survive saturation; reduced-motion and forced-colors variants | Four-way capture (Crucible wave 8, Foundry boss, Adventure fight, reduced-motion) reviewed at play size |

**2026-08-23 — the grammar is now actually fed (`357eb134`).** `.02` was accepted by capture, but
three of the eight families could not fire in ordinary play: `projectile:hit` carried no causal
information, so `chain`, `field` and `reaction` only appeared when a receipt already happened to
carry the flag. The hit path now stamps `causalTags` using the SAME tokens
`causalKindsFromAttackSpec` produces — one frozen array per spec in a WeakMap, so a hit allocates
nothing — plus `hops`/`chain`, `hasBounced`, and `family` for field and reaction payloads. Real
emitted payloads were fed to `classifyCausalVfxFamily` and route to `chain`, `field` and `reaction`.
Both 47-A goldens hold: this adds information to an event and does not move the simulation.

## 13A. Flight and movement convergence (`PQ-135`) — ADMITTED 2026-08-24

**Source:** [`design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md`](./design/vision/CRUCIBLE_SURVIVAL_MASTER_PLAN.md)
§21A, the v2 addition. **Admitted here by the owner on 2026-08-24** after playtest.

The source file calls itself an experiment bank and asks not to be treated as a checklist. That
caution is about not turning 9,299 lines of brainstorm into 9,299 blocked boxes — it is **not** a
reason to leave real work out of the plans. The concrete, owner-confirmed slices are admitted below
with stable IDs. Everything NOT listed here stays a quarry.

### Why it is admitted: the owner played it

> "it's not possible to fly in this game in a way that's nimble, every ship is heavy like underwater
> or something and the auto-target flight system just kind of lazily inches along the line like a
> Waymo in a school-zone which isn't useful in combat either"

§21A independently reaches the same verdict — ships that are *"mushy, indecisive"* — and sets the
target: **"Every ship should look like it meant to do what it just did."** Not faster. *Intentional.*
Speed without intention is pinball noise.

§21A's dependency order, which this section adopts:

```text
Motion Lab → player handling convergence → hull-relative enemy actuator
→ virtual formation + attack choreography → cheap coherent swarm motion
```

### The leaves

| Leaf | Outcome | Done when |
|---|---|---|
| **`PQ-135.00`** | **The draw-to-fly speed governor stops crawling.** MEASURED DEFECT: ships cruise at **112-133 WU/s**; `PATH_CORNER_FLOOR_SPEED` is **14**, about one eighth. `worstCurvatureAhead` takes the MAX curvature over the lookahead, and a hand stroke sampled every 8 screen px reads its own jitter as a hairpin — so a gentle curve pins the hull to the floor for the whole stroke. | A drawn stroke is flown at a speed a player would choose, AND still tracked. **The existing tracking test measures cross-track and never measures SPEED — it would pass at 1 WU/s.** Add the speed bar to it. |
| **`PQ-135.01`** | **Player flight feel: crisp low-speed response, honest momentum, strong brake/yaw settle, and a hull you can FEEL the difference between.** (§21A.5) | A repeatable slalom and reversal course, Hitch vs Wasp visibly different, no loss of honest momentum. |
| **`PQ-135.02`** | Motion Lab: deterministic movement scenarios and motion telemetry, so feel is measured rather than argued. (§21A.23-.25) | Scenarios M1, M4, M6, M8, M11 run deterministically and produce comparable numbers. |
| **`PQ-135.03`** | Hull-relative enemy capability envelopes and desired-state trajectory control. (§21A.6-.7) | Enemy motion derives from the hull it is flying, not a shared constant. |
| **`PQ-135.04`** | **One four-ship wing with real choreography**: enters in wedge, widens to fan, two ships take distinct crossing lanes while two screen, attackers extend without instant turn-back, and the wing reforms through merge corridors. (§21A.9-.13) | A player impulse can break the sequence, and disrupted members do not instantly snap back. |
| **`PQ-135.05`** | **One twelve-body fodder cohort that reads as a river or crescent and stays physically throwable.** (§21A.14) | It flows as a shoal rather than a dozen independent seekers jittering at the same point. |

### Binding constraints (§21A.28, §21A.30)

- **No new direct position/velocity writes.** Motion comes through the canonical physical control
  path or it does not ship.
- **No campaign AI fork.** One game path.
- **No performance regression hidden by cutting entity count or quality.**
- Proof is normal-speed capture at the SHIPPING camera plus deterministic scenarios — not a clip
  recorded at a flattering angle.
- Every tuning number in §21A is a candidate experiment band, not law, until a leaf promotes it.

### Sequencing note

`PQ-135.00` is small, contained, and immediately felt — do it first. `.01` and `.02` are the real
"nimble" work and belong together, because feel that is not measured is feel that regresses.
`.03`-`.05` are the enemy half and depend on `.01` landing first, per §21A's own order.

## 14. Fleet orchestration law for the 2026-08-21 final run

Who does what, recorded so a later session does not reinvent it.

| Role | Surface | Invocation that works (verified 2026-08-21) |
|---|---|---|
| **Primary implementer** | `cursor-agent` with Grok 4.6 | `cursor-agent -p --force --trust --output-format text --model cursor-grok-4.6-xhigh --workspace <repo> "<packet>"` |
| **Primary implementer (alt)** | `grok` CLI 1.0.4, grok-4.6 | `grok --model grok-4.6 --reasoning-effort xhigh --prompt-file <packet.md> --output-format plain --max-turns N --no-plan --no-memory --disable-web-search --permission-mode auto --cwd <repo>` |
| **Reviewer / auditor** | `codex` npm build (0.149.0 as of 2026-08-23), GPT-5.6 Sol xhigh | `C:\Users\93rob\AppData\Roaming\npm\codex.cmd exec --ignore-user-config -m gpt-5.6-sol -c 'model_reasoning_effort="xhigh"' -s read-only -C <repo> - < packet.md` (the app-managed 0.130 build on PATH is too old; `-s workspace-write` for audits that write one file) |
| **Frontend implementer** | `opencode` 1.18.18, GLM 5.3 Max (Z.ai coding plan) | `opencode run --dir <repo> --model zai-coding-plan/glm-5.3 --variant max --format json "<packet>"` — **GLM has no vision**; never accept its visual output on mechanical checks |
| **Frontend visual reviewer** | `opencode` Kimi K3 xhigh (clinepass); `kimi` CLI k3-256k for small reviews | `opencode run --dir <repo> --model cline-pass/cline-pass/kimi-k3 --variant xhigh --format json "<packet>"`. Slow, silent first token; never kill on stdout silence |
| **Fallback for frontend when every lane is out of quota** | Claude Opus 5 subagents | Agent tool, `model: opus` |
| **Lane orchestrators** | Claude Opus 5 subagents | One per lane; they dispatch the CLIs above, diff-gate, and report. They are given exact file partitions and NO-GO lists |
| **Master orchestrator + final reviewer** | Claude Fable 5 (this session) | Judges every deliverable beside real evidence; never accepts prose as proof |

Rules: usage renews every five hours — a lane that dies on quota is retried a few tasks later, not
abandoned. Implementers and reviewers are always different models. Every lane partitions writes by
**file**; two agents never hold the same file. Every leaf commits immediately after review, scoped to
its exact paths. `npm run check:playable` is run before any "done".
