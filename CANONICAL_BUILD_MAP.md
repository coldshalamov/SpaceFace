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
