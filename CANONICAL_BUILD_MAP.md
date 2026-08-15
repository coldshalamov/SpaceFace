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

Use [`design/PERF_BUDGET.md`](./design/PERF_BUDGET.md). Preserve the target and floor profiles. Optimize invisible work first. Do not pass by lowering default render scale, effects, shadows, particles, asset detail, or content density. The durable multi-approach tradeoff board lives in [`design/PERF_SYSTEMATIC_PROGRAM.md`](./design/PERF_SYSTEMATIC_PROGRAM.md). The exhaustive same-picture option space — including investigations, scaffolding, tabletop-correct cuts, and large Worker/WASM/WebGPU/native/Rust jobs — lives in [`design/PERF_OPTION_SPACE.md`](./design/PERF_OPTION_SPACE.md) and is reserved as §8.2.

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

### 8.2 Full same-picture option space (`PQ-061`–`PQ-123`)

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
| **`PQ-115` / `PERF-75-VFX-ONGLASS`** | Near IMPL | Trails/lights/flipbooks follow the table. Station-side, seam, NPC job-signature, and loot-magnet draw use `tableVfxDrawWuFromState` (live glass), not a 1500/640/300/580 WU horizon. Loot-magnet trails keep a separate 580 WU player-centered tractor cap. Station-side, seam, NPC, and loot-magnet glass culls use `tableLookAtDelta` (frame-local focus + frameOrigin). Station side-event planning anchors on `tableSimAuthorityWuFromState` plus that station type's farthest eligible mover path, not a 1400 WU horizon. Player trails stay. |
| **`PQ-116` / `PERF-76-HDR-BUFFER-FORMAT`** | Mid INV→IMPL | Cheapest HDR target that keeps the default halo. |
| **`PQ-117` / `PERF-77-HIDDEN-SYSTEM-SKIP`** | Near INV→IMPL | Registry systems do not full-tick when 3D is hidden. |
| **`PQ-118` / `PERF-78-REPLAY-PERF-BISECT`** | Mid INV | A hitch is reproducible from input+seed. |
| **`PQ-119` / `PERF-79-TABLE-MAP-SPEC`** | Near IMPL | Off-table contacts stay map/radar facts, never live 3D. |
| **`PQ-120` / `PERF-80-TABLE-READABLE-REMASTER`** | Near INV→IMPL | Remaster budget goes to mid-scale openings that read at default zoom, not micro-greeble stacks. |
| **`PQ-121` / `PERF-81-VFX-FOCUS-ORIGIN`** | Near IMPL | Cosmetic VFX cull from the live look-at, not only the player pin, so a combat/tether camera shove does not drop on-glass lights. Seams, station lamps, NPC signatures, and loot-magnet glass checks share `tableLookAtDelta`. Tractor cap stays player-centered. Sim traffic/bark still use requested zoom. |
| **`PQ-122` / `PERF-82-TABLE-ASPECT-CLAMP`** | Near INV | If a live window is wider than three 16:9 panes, either letterbox the camera to that bound or accept that far side-edge civilians sleep. Do not grow sim authority back into a horizon. |
| **`PQ-123` / `PERF-83-INSTANCE-FAR-CULL`** | Near IMPL | Instance far cull follows the max-zoom table (`TABLE_HEARING_FAR_WU`), not a leftover 9000 WU horizon. The 420 WU owner-sphere pad stays so a large on-glass station cannot vanish. Submit still drops off-table roots first. |

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
