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
- **Any 2D / HUD / menu / screen work** → §11 below, then
  [`design/frontend/INSTRUMENT_GRAMMAR.md`](./design/frontend/INSTRUMENT_GRAMMAR.md) **before you
  design or build anything.** The grammar is binding; per-screen specs live beside it in
  [`design/frontend/`](./design/frontend/README.md). Frontend work that skips it is the documented
  cause of "cheap and uninspired" output.
- `INFERENCE <Nx> [optional scope]` → [`design/vision/INFERENCE_CONVERGENCE_METHOD.md`](./design/vision/INFERENCE_CONVERGENCE_METHOD.md)
  plus [`INFERENCE_LANES.md`](./design/program/INFERENCE_LANES.md). That door does **not** run the
  flyable-ship remaster.

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
  (five-plus full-job cycles, three valid full-model stills, three subagent reviews that list
  obvious defects, then cleanup), commit, then the next ship, until every PQ-050 leaf is
  done or honestly blocked. Hitch stays frozen. A factory loft with boxes or a zoomed gray
  crop does not close a ship.
  Only after PQ-050 is exhausted, take other `--ready` implementation units. Acceptance-capture
  leaves that need a human or a headed machine you do not have may be recorded `unproven` and
  skipped; do not stall the campaign on them.

**PQ-050 campaign checkpoint (2026-08-14, plate-skin rebuild):** loft-as-hull
is dead as the visible Hornet silhouette. Live factory wholeships are still
unwired. Stay off INFERENCE, the dock/hulk remaster, and the expansion-research
brief.

- **Hornet is on cycle 51.** Tip-to-transom loft replaced by short gloves plus
  telescoping plate bands, plated slab wings, hoop-framed drive house. Clay is
  no longer a foam dart. Hitch still wins. Not wired.
- **Remaining remasters** are getting the same plate-skin cover
  (`cover_loft_with_plates`). Candidates only. None wired.
- **Hitch V8 is live.** V9 extra polish (antenna farm, cable trays, airlock,
  heat skirts) is staged so Hitch stays ~20% above the plate-skinned fleet.
  Do not overwrite KTX2 release files with uncompressed source.
- **Do not** wire a remaster that still loses to Hitch.
- **Do not** mark the campaign exhausted while Hitch still wins.

**Graphics / place-asset remaster (resume):** if the task is continuing the interrupted remaster of
`place_dock_interior`, `place_dead_hulk`, and/or `place_debris_chunk` (Blender/EEVEE form work, not a
queue packet), start at
[`assets/ships/parts/places/REMASTER_HANDOFF_dock_hulk_debris.md`](./assets/ships/parts/places/REMASTER_HANDOFF_dock_hulk_debris.md)
before touching those GLBs. That handoff owns live residuals, bans, KEEP/RESTORE rules, and player-route
meaning (dock = shipyard UI backdrop; hulk/debris = freeflight landmarks). For ordinary admitted
roadmap work, still use `program-dispatch` above—do not substitute this handoff for a PQ packet.

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
First ready ship is Hornet. Do not touch Hitch.

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
historical prose. The 2026-08-08 transaction and per-source decisions are durable in
[`WORKTREE-RECOVERY-2026-08-08-REPORT.md`](./design/program/roadmap/receipts/WORKTREE-RECOVERY-2026-08-08-REPORT.md).
Do not treat repeated exports as separate projects, and do not keep a safe disjoint unit idle because
one exact path has a live writer.

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

Use [`design/PERF_BUDGET.md`](./design/PERF_BUDGET.md). Preserve the target and floor profiles. Optimize invisible work first. Do not pass by lowering default render scale, effects, shadows, particles, asset detail, or content density.

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
| **0 · Foundation** | **PARTIAL** — role tokens, type tokens, motion tokens, the CREST/STAGE/APRON/DRAWER skeleton, text-expansion base rules and delegated hover audio landed (`8adcd339`, `65b81ee8`). **Still owed: the entity resolver, screen state memory, the four data states, and the responsive/ultrawide strategy.** | `styles/ui.css` `:root`; `.sf-instrument` block |
| **1 · THE SHIP** | **step 1 of 3 done.** Promoted to a pausing in-flight screen (`F2`), one shared WebGL mount serving both hosts, flight host = instrument minus commerce. Polish pass fixed the loading gate, 22 clipped nodes and 11 sub-floor type nodes (`c01e55c4`). **Steps 2–3 (handling, power, condition, capability) are J2 below.** | `src/ui/ship/shipScreen.js`; `scripts/probe-ship-polish-audit.mjs` |
| **2–7** | not started | — |

**Also landed from the earlier direction document:** the live-overlay fix (`body.ui-live-screen #hud { opacity: .5 }`) so a non-pausing screen no longer blinds the player, and an `sf-select` primitive (adoption incomplete — native `<select>` remains in `galaxyMap.js`, `screens/automationPanel.js`, `screens/starmap.js`).

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

### 11.12 The ten jobs

Each job states the A-list pattern it borrows, the player outcome, the exact seams, the build steps,
how it is verified, and the traps that will bite. Full narrative in
[`design/frontend/NEXT_JOBS.md`](./design/frontend/NEXT_JOBS.md).

---

#### J1 · The Power Rail — *short*

**Pattern:** the MMO/looter action bar (WoW, Destiny) — permanent, numbered, fills as you grow.
**Player outcome:** *"I can see what I can do, and I can see it growing."* The direct answer to
*"I can't look at the HUD and see the big game."*

**Current state.** `src/systems/input.js` `VERB_BINDINGS` already binds `Digit4` `deployMassSeed` ·
`Digit5` `deployWell` · `Digit6` `deployRepulsor` · `Digit7` `toggleClearingCone` · `Digit8`
`toggleSkimCollector`. `Digit0` = `brake` (keep, render as **not a slot**). `Digit9` free.

**Build steps.**
1. Render the rank bottom-centre in three bands of three — **ORDNANCE** (1–3, instantaneous, leaves
   nothing behind), **FIELDWORK** (4–6, spawns a persistent bounded object), **RIG** (7–9,
   ship-attached sustained toggle). The banding is the teaching and costs zero rebinding.
2. Add the slot digit to each action's existing code array — never substitute. Multi-code bindings
   are already the house idiom (`tether: ['Space','KeyF']`).
3. Slot states: ready · cooling (radial) · armed · locked · unaffordable · empty socket. **Empty
   sockets ship visible** — they are the progression display.
4. Implement the **slot-claim contract**: `hud:slotClaim { claimId, slots[], answers[], expiresAt, mode }`
   on prompt open, `hud:slotRelease { claimId }` on close. Modes `SINGLE` / `PARTIAL` / `FULL`.
5. Icons: generate from the 16 committed prompts, author to 24 × 24 `currentColor` stroke SVG per
   `ICON_PIPELINE.md`, register beside `station/icons.js`.

**Seams:** `src/ui/hud.js`, `injectHudCss` in `src/ui/uiRoot.js`, `src/systems/input.js`,
`src/ui/bindings.js`, new `src/ui/powerIcons.js`.

**TRAP — the digits are already claimed, and the claimants win.** Four prompt surfaces register on
`document` in the **capture phase** and call `stopPropagation()`, so they beat the window-level
flight adapter today: `contactHailPrompt.js` (`Digit1–3`), `pirateParleyPrompt.js` (`Digit1–3`),
`lawfulInspectionPrompt.js` (whose comment states it deliberately owns `Digit1` "so a flight binding
cannot fire through it"), and **`encounterChoicePrompt.js`, which claims `Digit1`–`Digit9` — the
entire rank** (`:149` capture listener, `:212` `/^(?:Digit|Numpad)([1-9])$/`). The HUD cannot
un-claim these. It must **render the claim.**

**Other traps:** never name a class `*-pulse|blink|flash` (`sf-reduce-flash` blanket-kills it); never
put `panel|card|menu|modal` on a tile carrying meaning in a gradient (`forced-colors` strips it).

**Verify:** slot fires the verb; claim/release round-trips through an encounter prompt without
eating a keystroke in either direction; reduced-motion and `forced-colors` legible; capture at hour-1
/ hour-10 / hour-50 densities (prototype exists in `_uilab.html?focus=pb`).

**Depends on:** nothing. Spec complete in `design/frontend/SCREENS_A_FLIGHT.md` §2.

---

#### J2 · Ship bands 2–3: handling, power, condition, capability — *short*

**Pattern:** Elite Dangerous outfitting comparison + Warframe ghost-preview on hover.
**Player outcome:** the answer to *"why does my ship fly like this"*, a power budget with a capacity
to draw against, visible damage, and progression stated as capability.

**Current state — mostly assembly.** These are **finished renderers behind a dead import chain**
(`screens/stationHub.js` → `outfitting.js`/`shipyard.js`, neither registered):
- `src/ui/panels/handlingProfile.js` — returns agility / inertia / topSpeed / brake **normalised
  against the whole 13-hull roster**, plus `flightClass` and `driveLabel`. A full bar therefore means
  "best in the game", not "100 units".
- `src/ui/panels/massDelta.js` — already speaks in verbs (`sluggish`/`twitchier`, `shorter stop`/
  `longer stop`) and returns a real `stopDistanceEstimate` in world units.
- `src/ui/panels/moduleRisk.js` — contraband / noise / mass / power / mass-stack marks.
- `src/ui/shipEngineeringStage.js` — 3D stage + `routeBeam` + `rippleField` + **6 `circularGauge`s**
  + `projectSlot()` bridging `projectLocalPoint`.

**Build steps.**
1. **HANDLING** — mount `handlingProfile` verbatim. Bars kick and settle in proportion to their own
   value (agility snaps, inertia lumbers). Hovering a fitted module runs `massDelta` and **ghosts the
   bars to where they would go**. Print the verb at 40 px and the number at 12 px.
2. **POWER** — headroom = `capRegen − continuousDrain` against `capMax`. `setGauges` already computes
   `continuousDrain / (capRegen * 1.5)`. `routeBeam` runs reactor → each drawing slot with dash
   velocity ∝ headroom; **over budget the dashes march backwards.** *Flag honestly: per-use burst
   costs are not modelled as fields — ship standing drain and label burst "not modelled".*
3. **CONDITION** — `src/core/livingHull.js` already persists `killTally` (cap 13), `repairPatches`
   (cap 4), `heatScorch` (cap 3), `grime`, `washCount`, `graffitiLine`/`graffitiAuthor`, and
   `render/livingHullPresentation.js` holds `PATCH_TRANSFORMS`/`SCORCH_TRANSFORMS` **in the same
   normalised ship-space format `projectLocalPoint` consumes** — so captions pin to real scars for
   free. Washing costs you the tally: a real decision.
4. **CAPABILITY** — every tech node's headline is the physical act it grants, second person.
   `describeTechNodeReadiness()` already returns structured blockers — render "you're short 2 parts",
   never a greyed button.

**Seams:** `src/ui/station/screens/shipworks.js` (the live host — extend, do not fork),
`src/ui/shipPreviewMount.js` (`projectLocalPoint`), the four dead panels above.

**Verify:** extend `scripts/probe-ship-polish-audit.mjs` — assert the four bands render, the beam
reverses when `continuousDrain > capRegen`, and `belowFloor` stays 0.

**Depends on:** Phase 1 step 1 (done). **Do before J9.**

---

#### J3 · The four data states, as a shared primitive — *short*

**Pattern:** the skeleton/empty-state discipline of every shipped consumer app.
**Player outcome:** never a blank screen that is technically correct.

**Build steps.** One primitive in `src/ui/uiPrimitives.js` + `styles/ui.css` exposing **EMPTY /
LOADING / ERROR / DENIED**, each required to name *what would fill it* and carry a verb:
- EMPTY — *"No contracts here. Nearest board: Ceres — plot route."*
- LOADING — bound to real work, never a fixed timer; show a skeleton of the real layout.
- ERROR — what failed, whether recoverable, one action.
- DENIED — why, and what would make it allowed: *"Cannot dock: outstanding bounty ≥ 5,000. Pay it here."*

Then audit every pane. Reference implementations that already do this well: the Chart's 8-tab
inspector states its unavailability reasons; `sx-sw__acquiring` is now a correct LOADING state.

**Verify:** each pane forced into all four states in a probe; add to the §12 definition of done.

**Depends on:** nothing. **Do before J6/J7/J8** or the fix is repeated per screen.

---

#### J4 · Screen state memory — *short*

**Pattern:** universal. Invisible when present, infuriating when absent.
**Player outcome:** the map, ship and station open where they were left.

**Build steps.** A per-screen state bag persisted per save — active tab, filters, sort order, layer
set, zoom/focus, scroll position, selected entity — restored in `onShow`. **Exclude anything unsafe
to restore** (a pending destructive confirmation resets).

**Seams:** `src/ui/screenManager.js` (a generic bag keyed by screen id), `src/save/saveSystem.js`,
`scripts/generate-save-schema.mjs` (schema is at v12 — regenerate `SAVE_SCHEMA.md`).

**Trap:** declare a cap and an eviction policy with the new save key, or it grows unbounded.

---

#### J5 · Everything is a link — *medium*

**Pattern:** EVE Online "Show Info", Destiny inspect — every noun is a door.
**Player outcome:** twelve menus stop being twelve menus. Read a contract naming a company → click →
standing, doctrine, territory, your history → click a sector → the Chart opens focused there.

**Build steps.**
1. One **entity resolver**: `id → { label, dossier, route }` covering faction, commodity, station,
   hull, module, captain, sector, contract.
2. One delegated click handler on `#screens` for `[data-entity="<type>:<id>"]`, opening a **DRAWER**
   (tier 3), never a modal-over-modal.
3. A tagging pass — emit `data-entity` as screens are built.

**Extends the existing tier-2 mechanism.** `src/ui/causeLedger.js` already hovers an explanation over
market rows from an **enumerated phrase bank** with the rule *"unknown tag renders NOTHING"*.
`[data-why]` is tier 2; `[data-entity]` is its tier-3 sibling. Keep the no-invented-text discipline.

**Why early:** the resolver is shared with the watch list and global find (`ADDITIONS.md` §3, §7).
Retrofitting tags into finished screens costs several times more than emitting them while building.

---

#### J6 · THE FOOTPRINT — *medium*

**Pattern:** Red Dead 2's wanted system + Crusader Kings' *"why does this person hate me"* causal chain.
**Player outcome:** the world visibly remembers. A hostile patrol is traceable back to the collision
that caused it. Key `F3` (canonical table, `INSTRUMENT_GRAMMAR.md` §10.5).

**Current state — the chain is already emitted and thrown away.**
- `src/systems/lawSecurity.js` emits `law:incidentReceipt`.
- `src/systems/factions.js` `applyRep(factionId, delta, reason)` emits
  `faction:repChanged { factionId, delta, reason, newRep, newTier, tierChanged }` — **carries `reason`**.
- Spillover emits `faction:repSpillover { factionId, delta, srcFaction }` — **carries `srcFaction`** —
  plus a second `repChanged` with `` reason: `spillover:${reason}` ``.

So *collision → incident → rep change → spillover to a faction you have never met → hostile patrol*
is fully reconstructible.

**Build steps.**
1. An **append-only `provenanceLedger` LISTENER**. It must not touch `lawSecurity`'s ring buffer or
   `factions`' mutation point. Note both existing stores actively discard history: `RECEIPT_CAP = 24`,
   `TRADE_LEDGER_MAX = 10`.
2. New save key with a **declared cap and eviction policy** (schema v12; `SAVE_SCHEMA.md` is generated).
3. Three linked panes: **Rap sheet** (crimes, sector, witness, decay clock, and **your bounty** — a
   number currently in zero UI files) · **Standing** (faction nodes with **visible spillover edges**)
   · **Log** (a queryable/filterable/sortable `shipLedger`, today prose-only, plus `lossLedger`,
   `aftermathWrecks`, surrender outcomes, and the **12 named aces who already remember your fights**).
4. **Verbs, so it is not a spreadsheet:** pay bounty, bribe (`bribeCost` exists in `factions.js`),
   find the accuser, take the amends contract, jump to the sector on the Chart.

**Trap:** surrender/custody must appear as a distinct outcome type — today a player **cannot tell a
mercy outcome from a kill**.

---

#### J7 · THE RANGE — *medium*

**Pattern:** Titanfall 2's gauntlet, Hitman training, Deep Rock tutorial bays — teaching by doing.
**Player outcome:** learns the physics toolkit by flying it, and can return to the lesson. Key `F4`.

**Precedent:** `src/ui/screens/drill.js` is a **3,154-line playable full-screen pausing minigame**
already in this repo. The pattern is proven — read it before designing.

**Build steps.** Three drills first, not thirty: a Massline swing with one asteroid and one drone; a
mass-versus-turn-rate slalom; an energy-budget hold. Then weak-point passes per enemy class, which
absorbs the **bestiary**: `src/data/enemies.js` (15 types, imported only by the dev sandbox),
`src/data/encounters.js` (48 encounters, 31 barks, 38 receipts — **0 UI importers**),
`weakPoints.js` (7 classes).

**Trap:** research points currently have **exactly one writer** (mission completion, `missions.js`).
Rewarding drills with RP is a **sim ask** — flag it, do not assume it.

---

#### J8 · THE CHART as a dispatch console — *long*

**Pattern:** X4's map, Total War's campaign layer, Death Stranding route planning.
**Player outcome:** answers *"where should I take this cargo, and is that route survivable?"* in
seconds — and lets the player act on the answer without leaving the map.

**Sharpen, never rebuild.** `src/ui/galaxyMap.js` is 10,109 lines and is the strongest asset in the
repo: 3 zoom levels, 8 toggleable layers, an 8-tab inspector with stated unavailability reasons, a
knowledge/staleness model, route plotting, search, bookmarks, live at ~15 Hz. **Nothing inside
`src/ui/map/mapCamera.js` moves** — its `zoomAt` is cursor-anchored and provably correct even when
the span clamps.

**Build steps, each fixing a verified defect.**
1. **Flows as economic pressure.** Inter-sector cargo *volume does not exist* — do not invent it.
   Compute surplus-vs-equilibrium from the shipped pure functions `economyEquilibriumForListing`,
   `economyStockTargetForRole`, `priceMult`. Replace `trade: bothCharted` (**graph adjacency
   relabelled as a trade lane**) with a pressure-weighted edge. Add a top-3-pressures mode — today
   the gradient shows **one commodity at a time**, defaulting to `'cmdty_ore_iron'`.
2. **Risk stops being zero.** `riskEstimator: () => 0` makes route ranking a lie. Feed it
   `dangerModel` + `securityReadout` + `factionPresence`, then offer **fast / safe / profitable** and
   state the trade-off in words.
3. **The living world.** `trafficRoleMixForSector(sector, state)` is a **pure function returning
   traffic composition** — a real layer with no new sim.
4. **Live events** from `src/data/conflictZones.js` (`CONTESTED_SECTOR_BY_PAIR`).
5. **Holdings** — `claims.js`: 15 sites, 6 buildable modules, 3 specializations, raids, defenses,
   currently undifferentiated dots with zero `claim:*` events subscribed.
6. **Sector dossiers** — 24 regional economy + 24 regional ecology profiles + 24 × 14 zone types,
   **all with 0 UI importers**.
7. **History** — "where I have been", fed from J6's ledger.
8. **Measurement, route comparison, layer presets, authored fog-of-war** (`A_LIST_GAPS.md` §6).

**Trap:** the Chart's rAF loop **never self-parks** — it runs every frame while open. Do not add a
second such loop; park it while the inspector is idle.

**Guardrail:** `design/VISION.md` forbids the X4 empire manager. **The player never issues an order
to anything but their own ship.**

---

#### J9 · Loadout presets and build identity — *long*

**Pattern:** Destiny loadouts, Monster Hunter equipment sets.
**Player outcome:** *"different kinds of gameplay"* becomes real, because switching is cheap enough
to experiment with. Verified absent — the only matches are the save system and the dev sandbox.

**Build steps.** Save named fits; swap at any station; a preset rail in THE SHIP's APRON. **Each
preset is labelled by playstyle, never by stats** — *"Tow & Swing · you can swing a frigate"* vs
*"Skirmish · you turn 40 % faster"*. `getDerivedStats`, `handlingProfile` and `massDelta` already
compute everything needed for the comparison.

**Depends on:** J2 — a preset must show what it changes about how the ship flies.
**Trap:** declare a cap and eviction policy on the new save key.

---

#### J10 · Visual regression in CI — *long, start early*

**Pattern:** standard practice at every A-list studio — reference frames diffed automatically.
**Player outcome:** nothing silently regresses.

**Build steps.** Extend the two existing probes — `scripts/probe-ship-screen-capture.mjs` and
`scripts/probe-ship-polish-audit.mjs` — into a **capture matrix**: default · reduced-motion ·
`forced-colors` · **pseudo-localized**, at **2560 × 1080 · 1920 × 1080 · 1280 × 720**. Commit
reference frames; diff on change; fail on a threshold.

**Why this is not optional here.** Three demonstrated cases where a green check coexisted with a
visibly broken screen: the clipped Mission Log card passes every check in the suite;
`check:ui-frame-sleep` inspects rAF and cannot see compositor-side `infinite` CSS keyframes; and
`screens/techTree.js` renders in browser-default 10 px sans on every frame because Canvas 2D silently
ignores `var()` in `ctx.font`. A fourth was found this session — the ship stage showed an empty bay
for 12 s while every check was green. **Until frames are diffed, "a green check is not proof" stays
permanently true.**

**Start as soon as J1 lands** — its value is proportional to how many screens exist to protect.

---

### 11.13 Ordering

```
J3 ─┐                        properties first: every screen after inherits them free,
J4 ─┼─► J1 ──► J2 ──► J9     every screen before must be revisited
J5 ─┘        └─► J6 ──► J8
             └─► J7
                             J10 runs alongside everything from J1 onward
```

Two rules decide this shape:

1. **J3, J4 and J5 are properties, not features.** They are the same class as the colour token block
   and the canonical key table — §11.9's scheduling law applies: *anything every screen needs must
   exist before the first screen is built.*
2. **J10 starts as soon as J1 lands.** It protects everything built after it, and this repo has four
   proven instances of a green check over a broken screen.
