# HANDOFF — remaining graphics-coverage work (2026-11-17)

Written at session close. Read this together with:
[`HANDOFF-REMAINING-20261117.md` companion state in the ledger itself]
(`node scripts/fleet/asset-review.mjs summary` is the authoritative starting point),
the [session's dispatch records](../../../../.devshots/fleet/dispatch-20261116/), and
[`docs/visual-assets/README.md`](../../../../docs/visual-assets/README.md).

## 1. State at handoff

- **364 models `passed`** with byte-hashed evidence and per-model journals (from 0 at
  session start on 2026-11-16).
- **123 `needs follow-up`**, every one with a precise, actionable defect note — most with
  exact mesh names, draw counts, and root causes. This is NOT finished work; it is
  diagnosed work awaiting construction fixes (§2) and capture-gap closures (§3).
- **~3,100 records** remain `unused/unresolved` or outside the playable set — identity
  analysis exists ([`scripts/fleet/identity-resolve.mjs`] output in
  `.devshots/fleet/dispatch-20261116/identity-resolution.md`); 1,264 groups are resolved
  with evidence, 1,784 remain honestly ambiguous.
- **8 local merge commits** (not pushed): `22a64e280f` ledger+tools, `e60c23c202` machines,
  `c087fb564f` asteroids, `3b2144d4eb` viewer+renderer wedge fix, `50f15e9d18`, `93f64e2802`,
  `1a93fbe9cf`, `00153ae8e2`, `2712905c0a`, `c2fdcda089`, `9a979228a3` (hornet),
  `52029fa1a6` (mesh-drop race fix), `3baa61b667`, `ca79341167`, `ef8a07e2e4`.
- **918+ recorded iterations** across 200+ models in
  `design/program/fleet/graphics-asset-review/iterations/`.

### Uncommitted tree state (decide before doing anything else)

| Item | Files | Status |
| --- | --- | --- |
| Station-kit forge attempt | `tools/blender/forge/ships/var_station_kit_*.py` (14) + rebaked `assets/ships/release/parts/places/var_station_kit_*.glb` (14) | openencoder6's session stalled mid-task; the forge bake did NOT visibly densify interiors (post-bake captures in `.devshots/.../station-kit-fix-20261116/` look the same as baseline). Keep-for-reference or revert — decide when dispatching §2.3. |
| `--dist` camera override | `scripts/fleet-look.mjs`, `src/render/fleetLook.js` | devin3k's override flag — REQUIRED for the wide-radius recaptures already accepted into the ledger (landmarks, last_argument, ceres_breaker). Commit this before any push. |
| Presented-frame race fix | `src/render/renderer.js` | COMMITTED in `52029fa1a6`. |
| Crusher module GLB | `assets/ships/release/parts/places/place_crusher_module.glb` | Prior session's work (steel collar fix), pre-existing dirty — not this session's. |
| Everything else dirty (~240 files) | greeble/apron/crusher packages, character+fauna sources, belt-empire/asteroid-puzzle systems, field-build UI, ninth-mouth tests | Other agents' concurrent work. Preserve. |

## 2. Construction fix waves (models flagged `needs follow-up`)

Each wave below has per-model defect notes IN THE LEDGER (run
`node scripts/fleet/asset-review.mjs show <modelId>` — the `issues` field carries the fix
spec; the recorded events in `events-*` dirs carry mesh names). Dispatch as focused
worker briefs the same way this session did (template:
`.devshots/fleet/dispatch-20261116/brief-*.md`).

### Wave A1 — procedural ship builder rework (22 models, systematic cause)

**Cause (one fix, 22 symptoms):** the procedural ship builder grafts Kestrel-derived parts
onto every body — `recessedCanopy` bubble wider than the fuselage, `ship:dish` on sticks,
`hullSlabGeo` grime slab 1.5× hull width, floating `addNavBlinkers` orbs, `nose:panel`
decals projecting past tapers, detached `engineProp` nozzles — plus glow-dominated
primitives (`emissiveIntensity` 1.2–2.8 solid-white spheres/bars) and un-beveled box
stacking. Full per-body defect list: recorded events `events-agy1/agy1-procship-*.json`
and `results/agy1-procships.md`.

Fix: rework the part-grafting to measure against each body's own hull cross-section,
bevel stacked boxes, cap emissive intensity, attach nozzles to hull surfaces. Faction
lore bodies (vael-sniper, concord-interdictor, drift-barge, meridian-trader,
quiet-raider, reaver-pirate) have strong silhouettes — preserve them; fix only the
floating/clipping/glow parts. Fleet-look routes + `--init` staging commands are in
`batch-plan.json` (`proc-ships-enemy/family/faction`); devin3j's session corrected the
poisoned fetch-block init — use its corrected pattern
(`results/devin3-procships.md`).

### Wave A2 — open-water fauna volume rebuilds (18 species, mesh-level specs)

All 18 `needs follow-up` species have exact defect + mesh names in
`events-agy1/agy1-fauna-*.json` and `results/agy1-fauna-open.md`. Group by cause:

- **Flat-card**: archive_crab (4 slab `ac_plate`s).
- **Occluded cores**: blind_shepherd (`bs_skirt` hidden under `bs_shell`), furnace_maw
  (`fm_bowl` seals `fm_throat`), stone_lung (`sl_throat` entombs `sl_core`).
- **Featureless primitives**: bristle_ram, hull_leech, glassback (untextured dome),
  suture_mite, wake_eel (9 sphere beads).
- **Glow dominance**: needle_swarm (`ns_core` 0.8 dominates), spindle_mother (18 glowing
  spheres + crown 1.4), void_carrier (132 WU, 19 glare spheres, crops frame).
- **Edge-on/thin**: black_sail (0.06-thin ellipsoid captured edge-on), mourning_kite
  (hairline stem).
- **Primitive geometry**: pilgrim_spine (6-sided cone + straight cord).

The in-code recipe to follow: the Bolus folded-volume rebuilds (blister/mote/nerve/
papilla/pearl/pleat/polyp/rib/ring/scale/spur — all passed) — bounded folded brown
volume, crease texture, preserved silhouettes. `veil_ray` needs a nose-root seam fix +
non-nursery site variants; it otherwise passes.

### Wave A3 — station-kit interior content (14 kits, one shared cause)

Forge attempt (openencoder6) edited `tools/blender/forge/ships/var_station_kit_*.py` and
rebaked, but post-bake captures show interiors still sparse — either the edits were
insufficient or the bake didn't pick them up. Its session stalled before explaining.
Decision needed: (a) diagnose its forge edits and re-bake properly, or (b) switch to the
JS-side content route. Target: interior module density comparable to the passing
`place_station_blackmarket`/`fab`, faction accents per variant — archive=archive racks,
choir=spires, concord=blue modules, drift=drift buoy, frontier=frontier towers,
fulfillment=container stacks, helix=helix core, meridian=meridian spire,
pitborn=scrap blocks, quiet=dim quiet-hab, reach=reach arm, understory=growth domes,
vael=vael fins, verge=survey masts (match each faction's existing color accents).
All 14 ledger entries are `runtime:SF_PLACE_STATION_KIT_<FACTION>:var_station_kit_<faction>_v01`.

### Wave A4 — small fixes

- `place_aftermath_frag_grating_sheet` + `..._authored_down` (2): standing flat/dark-at-
  approach finding from the 20261115 batch — material/geometry fix, then recapture.
- `runtime:SF_PLACE_LATCH_NINE` etc: none — fine.
- `procedural:bomb:concussion` — DONE (passed 2026-11-16).
- `runtime:SF_PLACE_CUSTOMS_PYLON` — plain body; the active redesign workstream owns it.
  Recapture after that lands.

## 3. Capture-gap closures (no construction needed — recapture/verify)

- **`--dist` recaptures DONE and passed**: last_argument, ceres_breaker, 4 landmarks.
  The `--dist` override in `scripts/fleet-look.mjs` is uncommitted — commit it (§1).
- **`place_aftermath_aft_dock_collar`** — recapture (piece too small for auto-framing).
- **`place_aftermath_aft_radiator_panel`** — recapture at an angle (was edge-on).
- **`procedural:environment:bolus_canal_rib`** — capture a frame with canal ribs clearly
  in view (sector shot had ribs inconclusive).
- **ruckus characters (2)** — BLOCKED: character GLBs use `spaceface.character.ruckus.v1`
  schema, not the part contract; needs a character path in `fleetLook.js` (owner: next
  viewer worker; the schema facts are in `results/devin3-sites-props.md` era logs and
  devin3g's notes).
- **veil_ray completeness** — nursery aggregate flock + 4 non-nursery sites use an
  uncaptured primitive builder (`buildVeilRay`); nose-root seam slot open.
- **Motion states** — all fauna/machine captures are static t=0; `defense`/`retreat`/
  `alarm`/`charge` states, strain variations under motion, and armed-bomb-in-flight
  views remain uncaptured (agy1's report §Remaining; machines idle/working ARE done).

## 4. Verification passes (the noted residual gap on every passed model)

All 364 passed models carry: "ordinary-play encounter/approach/composition view
remains the noted residual gap." The completion pass is:

1. Ordinary-play flythroughs past each family (asteroid field, Works site, stations,
   claim outposts, aftermath field, cargo yard, Bolus canal) with screenshots — one
   session per family cluster, family-batch commands exist in `batch-plan.json`.
2. In-scene composition checks for the structural kit pieces (crossbeam/keel/long_plate),
   vault's near-black body, cockpit_slab's dark canopy, refinery module midtones.
3. Record `ordinary-play` scope iterations via the recorder for models where the play
   view confirms the isolated pass.

## 5. Owner actions (only you can do these)

1. **Asset server refresh/restart** — the boot-swarm gate refuses until served assets
   match HEAD (~19 stale package files listed in `.devshots/fleet/gate-boot-swarm.log`).
   Harness verdict: "not a gameplay FAIL", but the gate stays refused until synced.
2. **Push decision** — 8+ local commits on master are unpushed.
3. **devin acct4** — unauthenticated (`devin-acct.cmd acct4 auth login`); optional 4th slot.
4. **openencoder6's stall** — if you run it again, the deepseek-v4.1-flash-free model via
   `opencode run` can hang silently 2h+ on large briefs; the forced-early-output kickoff
   helped but did not fully prevent it. Prefer devin slots for long briefs.

## 6. Process manual (how to resume)

- **Start**: `node scripts/fleet/asset-review.mjs summary` → the ledger IS the queue.
- **Worker slots**: `devin-acct.cmd acct1|2|3 -p --model swe-2-max --permission-mode
  dangerous --prompt-file <brief>` (acct4 unauthenticated); `agy-acct.cmd agy1|agy2
  --model gemini-4-hydrogen-xhigh --dangerously-skip-permissions --print "<pointer>"`;
  `opencode run --model opencode/deepseek-v4.1-flash-free --auto "<pointer>"`. agy
  print-mode buffers output until the turn ends; opencode can hang silently on very
  large briefs (force early visible output; prefer devin for long ones).
- **Renderer runs**: always `node scripts/fleet/game-lock.mjs run -- ...` with
  `SF_GL=d3d11` + `PLAYWRIGHT_BROWSERS_PATH=C:\Users\93rob\AppData\Local\ms-playwright`.
- **Ledger discipline**: single writer (the orchestrator) applies `record`/`status`;
  workers write event JSONs only. The recorder rejects duplicate action+observation
  pairs and unknown LOD targets (targets are `<asset>#lod0` / `wholeship_<asset>#lod0` /
  `procedural:<...>:lod0` / `primary-or-contained-lods` — check `show <id>` first).
- **Usage walls**: agy accounts have 5h windows (429 RESOURCE_EXHAUSTED is retryable —
  wait or switch account); deepseek-free via opencode can hang on huge briefs.
- **Session-transcript recovery** works: agy transcripts at
  `~\agy-profiles\<profile>\.gemini\antigravity-cli\conversations\*.db` (sqlite `steps`
  table); devin sessions per directory (`devin list` / `-r <id>` / `--export`); opencode
  sessions in `~\.local\share\opencode\opencode.db` (`opencode export <id>`).
- **Known pitfalls**: FIFO lock fairness (foreign demo/gate runs interleave — wait,
  don't kill foreign work); oversized hulls/megastructures need `--dist` wide captures;
  duplicate record attempts throw (expected — means already recorded); zombie worker
  processes outliving their wrappers (`taskkill /PID <pid> /T /F` after tracing ancestry
  via `Get-CimInstance Win32_Process`).

## 7. Completion definition (when is it "finished")

Every in-scope model `passed` with: current-isolated evidence at game scale (chase+
close+inspect, LOD0+LOD2, both states where applicable) AND an ordinary-play scope
iteration confirming the in-scene read. Zero `needs follow-up` whose issues field
describes an unbuilt fix. The `unused/unresolved` set stays honestly ambiguous until
you decide unreferenced-kit = excluded-from-scope (devin2's analysis gives you the
evidence to decide: 60 runtime-reachable, 1,130 authoring-only, 74 duplicates,
1,784 ambiguous).

## 8. IN-FLIGHT AT HANDOFF (2026-11-17, all background OS processes — they run without a session)

| Worker | Model | Task | Outputs on completion |
| --- | --- | --- | --- |
| cursor-agent `grok-4.7-xhigh` | proc-ship builder rework ×22 | events `events-grok/`, captures `proc-ships-*-fix-20261117/`, report `results/grok-procships.md` |
| agy1 `hydrogen-xhigh` | fauna volume rebuilds (anchor_beast…needle_swarm, 9) | events `events-agy1/agy1-rebuild2-*`, captures `fauna-rebuild2-20261117/`, report `results/agy1-fauna-rebuild2.md` |
| agy2 `hydrogen-xhigh` | fauna volume rebuilds (pilgrim_spine…furnace_maw, 9) | events `events-agy2/agy2-rebuild2-*`, same capture dir, report `results/agy2-fauna-rebuild2.md` |
| devin acct1 `swe-2-max` | recaptures: dock_collar, radiator_panel, bolus ribs | `recaptures-20261117/`, report `results/devin1-recaptures.md` |
| devin acct2 `swe-2-max` | grating sheet fix ×2 | `grating-fix-20261117/`, report `results/devin2-gratings.md` |
| devin acct3 `swe-2-max` | ordinary-play flythroughs (5 clusters + bolus) | `ordinary-play-20261117/`, report `results/devin3-flythroughs.md` |
| opencode `deepseek-v4.1-flash-free` | station-kit interior diagnose + fix ×14 | forge/GLB edits in tree, captures `station-kit-fix2-20261117/`, events `events-openencoder/openencoder7-*`, report `results/openencoder-stationkits2.md` |

### Resume checklist for the next session (fresh context — do NOT resume this one)

1. `node scripts/fleet/asset-review.mjs summary` — the ledger is the queue (364 passed / 123 flagged at handoff).
2. For each completed worker above: validate its event JSONs (schema, evidence exists, LOD
   target names — check `show <id>`; targets are `<asset>#lod0` / `wholeship_<asset>#lod0` /
   `procedural:<...>:lod0` / `primary-or-contained-lods`), visually accept the captures
   yourself (Read the `_sheet_*` images; the swarm/accept04 foreign runs may appear in
   frames), then `record` + `status` per model — the apply-scripts pattern lives in
   `~/.zcode/tmp/fleet-orchestrate/apply_*.py` (copy the pattern; that tmp dir may be gone).
3. Station-kit caveat: openencoder7 was dispatched to DIAGNOSE why openencoder6's forge bake
   didn't densify, then fix — check its report before trusting `station-kit-fix*` captures;
   if its fix route was JS-side, `station-kit-fix2` captures are the evidence.
4. Known-active pitfall: `--dist` override in fleet-look/fleetLook is UNCOMMITTED — commit
   it with the next wave (wide-recapture statuses depend on it).
5. Construction backlog after these land: 22 proc-ship reworks are in flight; 18 open-water
   fauna rebuilds in flight; remaining = customs pylon (external redesign), ruckus viewer
   character route, then the ordinary-play verification pass over all passed models (§4).
6. Usage: agy accounts 429 on 5h windows (retryable); deepseek-free hangs silently on very
   large briefs (force early output; prefer devin for long ones); devin acct4 is NOT an
   account — only acct1-3 exist and are logged in.

---

## ADDENDUM — orchestrator session 2026-11-17 (~06:16–10:00): waves landed

State at THIS session close: **485 passed / 4 needs follow-up / 29 pending** (ledger is
authoritative; 1,074 iterations). This addendum supersedes the §2/§3 wave lists above —
all of them landed.

**Waves landed and applied (all visually accepted by the orchestrator before record/status):**
Wave A1 proc-ships ×22 (grok; one systematic builder fix); A2 open-water fauna ×18
(agy1+agy2); A3 station kits ×14 (openencoder7's 06:04 forge bake was verified GOOD by
grok's byte probe — +~16k tris/kit at radii HEAD had empty; packages aligned; accents per
faction); A4 gratings ×2 + dock collar + radiator panel (plate was never built — added per
fin comb in `build_wreck_aftermath_pack.py`) + bolus canal ribs (flat annuli → extruded
bands + warm self-glow in `bolusCanal.js`/`bolusView.js`); bolus inner fauna ×16 (agy1,
recovered after its 429 death — edits + queued captures landed, orchestrator applied);
machines ×6 (4 passed; custodian+mason defects found by capture analysis, fixed, re-passed);
ruckus + pressure-core (new `--character=` route); greebles 4 of 7; proc characters ×7 +
optic cells ×8 + kestrel-hero (new `--proc-preview=` route); places ×18 (isolated +
census-confirmed in-scene evidence); ordinary-play scope recorded for 32 (model, frame)
pairs from the flythrough + positioned visibility logs.

**The 4 remaining `needs follow-up` are owner-gated, not constructible here:**
1. `place_customs_pylon` — external redesign workstream.
2–4. greeble nav_lights / rcs / vents — routing gap in `partsLibrary.js` (mount branches
unreachable; issues fields carry the full diagnosis). Commission a consumer, reroute, or
retire from scope.

**29 `pending`** = ROCK-family places + pressure-core companion — LOOK/ROCK packet lane.

**Committed this session (master, unpushed):** `18bf8d2437` (--dist override),
`d60fbad6bc` (ledger-tool coverage machinery), `9879b4ed42` (harness: character route,
proc-preview, visibleObjectBounds, per-view --dist, positioned sector shots),
`e61da309e3` (fauna/bolus/machine builder wave + tests). NOT committed (coordination
needed): proc-ship builders (`visualFactory.js` carries foreign changes mixed with grok's
work), grating/radiator/station-kit asset GLBs + render packages, and the generated
metadata churn (`release_manifest.json`, `pilots.json`, `renderPackageManifest.js` — pins
foreign agents' uncommitted packages; coordinate before any partial asset commit).

**Worker session notes:** agy1 + agy2 both hit the 429 wall mid-task (~07:35–09:00);
their edits landed and were recovered/verified by the orchestrator (see apply scripts in
`~/.zcode/tmp/fleet-orchestrate/`). Two hung opencode zombies killed after ancestry +
flat-CPU checks (00:32 and 05:42 dispatches). devin acct4 IS now real and in use by the
packet lane (`scripts/fleet/run.mjs` uses acct4 profiles) — the §6 note above is stale.
Rock-surface pixel checks and per-frame pixel diffs are in the workers' reports.

**Remaining §4 work (the honest open scope):** broad ordinary-play confirmation for the
other ~450 passed models (harness now exists: positioned sector-shots + per-family batch
commands; the 32 recorded pairs cover the models actually visible in the 12 frames
captured so far), motion/defense/retreat state captures, and the ordinary-play fleet
flythrough families not yet framed (cargo yard, claim outposts beyond helios relay).

### ADDENDUM 2 (2026-11-17 ~14:40) — triage paused for owner playtest; resume notes

Owner asked for a clean machine to playtest. Two runtime-reachable triage waves were
paused mid-run (workers killed cleanly; partials preserved):

- **alien-growth ×13** (devin2): route FULLY traced — `buildAlienGrowthProp` via
  `placeId = 'alien_growth_<moduleId>'` dressing at ALIEN_SITES (see
  results/devin2-triage-algrow.md for the complete route table + module multisets).
  Site captures (seed 424242) at `.devshots/fleet/dispatch-20261116/algrow/<site>/`
  (7 sites + `_diag_refinery`); batch3/batch5 capture scripts alongside. RESUME: review
  the 7 site frames, judge the 13 groups, stage events + report.
- **factory ×18** (devin3): 5 events staged at `events-devin3/` (grep triage-factory);
  captures under `.devshots/fleet/dispatch-20261116/triage-factory/` (beacon done,
  others pending). RESUME: continue from its brief
  (brief-devin3-triage-factory.md), skipping the staged 5.
- **presentation ×29+1** (grok): COMPLETE and applied — 10 passed (ordinary-route
  captures), 7 covered-by recorded, 13 hidden-until-state triaged-unused/unresolved with
  route evidence (see results/grok-triage-presentation.md). Flag carried for the owner:
  swarm rounds 7/30 hit GameStartReadinessError / BUILDING-THE-SCENE stall under
  shot-mode boots — worth a look before a swarm playtest.

Rocks ×29 applied (pending bucket 0). Ordinary-play recorded pairs: 32. Scope decision:
facts/unused-unresolved-scope-decision.json (commit 3098531edd).

### ADDENDUM (agy2 usage wall #2)

agy2's fauna-rebuild batch 2 (9 species: pilgrim_spine, suture_mite, stone_lung,
spindle_mother, veil_ray, void_carrier, wake_eel, cold_bell, furnace_maw) died mid-wave
on the agy 5h usage window (429). Before rebuilding those species, the next session must:
(1) check `src/render/` fauna builder files for PARTIAL agy2 edits (`node --check` each),
(2) count which `events-agy2/agy2-rebuild2-*` event JSONs exist (completed species),
(3) check `fauna-rebuild2-20261117/` capture subdirs for completed batches. agy1's batch 1
completed successfully and its events/captures are trustworthy. agy usage is wall-limited:
re-dispatch agy rebuilds only after the 5h window resets, or split to deepseek/devin.
