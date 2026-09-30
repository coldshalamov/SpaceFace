# Blender motion reference program

## 1. Outcome and selected slate

Owner request: research the best 10–20 actual 3D-model animations, brainstorm and debate them with independent agents, collect model-matched Grok video references, and write build tasks that iterate against those movies. This is not a UI redesign, a movie player inside the game, or another particle/light pass.

The research slate contained 15 ideas. Visual review selected **13 reference-backed animations**, plus shared foundation **ANI-00**. ANI-04 radiator louvers and ANI-12 docking clamps are retained, unselected ideas: their generated mechanism geometry was not faithful enough to copy. They are not blocked assignments in the active queue. **These are references and future build tasks, not implemented runtime animations.** The Wave ANI section of `build_map.md` is the dispatch front door.

Three independent combat/flight, working-world, and pipeline perspectives brainstormed and debated the slate. Prefer repeated tool operations, the Massline's physical coupling, recognizable damage, and purposeful large machinery. Drop generic idle wiggles, nav blinks, another turret-recoil pass, and colour-only EMP effects. Keep breakup because physical mass is central to the game, but never delay a kill or bake a wreck actor's gameplay trajectory to fit a movie.

## 2. Frozen reference pack

- [Reference library](../../assets/animation-references/index.html): the 13 reviewed movies, source pictures, mechanism scope and notes.
- [Manifest](../../assets/animation-references/manifest.json): the authoritative selected IDs, video/input/context hashes, actual tool/model/session/request, source builder/release locators, capture/crop parameters, native FPS/frame counts, review notes and phase landmarks.
- [Generation jobs](ANIMATION_REFERENCE_JOBS.json): lead-authored exact prompts and current approved input choices. Source part names are **authoring locators/prefix families**, not proof of exported runtime node identity.
- `assets/animation-references/videos/ANI-<nn>.mp4`: accepted reference only. Rejected candidates, extracted native frames, contact sheets and raw transcripts remain in ignored `.devshots/animation-references/`.

The movie is visual design evidence, not replacement mesh or gameplay authority. Use the real source model's geometry, dimensions, material roles, sockets, mass and colliders. Do not reproduce incidental AI surface drift, unattached pistons, a twitching unrelated deck plate, or changing background stars. Proposed iris hardware, a repair arm, a cargo interior/retainers and hull-specific fragments are explicitly new geometry; do not falsely claim they already exist in a source export.

During collection, `a66c602b4` republished the same Forge bodies with v2 shared plating and look tuning. Captured source hashes identify the original image inputs; frozen image and movie hashes remain reference provenance. Current Forge geometry/materials own the build. Re-review identity if structural geometry changes; do not overwrite captured hashes or regenerate approved reference videos to make a draft pass.

## 3. ANI-00 — real Blender-action export and playback

### Verified gap and decision

`forge_export.py` welds ordinary objects by hook/finish and material in `_lod_meshes/_join_named` and exports with `export_animations=False`. `assetLoader.js::compileBlueprint` rejects baked clips, skins and morphs. The dynamic render-package lane can preserve articulated rigid groups; `flight-static-v3` flattens transforms and forbids dynamic names. `staticChildMatrices.js` freezes unmarked nodes. The renderer names `updatePlaceMotion`, which is absent in the inspected infrastructure tracker: reconcile the current owner and prove the place route rather than inventing a parallel broken path.

**Decision:** author actual rigid-part rigs, actions, easing and timing in Blender; export a curated hash-bound **motion-bank sidecar**. Preserve the existing contract GLB's no-clip/no-skin/no-morph guarantees. No handwritten sine-wave substitute, animated video texture, or indiscriminately unfrozen scene graph counts as this foundation.

### Exact interfaces and invariants

1. Add `Ship.motion_group(id, pivot, objects, parent=None)` alongside Forge's existing hooks. Preserve the explicit pivot empty and rigid children, keep them out of ordinary material welding, and give mirrored groups stable distinct semantic IDs rather than guessing Blender suffixes.
2. Author real Blender keyframes in `tools/blender/forge/animations/ANI-<nn>.py`, called by the owning builder. Reproducible Python/action source recreates the rig; local working `.blend` files are not the only source.
3. Evaluate the Blender action at **60 samples/second** into `assets/ships/motions/<model>.motion.json`. Use the existing Blender `(x,y,z)` → glTF `(x,z,-y)` basis. Pin a known transformed point and socket in a test. Do not re-derive separate JS timing that only resembles the authored action.
4. Bank schema is `spaceface.rigidMotionBank.v1` with `rigId`, `sourceAssetId`, `sourceGlbSha256`, `fps:60`, `bindings` and `clips`. A binding names its stable semantic group/parent, rest TRS, and explicit `requiredAtLod`/`optionalAtLod` subsets of 0/1/2. Required missing groups fail closed; only declared optional omissions may sleep. A visible action needs its readable representation at the relevant LOD.
5. A clip declares `durationS`, `loop`, `endMode:'rest'|'hold'` and channels. Channels declare group, `path:'translation'|'rotation'`, increasing finite times, matching-sized rest-relative values, and `interpolation:'linear'|'slerp'`. Validate bounds and unit quaternions. Reject scale, root, camera, collider, whole-hull, simulation-owned actor, undeclared-group and unknown-schema channels. Ram/hoist links slide as rigid parts rather than rubber-scaling solids.
6. Add validated `runtime.motionBank:{uri,sha256,bytes,rigId}` to the existing render-package runtime table under `runtimeHash`, with source/pilot authoring fields and bundle inclusion. Verify source-GLB hash through source→release provenance, not against differently compressed release bytes. Curves and semantic bindings survive compression/package compilation.
7. Dynamic groups retain the moving hierarchy; immutable geometry retains the flat instance plan. Articulated places cannot remain on `flight-static-v3`. Mark only moving nodes `userData.animated`, exempt them from static-child freezing, opaque merging and stale depth-prepass copies, and explicitly update their matrices.
8. Runtime interface: `bindAuthoredMotion(instance, bank, options)` returns `setState({state,startTimeS,rateScale,generation})`, `update(timeS)` and `dispose()`. Bind group references/rest poses once per mesh/LOD generation. Unchanged state never restarts a clip; interruption chooses an authored transition; mesh replacement cancels old callbacks and rebinds. No settled-frame allocation or repeated scene traversal.
9. Flight/world clips use simulation/presentation time and freeze on gameplay pause. Docked **inspection previews** may have a cosmetic render clock, but cannot advance crafting, repair, inventory or simulated results while paused. Off-glass instances sleep and sample the correct current phase on return rather than replaying a backlog.
10. Each moving group has exactly one transform owner. Reconcile damage, gimbal, recoil and infrastructure writers. Preserve the player heading/trail fix: no cosmetic whole-hull yaw or camera kick. New iris child groups are not claimed by the existing bell/gimbal name scan.
11. Cosmetic travel stays within the solid envelope and out of flyable openings. Meaningful changes to blocking volume need exported phase geometry with physics-owned collider updates. Do not cover a physically open throat. Export a maximum animated camera-clearance envelope once so deployments do not repeatedly jig chase-camera roof clearance.

### Foundation proof

One actual Blender action survives source → GLB + bank → release → package → bound live instance and runs from a real game action. Start with the Kestrel scanner, then prove one non-gate articulated place before opening the world tasks. Resolve the missing place-driver seam as part of this proof.

Owners: `forge.py`, `forge_export.py`, `publish.mjs`; `assetLoader.js`; `scripts/lib/renderPackageCompiler.mjs` and `scripts/build-render-package-pilots.mjs`; `src/contracts/renderPackage.js`, `renderPackageLoader.js`, `staticChildMatrices.js`; a narrow render-side motion controller and existing ship/infrastructure bridges; model-specific action modules.

Focused tests cover pivot/channel/signed-mirror preservation, coordinates/rest-relative transforms, illegal/missing binding rejection, two independent instances, start/restart/interruption/reset, pause/reduced motion, LOD rebind, disposal/release, freeze exemptions and actual default-route playback. Declare moving-group counts and inspect instance-plan/draw/matrix cost in a representative crowded view. Do not evade scan limits, remove detail or unfreeze everything to pass. Preserve input, physics velocity, damage thresholds, resource accounting and action latency. Verify asset identities and playability after runtime integration.

## 4. Selected animation build tasks

Each task requires a Blender action, correct source rig/pivots, bank/release/package wiring, actual event/state binding, reference comparison, lifecycle tests and a visible default-route demonstration. A score or manifest entry alone never finishes a task. Metadata in the manifest names the exact approved movie and scoped geometry differences.

### ANI-01 — scanner dish deploy, aim, pulse and park

**Model:** Kestrel `kestrel.py`, `DishPedestal`, `Dish`, `DishHorn`, `DishFeed`, `HOOK_SENSOR_DISH`.

**Motion/UX:** short attached pedestal lift, dish aim/sweep, feed response and damped park. The roof spine stays rigid; a shed sensor stops rather than floating.

**Live hook:** scanner emits `scan:pulse`/`scan:completed`, but current pulse lacks emitter identity and world ecology also emits completion. Add scanner-owned additive `source:'player-scanner'`, `scannerId` and sequence fields; consume only that accepted source/actor/sequence. Do not replay rejected scans or generic completions. Keep cooldown/results immediate.

**Proof:** split real pedestal/dish pivot groups; test cooldown repetition, interruption, sensor loss, rebuild and chase/close readability.

### ANI-02 — mining-head deploy, bite and stow

**Model:** Kestrel `MiningClamp`, `MiningCutter`, `SOCKET_Mining_Front`.

**Motion/UX:** short rigid guide extension, a purposeful pressure/bite working state, withdrawal and lock. Real source cutter diameter bounds the design. Keep the drawn emitter at its validated socket or an explicitly authored presentation-emitter group; never put the beam inside the deployed head, move the simulation ray without its owner or gain mining range.

**Live hook:** `mining:start`/`mining:stop` with actual miner ID and resolved verb; real drill approach/start/end only in that mode. Publish a read-only active-verb projection if needed, rather than assume every Forge hull sets a kit-only flag.

**Proof:** existing kit drill spin does not animate the integrated cutter. Test retarget, denial, vent, cargo-full, depletion, stop and endpoint attachment.

### ANI-03 — Massline payout, catch, loaded reel and release

**Model:** `yard_tug.py`: `WinchDrum`, `WinchCable*`, `WinchFlange`, `WinchCheek`, `Fairlead`, `FairleadRoll`, `TowHook`, `SOCKET_Tether_Massline`. Extend later to host-reviewed liner/player adapters.

**Motion/UX:** local fairlead aim, payout, catch/load response, geared reel, slack release and park. Drum travel follows real line work and stops under a stall.

**Live hook:** actual owner/target and attachment phases in tether gameplay, combat attachments and occupational tow lines; latch, strain/snags, release/cut and restored attachments.

**Proof:** `WinchCable*` are drum wraps. The reference rope illustrates the existing simulation/VFX tether, not a second Blender rope. Never yaw the host to aim or turn a main drive into a fake winch. Verify NPC/player ownership and once-only release; omit incidental unrelated plate twitch from the movie.

### ANI-05 — compact boost iris / actuator lock

**Model:** Kestrel `DriveBell`, `DriveCollar`, `DriveRing`, `DriveClamp*`; a small new segmented iris/rotor inside the existing aft opening. No giant roof fan or rubber nozzle.

**Motion/UX:** compact ignition/open or indexed powered pose, hold, close/stow and lock. Keep original nozzle diameter and fixed documented petal count; do not copy AI detail drift.

**Live hook:** real `ship:boostStart`, `ship:boostStop`, `ship:dash` and resource-gated `flags.boosting`. Denied boost does not open hardware as if firing.

**Proof:** bank owns new inner child groups only. Existing bell/gimbal and core-pulse owners remain; explicitly exclude those children from the broad bell/nozzle/drive scan. Preserve engine/trail sockets; test empty energy, taps/holds, reversal, stop and LOD changes.

### ANI-06 — repair-pod hatch and two-link service arm

**Model:** Kestrel's fixed green `RepairPod`, `RepairPodBand`, `RepairPodHatch`, `HOOK_SECONDARY_POD`; new compact arm stowed within it.

**Motion/UX:** hatch open, attached linked-arm unfold/align, controlled service pass, fold and hatch close. Source arm points at the real repair target without awarding repair.

**Live hook:** `mining:start` with repair verb/miner ID, `mining:stop`, successful `beam:repaired`. Success names the target, not the source pod; bind the source through active-beam/miner state. No decorative proximity loop.

**Proof:** coordinate the same pod's damage shedding; test denied payment/target, retarget, EMP/stop, full repair and rebuild. Links stay attached and clear cockpit/radiators.

### ANI-07 — directional armour hinge, peel and settle

**Model:** Kestrel thin `ShoulderCap` / `HOOK_ARMOR_PORT`; later Hornet/Wasp armour hooks. Never substitute a duplicated repair box.

**Motion/UX:** struck-side local lift around an authored edge, narrow structural gap, weighted rock and damaged hold. Recovery uses an authored reverse/replacement seating transition; real detachment hands off once to physical debris.

**Live hook:** damage-state crossings in `src/render/ships/shipDamage.js`, `combat:damage`, actual `collision:tearOff`. Replace the covered group's instant displacement/hide pop, not double-own it.

**Proof:** preserve recognizable core, root heading and damage thresholds; test side selection, critical/recovery reversibility and once-only tear-off.

### ANI-08 — Wasp rupture and fresh-fragment peel

**Model:** `wasp.py` / `wasp_production_v1.glb`, hull-matched substantial core/wing/nacelle-cover fragments and torn edges, not generic cubes.

**Motion/UX:** compact readable seam flash/peel and residual edge/plate motion on spawned wreck fragments. The central remnant is dead chassis mass, not a second live Wasp; do not duplicate nacelles or mass.

**Live hook:** `entity:killed`, `hull:fractured`, `collision:tearOff`, current seam/wreck handoff. Kill and bodies remain immediate; no delayed anticipation. The movie's drift is concept only—physics owns all fragment separation, translation, rotation and momentum.

**Proof:** associate fragment set with the actual Wasp definition, not merely mass class. Bank owns torn-edge children; root/death-spiral owner must not also claim them. Test chained kills, once-only mass/loot, off-screen/rebuild cleanup and actual gravity/Massline use of the wreck.

### ANI-09 — salvage-cutter hydraulic jaws

**Model:** `salvage_cutter.py`: `JawPivot`, `Jaw`, `Blade`, `CutterEdge`, `JawRam`, `JawRamRod`, `JawRamLug`, `Shredder`.

**Motion/UX:** paired hinge spread, pressure bite/hold, short shredder work and release. Rod endpoints remain attached; blade/lights follow each jaw. Hull/cab/cage never change scale.

**Live hook:** actual salvor job kind, target/work phase and occupational attachment; relevant cut/completion receipts. Job existence is not active cutting—project the existing owner's real work state if absent.

**Proof:** signed mirror groups, unchanged jaw lengths/outline, attached hydraulics; approach/work/depletion/retarget/interruption, pause and idle park.

### ANI-10 — mining-drone cutter engage, grind and coast

**Model:** `place_mining_drone.py`: gearbox, drum/lip/face, all teeth/cutters/spike and lamp yoke.

**Motion/UX:** proper-axis spin-up, pressure/grinding work, coast/park. One rotor contains all teeth and spike; no independently floating teeth.

**Live hook:** actual automation target, work range/intents and miner state; cover live drone and dressing/place views without mining nonexistent rock.

**Proof:** do not mistake existing kit `userData.drillBit` animation for the Forge mechanism. Test wrong target, retarget/depletion, rebuild/LOD, pause and reduced motion. The subtle whole-model reference is not permission to deliver an invisible shipping-view animation.

### ANI-11 — cargo-pod latch, breach doors and retainers

**Model:** `place_cargo_pod_standard.py`: `Door*`, `LockBar*`, end frame/ribs/lug. Proposed geometry is two outer hinged leaves, two short inner fold-down retainers and a real shallow interior; outer container stays recognizable.

**Motion/UX:** unbolt, resistant outer-door release, short retainer fold-down, weighted opening and hold. Keep actual spill immediate and once-only. Persistent empty shell is a real physical successor/wreck with conserved structural mass/velocity, not a long-lived unmanipulable visual ghost.

**Live hook:** actual split verb/progress, `mining:podSplit` with pod ID and actual spill. Deduplicate per-commodity receipts for one pod operation; partial work/abort keeps a coherent pose.

**Proof:** not a promise of a nonexistent normal cargo-door UI. No hidden slab behind open doors; test one spill, real shell/door volume, save/Continue, Massline ownership and stale-overlay cleanup.

### ANI-13 — fabrication welder seam work

**Model:** `place_station_fab.py`: `ArmBase*`, `ArmA*`, `ArmB*`, `ArmJoint*`, `ArmHead*`.

**Motion/UX:** linked shoulder/elbow reach, wrist align, fixed hull-seam pass, reposition/park. Use actual source geometry/mounts, not an unattached replacement beam; reference high pose cannot penetrate walls or miss the declared seam.

**Live hook:** `state.crafting.queues[stationId]` (`bpId`, `elapsed`, `total`, `done`, `stationId`), queue-changed/completion receipts. Correct station only; empty/full/done queues do not work. Preview time does not advance paused manufacturing.

**Proof:** preserve parent chain through packaging; stop/failure/rebuild parks coherently and keeps berth/hull clearance.

### ANI-14 — fabrication crane plate handling

**Model:** same fab yard, `Crane0`, `CraneTrolley0`, `CraneCab0`, paired `CraneEnd0*` / `Hoist0*`, `HangingPlate`; not workshop `Jib*` or other crane loads.

**Motion/UX:** short trolley travel, connected hoist stroke, aligned heavy plate hold and return. Fixed bridge height; no growing gantry masts, rubber plate or conjured loads.

**Live hook:** the same correct-station production queue, coordinated with welder phases without changing product delivery timing.

**Proof:** serialize shared ANI-13/14 builder/publish writes. Test cable connection, rib clearance, stop mid-hoist, empty queue, LOD and rebuild.

### ANI-15 — gate emitter index, lock and reset

**Model:** actual `place_gate_jump_ring.py`, small emitters/bases/coils/rim fixtures. Twelve large segments, tower and side platforms stay fixed; source-root yaw 90 reference exposes the real face, unlike ignored place-camera heading.

**Motion/UX:** short radial carriage sequence, aligned energized hold and reset; preserve real emitter count/length and open aperture. No unrelated spoked replacement or whole-ring breathing.

**Live hook:** actual gate approach, charge/start/arrive/cancel/reset attributed to the correct via-gate. Project missing gate identity from the world owner rather than animate every gate.

**Proof:** preserve dynamic pivots where primitives were previously welded. Test cancelled/denied charge, gate vs wormhole, sector exit/restore, aperture passage and reduced flash.

### Retained, unselected ideas

ANI-04 radiator louvers: both triangular-wing and focused growing-bar drafts failed the original nine short rectangular-slat geometry. ANI-12 collar jaws: whole view had no readable mechanism; focused view produced an oversized floating black overlay. Neither has an approved movie or active build assignment. Future work must start with correct source mechanism poses, not copy rejected drafts.

## 5. Independent high-FPS iteration and 80% gate

**80% means the explicit weighted reference-match review below**, not a claim that an arbitrary embedding/pixel metric proves art. No invented similarity numbers.

1. Freeze source/model/render hashes, approved movie hash, intended moving groups, sanctioned geometry differences, camera/lighting/viewport and declared manifest phase landmarks. Do not regenerate the reference to make a draft pass.
2. Build the real Forge rig/action in Blender and render the comparison at **60 FPS**, 1280×720, matched framing and phases. Also inspect real 60°/144-WU shipping and 58-WU close views. Close-only success does not excuse an invisible default-route mechanism.
3. Decode **every native reference frame**, sample every candidate frame at 60 FPS, and record actual PTS/FPS/frame counts. No duplicated-frame or optical-flow fake high FPS. A 24-FPS source supplies 24 distinct samples/second; candidate between-sample smoothness still needs 60-FPS inspection.
4. Align by declared rest, engage, extreme/work, release/return, settle and final poses. Compare the complete moving-mechanism ROI plus whole-model context, not cherry-picked attractive stills. Use actual PTS, or `(frame-1)/fps` only on confirmed constant-FPS clips. Preserve full-size key poses.
5. Check every draft for wrong moving groups, detached links/cables, penetrations, rigid shape warp, material drift, root/camera yaw, duplicated events and bad loop/reset. Fix known defects before asking for a grade.
6. Spawn an independent **read-only vision-capable reviewer**, not the author, with frozen evidence/hashes, native reference frames, candidate 60-FPS samples, high-resolution poses, scope, alignment and live/shipping-view proof. Verify it can see one image first. A text-only agent must return `NOT_REVIEWED`, not a score from captions/hashes. Ignored files absent from a glob are not missing until explicit paths are read.

### Verified reviewer route

Grok CLI 4.7 plus `read_file` returned real image content and a correct pixel-grounded Kestrel description during capability testing. Use a fresh reviewer with `--model grok-4.7 --prompt-file <lead-review-brief> --max-turns 12 --no-plan --no-subagents --disable-web-search --output-format streaming-json --allow read_file`. Supply the verbatim brief below, frozen evidence and this rubric. Forbid edits/media generation; confirm current flags/model and the first-image visual description. Never permission-bypass or silently replace it with a text-only worker.

### Rubric

Rate 0–4: **0** absent/wrong; **1** broad resemblance, major defects; **2** recognizable, substantial correction needed; **3** faithful, minor defects; **4** closely matched and clean. Every rating cites actual frames/times.

| Category | Weight | Compare |
|---|---:|---|
| Model identity and rigid construction | 30 | source silhouette/proportions, parts/attachments and material family; only declared new geometry differs |
| Mechanism and motion path | 25 | correct groups, hinge/slide axes, link endpoints, direction and travel |
| Key poses and sequence | 20 | rest/engage/work/release/final poses and operation order |
| Timing, weight and settle | 15 | acceleration, hold, release/recoil, easing, loop/interrupt/reset |
| Camera-scale legibility and integration | 10 | matched reference plus shipping view, no obscuring FX, truthful scene/gameplay |

**Score = sum(weight × rating / 4). Pass only at ≥80/100**, with identity, mechanism/path and key poses each **≥3/4**, remaining categories each **≥2/4**, and no hard failure. Workers cannot lower/replace these rules or self-certify.

**Hard failures:** wrong host/source; warped rigid parts or unconnected joints; unintended whole-hull/camera yaw; changed physics outcome/input latency/resources; baked fake debris actor movement; visible blockage across an open physical route; hidden default-route feature; stale/missing evidence; manufactured FPS; unsupported or evidence-free score.

Host-specific adapters compare their own current-model rest/geometry anchor and canonical mechanism motion. A Kestrel need not become the yard tug, but this rule never excuses host drift. Declare scoped differences explicitly.

### Reviewer brief — verbatim, fill evidence fields

> You are the independent reviewer of `{taskId}`, not its author. Do not edit files or regenerate references. Read `ANIMATION_REFERENCE_PROGRAM.md` §5 and the supplied frozen source/model, reference-video and candidate-video hashes. Inspect the entire native-FPS reference sequence, the candidate's 60-FPS samples, full-size key poses, mechanism ROI, whole-model context and shipping-camera/live-route evidence. Verify phase alignment and the declared geometry differences. Apply the five 0–4 category ratings and weighted formula exactly; cite frame numbers/timestamps for every rating and every defect, explicitly enumerate hard failures, and return category ratings, calculated score, PASS/REVISE, and concrete corrections. A score is not evidence of a hidden or broken live feature. Do not approve wrong moving parts, warped rigid geometry, unattached rams/cables, root/camera yaw, fake physics handoffs, or fabricated high FPS. If evidence is missing, return REVISE with the missing paths rather than guessing a grade.

Fix concrete review defects, rerender and rerun independent comparison. Move to the next animation only after **≥80**, focused lifecycle/ownership tests, real default-route visual review and owned publication. Keep raw grade outputs local and update the single build-map task. A pile of score files is not an animation.

## 6. Dispatch and completion

Start ANI-00, then ANI-01/02. ANI-03 is the signature-mechanic proof; ANI-08 follows only after debris/disposal ownership is proven. Different model sources can run independently after the foundation, but Kestrel tasks and the two fab tasks serialize their shared source/publish writes. One owner integrates shared Forge/runtime/package changes.

Use actual current Forge sources and the reviewed movie/model locators. Preserve IDs, sockets, roles, collision scale, simulation, accessibility and visual quality; publish through existing release/package tooling. Narrow feature/motion tests first, then relevant asset identities/package checks and `check:playable` when runtime changes can break the game. References/grades never authorize camera tricks, artificial pauses, new input latency or fake physics.
