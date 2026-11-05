# Lantern Ward — independent hostile review 2

## Current decision — REJECT; visual qualification remains incomplete

The independent seed-7405 public run **completed physical service, received exactly 180 credits, acknowledged a native Quick save, and survived both Quick and Auto Continue with the original settled receipt and 5,180-credit balance**. The first Continue also directly verified all nine finite Ward identities, original lamp serial/custody/light, empty cradle, living Nessa and installed maintenance bearing. These results supersede the initial review's missing-mechanics and missing-persistence evidence.

Two concrete rendering defects were independently found and isolated: generic cargo packages over all six Ward payloads, and a scale-60 rescue beacon whose visible package crossed the work area. The Ward substitution repair was verified in actual Continue. The latest actual frame on `a13223fa` no longer contains the huge beacon wall, but the default low-profile Overhead frame does not establish the required readable lamp/cradle/receiver relationship. A subsequent diagnostic read has blocked this browser's command queue, so the ordinary wider-camera recheck is not yet complete. **This is a remaining acceptance-evidence gap, not a claim that the repaired geometry or public service is broken.**

The source loaded by the latest browser is `a13223fa48148671183c09b12cae63e92a23e354`. Parent's later production commit `c1ed45d81e79f6ddb14352609cd31e369d9b8e57` only clears the empty cradle's presentation after a player lamp handoff; I independently inspected that diff and found no geometry change. This browser has not loaded `c1ed45d8`. No implementation edits, test execution, commits or process termination were performed by this reviewer.

The sections below retain the historical findings and their subsequent closure evidence. Their earlier “current” verdicts and pending actions apply to their named candidate checkpoints. The final-source addendum at the end records the latest actual execution and limits.

## Initial review — historical checkpoint

### Initial verdict: REJECT

The commission is not independently qualified for acceptance. The inspected ordinary captures do not establish the required physical relationships and readable choice, the final evidence manifest does not identify the observed work module, and a reported ordinary-world crew death remains unresolved by a matching public rerun. A passing native fixture suite is useful evidence of mechanics, but does not close these integration and presentation gaps.

This is a bounded review, not a claim that every requested path fails. No implementation changes were made. No independent test-pass or successful public commission completion is claimed.

## Candidate and evidence boundary

- HEAD at report creation: `37ee2378c5de485cd976f3a5f8cb50d3afb42401`.
- Work module SHA-256 at report creation: `535e7a2d424699af7ef1260b6343e3e0fcd5dd8609b92478b9d36f15042ac9d9`.
- The parent reports further startup, hardware, and world-record repairs in progress. This review therefore cannot certify a frozen final candidate.
- Reviewed root `AGENTS.md`, applicable docs/test instructions, `NOW`, and the [implementation](implementation.md), [design](design-review.md), [art](art-contract.md), and [story](story-contract.md) contracts.
- Inspected the work/actor implementation and native, save, and story test sources. Some implementation inspection preceded the subsequent commuter and startup repairs. **No tests were independently executed by this reviewer.**
- Independently inspected pixels in two parent-produced ordinary gameplay images: [approach](evidence/01-apron-approach.png) and [continued overhead view](evidence/02-continued-overhead-occlusion.png). Capture execution was the parent's, not this reviewer's.
- Own browser session `19533` reached the ordinary main menu after choosing First Light. It has not launched a flight, completed a fresh-seed route, configured accessibility, or exercised Continue. Parent browser `88057` was not touched; no process was terminated.

## R2-01 — evidence does not identify the observed candidate

**Independently verified; acceptance blocker.** [candidate-source.json](evidence/candidate-source.json) says it records the frozen source for the final native suite and fresh normal-browser capture. It was captured at `2026-11-04T20:37:41.053280+00:00`, names base commit `b431c9b9d297572b00faff828bb152e0a736858f`, and records work-module SHA-256 `13a064dfa661135ebb49d9a678509dc54737d91a6781745e7ac11c3ad4edf94e`.

That work hash differs from the module read at report creation. Earlier reads during this review also observed `75e05bb44f367c0573b5659993473e577d6af543c4387cd052f68fcb6c669390` and `8c7ffbdf05e8b25fd73aed6da8951f78d8f6f52b9401a297eba539ecdc3d07ef`. These observations establish changing source, not a gameplay failure. They prevent attributing all claimed final tests and images to the present code. Other manifest hashes were not exhaustively compared.

**Closure:** freeze the repaired candidate, record its actual source hashes and command results, and attach the public rerun to that same candidate. Retain earlier results with their original provenance.

## R2-02 — ordinary captures do not establish readable work and route choice

**Independent visual observation; acceptance gap.** The approach image contains the ordinary player HUD, ships, cradle-like platform, and several small pieces of hardware, but the finite family lamp, its loaded cradle, and its destination receiver cannot be unambiguously related from the frame alone. The continued overhead image has a large existing blue-and-white Tower across the apron, obscuring much of the work area. It cannot demonstrate the required lamp-to-receiver relationship or a legible clear-versus-carry choice.

This is a finding about these captured views; it does not prove that every normal camera position fails. Isolated art views can establish model shape and materials but cannot establish readability amid actual world geometry, ship scale, camera behavior, and HUD.

**Closure:** obtain a public-input approach and work view on the repaired candidate in a normal camera, with lamp, cradle, obstruction and receiver simultaneously understandable. Check the same relationship under High performance and reduced motion/audio-off settings. Record whether the route is discoverable without debug framing or labels doing all the explanatory work.

## R2-03 — reported ordinary crew death remains an integration blocker

**Parent-reported, not independently reproduced.** On fresh ordinary seed `7404`, the parent observed canonical memorial-thief `523` collide with and kill Nessa `596` at tick `4589`, without player responsibility. That defeats the intended uninvited local work behavior in the observed run. The parent subsequently identified a startup path where Nessa flew the installation route empty while the native payload clamp was unavailable far from the player, and reports a narrow repair making her wait beside the original cradle until admission.

That repair may remove the crossing; this reviewer has not observed the corrected route. The death must not be presented as confirmed on the latest repair, nor considered closed on the strength of its explanation alone.

**Closure:** repeat the ordinary fresh-seed approach through actual crew work and retreat, observing survival, native payload custody, commuter yield/berth/departure, and independent bearing work together.

## Evidence credited and remaining qualification

The parent reports the final nine native/full-world tests passing in `77.32s` after the commuter bypass repair. Test-source inspection supports that these fixtures exercise meaningful native physical mechanisms, including finite ownership, carry clearance and bearing service. This reviewer did not execute that command or verify the resulting log against the current source.

The parent also reports a public menu Continue from an acknowledged `633995`-character v23 autosave into flight, retaining the original lamp/cradle, retaining bearing `service_face`, and not reminting destroyed Nessa. [public-auto-continue.json](evidence/public-auto-continue.json) exists; this reviewer verified existence, not its contents or execution. This is useful lead-provided persistence evidence. The earlier empty autosave report is therefore not treated here as a confirmed current defect.

Still unqualified by this independent review are public successful clear/carry completion, exactly one electronics repair, actual theft/recovery with law witnesses, seven-minute ignored completion, completion followed by native autosave Continue/revisit, and once-only 180-credit settlement while the canonical 24 lit plus dark 25 remain distinct. Malformed-save and late/reentrant receipt tests were inspected but not run. These are coverage limits, not invented failing results.

The browser uses software SwiftShader and displays its hardware-acceleration warning. No uncontended performance measurement, device/GPU performance conclusion, or 60fps claim is made. Acceptance remains rejected pending a matching repaired-candidate public success capture and reconciled evidence.


## G6 public-route addendum — candidate `95da882c`

**Current verdict: REJECT for a reproduced ordinary-render defect.** The physical service and 180-credit settlement are now directly demonstrated through ordinary public inputs. Native Continue and the corrected visual route await the bounded presentation repair; neither is claimed complete here.

### Candidate and actual execution

The replacement isolated browser is exec session `5887`, seed `7405`. The earlier session `19533` returned `Unknown process id`; it was not terminated. No other process or browser was touched. I read the repaired Work, hardware, layout and worker-presentation source. The [independent source snapshot](evidence/hostile-2-source-7405.json) binds this run to commit `95da882cc002e8ee846651b00268851ea02167a6`. I independently compared all **40** files in [repaired-candidate-source.json](evidence/repaired-candidate-source.json) with the working tree and found **zero hash mismatches** at this checkpoint. The earlier manifest now explicitly labels itself historical. **R2-01 is closed for this candidate and these captures.** Later presentation fixes will need separate provenance.

The public route was First Light, Settings → Audio → Mute all, Video → High performance, New Game, seed 7405, “I've flown before,” and Launch. Read-only settings confirmed `qualityPreset=low`, render scale 0.75, pixel ratio cap 1, reduced motion/flashing, high contrast, large backed captions, text scale 1.15 and muted audio. This is Chromium software SwiftShader with another software browser active, so it does not qualify native-GPU performance. `SF.getRenderInfo()` returned zero samples; no frame-rate conclusion follows.

An immediate map search at simulation tick zero preceded live Ward materialization and returned no results. After closing the map and allowing simulation to start, “Procession Cradle” found the exact finite payload. Track Target set the ordinary course. Nessa 602 waited beside original cradle 596 at the repaired startup location; she remained alive through the later service. The seed-7404 death described in the initial review was **not reproduced in this seed-7405 run**; this is not a same-seed causal proof of that repair.

The public autopilot made broad avoidance arcs. At simulation times 59.9, 82.68, 104.4 and 148.57 seconds, the ship was respectively near `(1597,-1350)`, `(2199,-1048)`, `(2578,-511)` and `(1856,-1125)`. The last native navigation mirror reported `active=true`, `status=avoiding`, distance `497.129`, arrival radius `48`, stable target `record:lantern-ward:cradle`. I do not call this an infinite loop: the observation was bounded. Ordinary S braking cancelled the route; A/W/S manual inputs brought the player close. The [distant course frame](evidence/hostile-2-7405-public-approach.png) and [route midpoint](evidence/hostile-2-7405-route-midpoint.png) preserve that approach.

### Actual physical service and payment

The independent maintenance branch had already completed in ordinary Adventure by tick 4961 / 82.68 seconds. The original bearing 601 was at approximately `(1652.011,-649.005)` in `service_face` custody, shutter 600 reported repaired/retreat, and the tender was returning with no Ward part. This is direct read-only observation of the live production presentation bridge, beyond the earlier supplied fixture result.

The manual approach reached `(1762.96,-685.39)` at tick 14566 / 242.77 seconds, with player hull 140. It physically displaced the original mast; no Massline/Space command or privileged movement was used. At the subsequent pause, tick 15549 / 259.15 seconds, the mast was at `(1731.878,-741.107)`, the Ward reported `playerCleared=true`, `blocked=false`, `phase=transit`, and the original loaded cradle/lamp were moving together. The owner source credits generation-matched player impacts; the exact impact row had aged out of the retained read-only trace, so the report distinguishes the observed physical change and credited history from a retained collision receipt.

A transit interval near 309–330 seconds looked stalled: cradle X remained about 1765 while Nessa was near `(1795,-644)`. I initially raised possible mutual obstruction. **That suspicion is withdrawn as a confirmed defect:** the route completed without another gameplay input. The player's slow drift and the other moving bodies make the exact cause of the delay unproved.

At tick 25067 / **417.78333333328203** seconds, canonical missions settled receipt `lantern-ward:venn-family-lamp:service:01`, story `lw_helios_empty_plinth`, credited **180**. Direct reads changed from **5000** credits before completion to **5180** afterward. The live Ward reported `installed`, `playerCleared=true`, `ignored=false`; this was a player-help completion, not the seven-minute ignored branch.

Original lamp 597 (`venn-family-lamp:01`) was at approximately `(1829.968,-695.004)`, hull 90, receiver custody, phase finish, progress 1 and lit true. Original cradle 596 was empty at approximately `(1829.997,-649.991)`, hull 280 and clamp zero. Nessa 602 was alive at hull 200 and moving back west without carrying the family lamp. The installed bearing and repaired shutter persisted. [Raw read-only replies, settings, input provenance, exact reward journal and save metadata](evidence/hostile-2-public-service-7405.json) record these observations. [Installed ordinary frame](evidence/hostile-2-7405-installed.png) preserves the visual failure described below even though the simulation result succeeded.

### R2-04 — generic cargo geometry obscures the authored Ward bodies

**Directly reproduced; acceptance blocker on `95da882c`.** The [close manual approach](evidence/hostile-2-7405-manual-approach.png), [live transit frame](evidence/hostile-2-7405-service-live.png) and installed frame show oversized brown/blue cargo-pod shells where the finite civic machinery should be legible. The two teal service cheeks survive visually, but the lamp, cradle and receiver cannot communicate their intended physical relationship. The view label explicitly reads **Overhead**; no debug camera or photo mode was used. One ordinary wheel gesture changed zoom from 144 to 160.

Read-only raycasting at tick 15549 found that screen point `(1120,260)` hit original cradle 596, root `LanternWard_cradle`, scale `(1,1,1)`, but the intersected leaf was `LOD0_MOTION_POD_SHELL_Hull`. Subsequent root inspection found retained procedural children **and** `payload_PackagedBody` on the lamp, mast and bearing; all reported `authoredAssetState=authored` and generic payload-admission metadata. Cached mesh bounding boxes transformed by their existing world matrices gave the radius-5 bearing an approximately 49×59-WU horizontal footprint and 38-WU height, and the intended 7.3-WU-high mast an approximately 60-WU vertical extent. These measurements describe the accidentally combined visible geometry, not physics collision bounds.

This provides a concrete cause candidate for the failed ordinary visuals: generic payload model admission is layering cargo geometry over the procedural Ward art. It is stronger than blaming an unspecified nearby Tower from a screenshot alone. The renderer owner is investigating the exact admission boundary; this reviewer made no source changes.

**Camera correction to the initial record:** the older file named `02-continued-overhead-occlusion.png` actually displays the current-mode label **Chase**. Its filename is retained. Any earlier attribution of that old frame's occlusion specifically to Overhead is withdrawn. The new seed-7405 frames above independently show Overhead.

### Save checkpoint and next qualification

At simulation time 459.2 seconds, I used public F5 while paused and waited for **Saved Quick**. The acknowledged native v23 Quick slot is 680683 characters, saved at `2026-11-04T21:30:28.584Z`; its native index records 459 seconds played and 5180 credits. The reward journal is settled with the original receipt and credited 180. I then used public Main Menu and its confirmation. The menu advertises **Continue · Quick · Helios Prime · 7m played · 5,180 CR**.

Session `5887` is preserved at that menu pending the renderer owner's repaired-source handoff. The planned next action is public reload and Continue of this acknowledged save, followed by exact finite-identity/reward verification and ordinary-camera inspection. No save contents have been edited or re-injected. This addendum does not yet claim post-Continue success, a second reward attempt, a complete return to Nessa's home berth, or direct independent carry/repair/theft/ignored-path execution. Those remain distinct from the now-demonstrated ram-clear, actual installation, empty-return movement and once-settled 180-credit journal.


## G6 Continue addendum — candidate `27f618f3`

**Current verdict: REJECT for a separately reproduced rescue-beacon rendering failure. The Ward payload-substitution repair and successful native Continue are verified.** The prior “Continue pending” limit is superseded by this section.

The [new source snapshot](evidence/hostile-2-source-continue-7405.json) records commit `27f618f32bda1c2d772e9c57978f585bee4a3a37`, including the generic payload-admission guard and public Apron-navigation helper. Work, physical layout, authored Ward art, hardware authority and the worker bridge were unchanged from the successful service run. This reviewer read those narrow changes; no implementation edits were made.

I reloaded the existing page once. The harness's 30-second DOMContentLoaded wait expired, and a following read reported a destroyed execution context. The same navigation subsequently reached the fresh menu without retry. The menu retained the acknowledged Quick slot and 5180 credits. Public Continue returned to flight. A transient recap's “Back to the run” button lookup timed out; the recap disappeared and live flight proceeded without a workaround. These harness/UI observations are preserved separately from the actual load result.

### Native identity, custody and payment — directly passed

At tick **30417 / 506.95 seconds**, the public restored run retained exactly the nine finite Ward record identities. Native occupant generations were renewed by restoration; identity is the record/serial, not the transient generation. Cradle 596 was empty, clamp zero, hull 280, in Ward custody. Lamp 597 retained serial `venn-family-lamp:01`, hull 90, quantity-one electronics manifest, receiver custody, finish/progress 1 and lit true. Receiver 598 remained lit at hull 1400. Nessa 602 remained alive at hull 200 with no family-lamp carrying field. Bearing 601 retained its original serial, hull 90 and `service_face` custody; shutter 600 was repaired and performing a real `connect` phase at progress `0.2890625`.

Credits remained **5180**, with the exact original settled reward journal: credited **180**, receipt `lantern-ward:venn-family-lamp:service:01`, committed tick **25067**, committed simulation time **417.78333333328203**. Credits were still 5180 at simulation time 673.88 seconds. This is a direct public Continue and sustained no-repeat-payment observation. It is not a claim that every malformed or adversarial reward path was independently exercised by this reviewer.

One pose detail is retained explicitly: receiver X was 1830 before saving and 1832.5 in the restored live state; the lamp followed its socket near X1832.4803. No cause is asserted. The successful claim is finite identity, condition, custody, light and payment continuity, rather than bit-exact transform preservation.

[Raw Continue evidence](evidence/hostile-2-public-continue-7405.json) contains the exact state, settings, reward, all nine records, rendered roots, and the subsequent occlusion diagnosis. The original save was neither edited nor re-injected.

### R2-04 — CLOSED for the repaired Ward payloads

All six finite payload roots existed with `visible=true` in the renderer and **none** contained `payload_PackagedBody`. The cradle/lamp/receiver/mast/shutter retained `lantern-ward-authored-civic-v1`, the intended named procedural children and their contract bounds; the bearing retained the existing small procedural canister. This verifies the admission repair in actual ordinary Continue, not merely the isolated factory. It does not mean every body was perceptually visible through the unrelated foreground occluder.

The pre-repair [bounded renderer metadata](evidence/hostile-2-render-metadata-7405.json) identifies the removed `pod_cargo_container` package on all six originals. Its menu timing samples are not a matched flight benchmark: `getRenderInfo()` had zero samples; `lastPresentDtMs` and the latest eight retained hitch records were 250 ms. Software SwiftShader and concurrent software browsers remain unqualified for device/GPU or 60fps acceptance.

### R2-05 — rescue beacon's inherited scale covers the ordinary view

**Directly reproduced; acceptance blocker on `27f618f3`.** The [post-Continue Overhead frame](evidence/hostile-2-7405-continued-fixed-overhead.png) is still covered by a huge yellow/grey surface. A read-only raycast identified its exact owner, **entity 705**, type `beacon`, radius **60**, with data `{rescueExit:true, onboarding:true, rescue:true, rescueRole:'beacon'}`. It is not a Ward payload or Ward dressing.

At the public pause, tick 40445 / 674.083 seconds, both its authoritative presentation position and mesh-root position were approximately `(2399.994,0,-573.106)`. The camera/player were near `(1658,-641)`, floating origin `(0,0)`. The root scale was **(60,60,60)**; its packaged asset was `assets/ships/release/parts/places/place_lane_beacon.glb`, with render contract “packaged 47-A / TOW body.” The visible `LOD0_Warning` and `Material_Armor_Packaged_Batch` leaves were hit only about 76–81 WU from the camera despite the entity being hundreds of world units away.

The cached packaged armor world bounds spanned X **1421.62–3329.81**, Z **−1534.43–317.20**. Including the beacon lamp, the whole rendered root spanned X **−1407.51–3411.84**, Y **−738.43–3212.65**, Z **−1551.19–3707.33**. The lamp itself had local Y69 and local scale about13 under the same scale-60 root. Exact entity data, root/leaf transforms, ancestry and bounds are in the raw Continue evidence. This establishes a transform/admission failure; it is not evidence that the Ward's designed footprint is too large.

The root owner is repairing that inherited-scale path with a separate installed-wrapper regression. Moving the Ward or changing camera thresholds would not address the measured cause. This reviewer remains paused in session5887, with the original acknowledged Quick save preserved, awaiting an immutable repair before a final public reload/Continue and normal-camera look. No processes were terminated.


## G6 final-source addendum — actual Auto Continue on `a13223fa`

**Independent verdict remains REJECT for incomplete ordinary visual qualification. Service and persistence have passed the demonstrated route.** The latest frame removes the previously reproduced giant beacon occlusion. No new Ward mechanics failure was independently reproduced in this final checkpoint.

### Candidate boundary and actual Continue

The [final loaded-source snapshot](evidence/hostile-2-source-final-7405.json) records `a13223fa48148671183c09b12cae63e92a23e354`, captured before the second reload. It includes the packaged beacon's unit-root admission repair and the detached-lamp custody ordering repair. The original Quick save remained unchanged. The menu advertised the newer native **Auto** slot: saved `2026-11-04T21:45:36.697Z`, v23, 579 seconds played, 5180 credits, native blob hash `f901bf26`. The prior live save bridge reported no pending write or write failure, no pending shared-store synchronization, and a healthy mirror.

I used one page reload and public **Continue** from that advertised Auto slot. The reload reached the ordinary menu and the restored flight proceeded. At **tick 39486**, the actual read returned `mode=flight`, **5180 credits**, Ward `installed`, `playerCleared=true`, `ignored=false`, and exactly the original settled receipt: **180** credited, committed tick **25067**, committed simulation time **417.78333333328203**. No save injection, gameplay-state edits, or debug flags were used. This is a second public Continue after the original service, not a second payment.

The first short read's tool-output budget truncated its large player object. The [final Continue evidence](evidence/hostile-2-final-continue-7405.json) therefore labels its retained exact fields as extracted observations, not as a complete raw reply. Its raw reply section also preserves the pre-reload save-index checkpoint. The comprehensive nine-record identity/custody/render snapshot remains the earlier [first Continue evidence](evidence/hostile-2-public-continue-7405.json); the unreturned final read does not justify claiming a second full census.

After flight returned, I notified the parent that the loaded graph was established. The parent then committed `c1ed45d81e79f6ddb14352609cd31e369d9b8e57`. I independently inspected the diff of Work, visual overrides, Ward art and layout from `a13223fa` to that commit. Only six lines in Work clear the cradle clamp and stale load-custody projection when the player takes the lamp. The installed branch observed here is unaffected; no geometry changed. Nevertheless, this browser result is attributed to **a132**, not relabeled as an execution of c1ed.

### Actual final pixels and remaining visual gate

The [ordinary final Overhead frame](evidence/hostile-2-7405-final-overhead.png) was captured in live flight with the same High performance, reduced-motion/audio-off profile. The large yellow/grey beacon wall in the prior image is gone. The work-area geometry and surrounding traffic are visible, so **the exact R2-05 screen-covering symptom is absent on this actual repaired frame**. The parent reports an independent released-GLB admission regression as additional evidence; that is not this reviewer's test execution. Exact final beacon scale/bounds were requested but did not return.

The image remains crowded at the saved ship position west of the family receiver. Small illuminated hardware, a bright central cluster, the HUD and existing ships compete for attention. From this default-zoom frame alone I cannot unambiguously relate the installed family lamp, the empty cradle, the mast, and the memorial context. It also cannot retrospectively demonstrate that the original clear-versus-carry decision is readable before service. **R2-02 remains unqualified**, rather than being turned into a claim that every ordinary angle fails.

After that screenshot I used public Escape. A subsequent read-only snapshot, which included cached mesh bounds and rescue-root metadata, remained pending for several minutes. It may itself be expensive; no causal diagnosis is established. Shell reads were temporarily slow, and a process inventory attempt returned `fatal library error, lookup self`; shell responsiveness later recovered when the other browsers and test workloads ended. My browser reported no page crash. The stalled diagnostic is not counted as a reproduced Ward gameplay defect.

Ordinary resume, five wheel-out gestures, a wider screenshot, and public pause are queued behind that read. At this report checkpoint no wider screenshot has been produced and those queued controls are not claimed executed. Session **5887** is preserved. No process was stopped, no alternate browser was launched, and no privileged camera framing was used.

### Coverage at handoff

| Requirement | Independent evidence in this review |
| --- | --- |
| Finite lamp carried through actual work and installed | Passed through public manual ram-clear, native loaded transit and installation on 95da882c |
| Independent maintenance bearing handoff | Original bearing in service-face custody and repaired shutter directly observed in ordinary Adventure |
| Once-only 180-credit mission settlement | 5000→5180 observed; same settled receipt survives Quick and Auto Continue without another payment |
| Original objects and condition survive Continue | All nine finite identities, lamp serial/light/manifest, empty cradle, living Nessa and original bearing directly verified on the first Continue |
| Nessa returns empty | Empty return movement observed; complete arrival at her home berth is not independently claimed |
| Ward generic cargo substitution | Reproduced before repair and closed by actual six-root inspection on 27f618f3 |
| Giant rescue-beacon occlusion | Reproduced and measured before repair; same screen-covering symptom absent in actual a132 image |
| Final ordinary readability, clear/carry choice and memorial relationship | Still unqualified; normal wider-camera check is blocked behind the pending diagnostic |
| Public carry, damaged one-electronics repair, theft/recovery with law witnesses, seven-minute ignored route | Not independently executed by this reviewer; native results supplied by other owners remain separately attributed |
| Canonical 24-lit plus dark-25 isolation, malformed saves and reentrant/late receipts | Test/source evidence was reviewed earlier; this reviewer did not independently run those adversarial suites |
| Native-GPU / 60fps performance | Unqualified: software SwiftShader; no matched final flight benchmark or new performance sampling was obtained |

No broader acceptance is inferred from the successful service route, and no unexecuted negative scenario is reported as failing. The useful next evidence is one ordinary, clearly framed repaired-source work/receiver view and the corresponding independent visual decision.


## G6 report-only update — source `95a775e2`, run label `7407`

**Current verdict: REJECT.** A newly reported public Quick Load is blocked by content-hash admission for five Ward roots, and the required clean ordinary view remains unqualified. Earlier successful service, payment and Continue observations remain valid for their recorded checkpoints; they do not close this later load failure.

This pass is limited to independent source/evidence inspection and image review. I did not operate a browser, touch session5887 or any process, run a mechanics test, edit production source, or change save/settings/law state. Only this report was appended. The current evidence supersedes the prior a132 checkpoint where explicitly stated below.

### Source and resumed physical service

I read [post-motion-public-continue-7407.json](evidence/post-motion-public-continue-7407.json), [its source manifest](evidence/post-motion-source-7407.json), and the preceding [center-lane/tumble observations](evidence/public-center-lane-and-tumble-7407.json). The manifest names source commit **`95a775e283a3936523b0db493ac2a4e4eb67fdc4`**, tree `bf509818d6a098e03d66b53ada2b9568a06c1f2f`, recorded before the public Continue. I independently hashed all **50** listed files against the working tree at this review checkpoint: **zero mismatches**. Later admission repairs were announced afterward and are not qualified by that comparison.

I also read the two narrow repairs. Commit `c6036f79d668c8baa2e430693c3e118216a79956` moves the cut-route crew stand clear of the loaded passage; it does not move the load by a completion trigger. Commit `95a775e2` exempts exact finite Ward hardware from the late generic ordnance-motion pass and removes that pass's residual pitch/roll and tracked scale changes. This explains the intended repair boundary; source inspection alone is not an ordinary-render acceptance result.

**The new gameplay execution is the parent's, not this reviewer's.** Its transcribed live observations report public reload → Load Game → Quick slot → Load confirmation, followed by `installed` at tick **37703**:

- Original lamp **603**, serial `venn-family-lamp:01`, remained at approximately `(1829.987,-695.004)`, hull **90**, lit, in receiver custody.
- Receiver **604** remained at `(1830,-695)`, hull **1400**, lit, in finish phase.
- Cradle **602** was separate at approximately `(1829.985,-649.990)`, hull **280**, waiting in Ward custody. The parent reports it empty; the supplied JSON does not include a clamp/load-serial census, so I do not claim an independently read clamp value here.
- Nessa **608** was alive at hull **200**; the parent identifies her movement as the empty return. Commuter **609** was alive at hull **320** and reported moving again.
- The inspected cradle, lamp and receiver had root pitch **0**, roll **0**, and scale **(1,1,1)**. This supports the repair at that observed checkpoint; it is not a time-series check of all six bodies.

At tick **37828**, credits were **5000**, no Ward reward journal existed, and every supplied help/history flag—including `ignored`—was false. This supports **no unjustified player-help payment** after the saved operation resumed. It does not establish my independent execution of the seven-minute ignored branch, nor replace the earlier seed7405 evidence for a once-only 180-credit assisted completion. The parent's later **4500** balance follows the reported ordinary **500-credit recovery charge**, not a Ward reward or reset.

### Image13 does not close R2-02

I independently inspected [13-public-installed-receiver-7407.png](evidence/13-public-installed-receiver-7407.png). It shows an active Navy interception, critical hull at roughly **17%**, and a receiver target cue still about **125 WU** away. The visible scene centers the memorial and pursuit; red damage treatment and interception/contact overlays compete with the work area. It does not make the finite lamp, receiving face and empty cradle unambiguously legible together. **This is a failed acceptance capture, not proof that the repaired art fails from every ordinary position.**

Images09–12 were likewise not offered as clean acceptance frames. The cause of the protected-civilian incident initiating the pursuit has not been established in this review. I do not attribute it to Ward logic, call it an intended commission outcome, or treat the recovery as a clean visual test. R2-02 remains open pending an actual ordinary view that satisfies the work-pocket requirement.

### R2-06 — public Quick Load blocked by authored-content admission

**Material parent-observed failure; not independently reproduced by this reviewer.** After the capture above, the parent reported that a subsequent public Quick Load failed to complete its opening submission plan with:

`missing-or-unverified-blocking-content-hash`

The reported blockers were **five Ward roots: two shore-spine bodies, two service cheeks, and one cradle**. The resource-identity census reportedly matched, and **zero roots were empty**. Those observations distinguish missing/unverified admission metadata from an observed empty-geometry case; they do not yet establish the full underlying cause.

The parent has begun repairing the procedural asset hash/admission contract while preserving the startup gate. That work is in progress and **is not accepted by this report**. No new failure log or independently inspected raw admission dump was supplied to this reviewer before handoff; this entry is explicitly based on the parent's direct browser report. Closure requires the repaired, identified candidate to complete this ordinary Quick Load with the five legitimate roots admitted and the gate intact. A source explanation or isolated passing fixture alone will not close this public-load failure.

### Seed provenance and remaining limits

The parent subsequently inspected the acknowledged Quick envelope and reports `data.meta.seed=7407`, version **23**, playtime **557**, saved at `2026-11-04T22:35:37.741Z`. A later runtime read **after public recovery** reported `state.meta.seed=683623714`. The difference is under a separate read-only investigation. This review preserves the original Quick's seed and the later runtime value separately; it does not claim that recovery caused the change, that a seed was intentionally edited, or that every subsequent image proves the same effective runtime seed.

The commissioned mechanics have substantial demonstrated evidence, but the current acceptance decision remains blocked by **R2-06's actual reported load failure** and **R2-02's missing clean ordinary visual qualification**. No native-GPU, 60fps, uncontended performance, or newly executed adversarial-test claim is made. The blocked review browser remains untouched.


## G6 narrow admission-mechanism closure — `9c7bb900`

**Independent result: PASS for the repaired procedural-admission mechanism.** The focused production-path tests pass, and the missing/old-marker negative controls still reject admission. **Overall acceptance remains REJECT pending the separate ordinary Import/Load/reload closure and R2-02's clean visual qualification.** This section closes the narrow source/test question; it does not relabel a headless result as successful public startup.

### Identified candidate and source inspection

I inspected and executed local commit **`9c7bb9006b5dffee7fc39487277ad8f411feba10`**, whose independently read tree is **`9480029db29511f4260b59ff05a4c78c919b4357`**. A comparison against that commit found no working-tree differences in `src`, `scripts/lib`, or the executed test file. The parent identifies published commit `5ef89c7f` as the same tree; that commit object is not present in this checkout, so the publication mapping remains parent-attributed rather than independently reverified here.

The only production change in this commit is in [the Ward visual builder](../../../src/render/lanternWardVisuals.js):

- `generatedVisualProducer` now uses the existing canonical value `visual-factory-procedural`.
- The Ward's distinct authorship value remains available as `lanternWardVisualProducer='lantern-ward-authored-civic-v1'`.
- `assetId` is explicitly taken from the existing body contract.

No geometry, collision, simulation, motion, camera, startup timeout or gate condition changes are part of this patch. I read the existing [package-ensure function](../../../src/render/precompile.js) and [producer census/submission-plan implementation](../../../src/render/openingSubmissionPlan.js). The ensure function already recognizes the canonical producer marker and stamps the frozen generated recipe. The plan still requires verified hashes for blocking roots, a matching resource census, and a complete first-playable pipeline set. Neither admission owner was changed to make these tests pass.

### Independently executed result

Command executed in the repository:

```bash
node --test test/lantern-ward-opening-admission.test.mjs
```

Observed process result: **exit 0; 3 tests, 3 passes, 0 failures, 0 cancelled, 0 skipped, 0 todo; `duration_ms=1589.672396`**.

| Case | Independently observed result |
| --- | --- |
| All wrapped Ward bodies and shore variants earn canonical recipe admission with exact live subjects | PASS — 241.467806 ms |
| Old `lantern-ward-authored-civic-v1` marker remains blocked despite nonempty geometry and matching resource census | PASS — 43.13539 ms |
| Unmarked roots remain blocked despite nonempty geometry and matching resource census | PASS — 50.585740 ms |

These are this reviewer's actual command results. No additional mechanics suite or browser was run during this pass.

### Why these tests exercise the reported failure boundary

I read [the complete three-case test](../../../test/lantern-ward-opening-admission.test.mjs). It builds hardware from the real hardware specs, materializes the actual Ward-owned scenery recipes, and uses **`installVisualOverrides(createVisualFactory(), …)`** with release/direct-authored-mount settings. It then directly calls the existing production functions:

`ensureOpeningGeneratedScenarioPropPackage` → `createOpeningProducerCensus` → `combineOpeningProducerCensuses` → `createOpeningSubmissionPlan`.

Those functions are imported from the production modules, not replaced by mocks. The test verifies that submitted leaf UUIDs and geometry UUIDs match the actual built objects, program keys come from their actual materials, compile subjects are the same object references, and resource-identity sets match the producer census. Nonempty geometry and a complete plan are asserted rather than inferred from a count of constructed roots.

The positive case checks a verified 64-character recipe hash against `contentHashForProducerManifest`, a frozen nonempty manifest, explicit asset identity, and the actual render/collision source contracts. Ordinary and White Side shore recipes have different hashes. At **LOD0, LOD1 and LOD2**, the existing package boundary remains stable, the actual admission plan is complete, and the fixture entities' serialized simulation/custody data remain unchanged.

The two negative cases use the relevant shore/cheek/cradle roots with either the former Ward-specific marker or no marker, while leaving a separate valid lamp producer in the cohort. The invalid roots receive no generated package or verified content hash. Their geometry remains nonempty, the resource census still matches, and the verified producer can make the first-playable program set complete—yet **the overall plan remains incomplete with `missing-or-unverified-blocking-content-hash`**. This reproduces the reported distinction between “the meshes exist” and “their blocking content is admitted,” and demonstrates that the repair preserves rejection of the old/missing producer boundary.

This focused test does not execute a WebGL shader compile, residency drain, asynchronous public opening orchestration, save import, browser reload, or ordinary-camera picture. Consequently, **R2-06's production mechanism is independently qualified; its observed public-load failure still needs the planned public recheck.** R2-02 remains unchanged until a suitable normal gameplay frame is independently inspected.

### Seed clarification supplied after the previous report

The parent subsequently reported an existing read-only worker `laneRpc('probeState', {})` result after the failed F9: **`envelope.result.seed=7407`**, while the presentation-side **`state.meta.seed=683623714`**. The original Quick envelope also reports **7407**. At that checkpoint the worker therefore retained the original seed; the main metadata difference is **not a demonstrated world reseed**. This is parent-observed evidence, not a probe executed by this reviewer. It establishes neither every-tick continuity nor a recovery cause, and no seed value was changed for this review.

Only this report was appended. Session5887 and all other browsers/processes remain untouched.


## G6 source-only import bridge and merge review — `8cf0034e`

**Source review: no new functional defect identified in the two changed import hunks or the inspected merge resolution. Overall G6 acceptance remains REJECT pending the distinct public load/reload and ordinary visual evidence.** I did not rerun any suite or use a browser during this pass. The parent's reported **21 focused/adjacent passes** and old-source negative reproductions are not independent command results from this reviewer.

### Candidate and exact import changes

The independently read local candidate is **`8cf0034e814ef18af14dcc52f26485e637820e57`**, tree **`33f509a5c4012d36e7261befce58c216a2930d37`**. There were no working-tree differences from that commit in `src`, `scripts/lib`, or the new import test. The parent identifies remote equivalent `74329c72` and draft PR840; publication remains the parent's responsibility.

I inspected the [worker RPC handler](../../../scripts/lib/simWorkerHost.mjs), [main-side save facade](../../../src/runtime/laneSystemFacades.js), the canonical save owner, the UI call site, and the new test:

| Changed boundary | Independent source finding |
| --- | --- |
| Worker `saveImport` handler | It is now asynchronous and awaits `save.importString` before constructing its result. The command drain recognizes a top-level Promise, and the existing worker tick awaits that operation before emitting the RPC acknowledgement. The previous ordinary object could contain the still-pending owner Promise, which cannot cross structured cloning. |
| Destination choice | The worker no longer substitutes Quick for an omitted destination. The facade accepts and forwards the third `slot` argument already supplied by the Save/Load screen; omission reaches the canonical owner as null/undefined so its existing first-empty-slot policy remains authoritative. |
| Facade success verdict | Completion requires both `ack.ok === true` and `ack.result.ok === true`. The outer field establishes RPC delivery; the inner field is the worker's settled import verdict. A delivered refusal, incomplete acknowledgement, rejected transport or thrown owner operation cannot be reported as successful import by this predicate. |

This is a narrow bridge correction. The patch does not change envelope parsing, migration, restore authority, slot selection inside the canonical owner, or admission gates. The earlier procedural-producer repair in `lanternWardVisuals.js` is unchanged from `9c7bb900`; my earlier three-test execution remains attributed to that earlier candidate rather than relabeled as an 8cf execution.

Reviewer1's [recorded prior public failure](evidence/independent-public-import-failure-9c7bb9.json) provides concrete context: the unchanged exported file caused a `#<Promise> could not be cloned` worker failure on9c before controllable flight. I read that artifact; its browser execution and raw log belong to Reviewer1.

### What the new test covers, and what it substitutes

I read [lantern-ward-save-import-bridge.test.mjs](../../../test/lantern-ward-save-import-bridge.test.mjs). It contains one parent test with seven subtests. It initializes the real production simulation host, dispatches through `createSimCommandRing` and the real `api.tick`, uses the real save facade, and applies `structuredClone` to the worker result. These are meaningful checks of the actual acknowledgement/serialization boundary.

The timing, success, refusal and exception cases deliberately replace `save.importString` with controlled importers or deferred Promises. The final incomplete-acknowledgement cases also substitute the command sink. The initial comment describing only the browser byte reader as substituted is therefore broader than the actual fixture boundary; the parent has agreed to clarify that comment without changing behavior.

The **canonical malformed-input** and **omitted-slot** cases use the actual save owner. They check a parse refusal, unchanged live world/entity identities and selected-slot state, continued worker usability, and invocation of the owner's real first-empty destination selector. The other cases check deferred acknowledgement, selected-slot forwarding, domain refusal, exceptions and incomplete acknowledgements. **The test does not restore a valid exported save through the canonical owner successfully.** That result must come from the separately requested public Import & Load run.

The parent also reports three separate baseline failures under semantic diagnosis. This narrowly scoped source review neither resolves nor attributes those failures and must not be read as a claim that the whole merged baseline is green.

### Merge resolution preserves both presentation domains

I inspected merge **`27f4571dc964ee50944622ab33385faba796ec22`**, which brings baseline `f71edbfc` into the Ward branch, and compared [simReadModel.mjs](../../../scripts/lib/simReadModel.mjs) with both parents. The conflict resolution keeps **`dockingPresentation` followed by `npcJobs.lanternWard`** in `DOMAIN_MIRROR_KEYS`.

The baseline's docking entry, cadence **1**, and hot-presentation handling remain. The Ward's bounded projection entry, cadence **6**, and existing life/record-checked presentation fields also remain. The resolution does not replace one domain with the other or export the entire NPC-job authority graph. I identified no omitted parent behavior in this inspected resolution; this is a source finding, not a new runtime-mirror test pass.

### Public and visual boundary at this checkpoint

After this source review began, the parent relayed Reviewer1's replacement-harness result: the byte-identical real export reportedly reached flight on8cf at tick **35239**, simulation time **587.3167**, with hull **100%**. The reported opening plan had **18 roots**, `complete=true`, `firstPlayableComplete=true`, `censusMatches=true`, and no unverified blocking roots. That is new peer-executed public evidence, distinct from the controlled test successes. This reviewer has not yet inspected its final identity/custody artifact or normal-camera images, so specific public and visual closures are deferred to the next evidence review. Public F5/F9 verification was still pending at the time of that handoff.

One adjacent source observation was sent to the parent without execution or expansion of this patch: the unchanged `saveLoad` RPC still wraps `save.load(...)` in an ordinary result object, while the canonical compressed-envelope branch can return `loadAsync(...)`. I have **not** reproduced a failure through that combination or established that the pending public reload uses that RPC. It remains an unexecuted, separately scoped observation; no broad claim that this import patch fixes every load entry is made.

The earlier pixel verdict is preserved: R2-02 remains open until an independently inspected ordinary frame shows the required work relationships. No camera, settings, save, source or process action was taken. Only this report was appended.


## G6 independent pixel review — ordinary frame16 on `8cf0034e`

**Result: clean ordinary capture established; R2-02 remains OPEN for work readability.** I opened and inspected [16-independent-public-ward-overhead-7407.png](evidence/16-independent-public-ward-overhead-7407.png) directly. This judgment follows the actual new pixels, rather than carrying forward the earlier pursuit-obstructed image verdict.

The parent attributes the capture to Reviewer1's replacement harness on8cf after native Import & Load of the unchanged export, using ordinary Overhead and four public minus-key inputs, with no steering or camera-state injection and public pause immediately afterward. Capture execution belongs to Reviewer1. This reviewer only opened the saved image.

The frame shows **100% hull**, **0 U/S**, and the current-mode **Overhead** control, with no pursuit, critical-damage, aftermath or pause overlay covering the scene. The warm memorial arc and teal/pale shore pieces provide recognizable place context. The prior screen-covering cargo-package and rescue-beacon surfaces are absent from the visible region. This is useful ordinary restored-scene evidence.

The dominant foreground forms are the memorial's large bright globes and supporting arc. Smaller pale/brass work objects sit beyond them, but I cannot unambiguously identify the finite family lamp, its receiving face and the empty or loaded cradle as a connected operation from the pixels alone. The shared household marks and the receiver's cup do not read distinctly at this framing. The picture therefore does not satisfy the specified work-pocket relationship or establish that the initial clear-versus-carry choice is visually understandable.

This finding is bounded to the actual frame. It does not establish that every ordinary viewpoint fails, prescribe relocation or a camera rewrite, or reopen a measured geometry defect without evidence. A short ordinary approach or a different ordinary work view may supply the missing relationship.

The image supports neither an exact 24-lit/dark-25 memorial census nor native lamp custody, work contact, mission payment or an F5/F9 roundtrip. Those are separately evidenced runtime claims. No GPU or frame-rate acceptance is inferred from the screenshot. The newly reported successful public import and 18-root admission plan remain peer-executed results until their detailed artifact is reviewed; they do not depend on this image being a successful art-acceptance frame.

No browser, source, fixture or process action was taken during this pixel review. Only this report was appended.


## G6 independent semantic review — baseline version-only diagnosis

**Decision: the diagnosis is supported, and the exact proposed hash/schema metadata refresh is justified.** This does not change the outstanding ordinary visual verdict or substitute for the strict baseline reruns. I reviewed the released evidence, not merely the parent summary.

The reviewed [diagnosis JSON](evidence/merged-baseline-diagnosis.json) has SHA-256 `469f90436592cd50b367bff13004593a638e22829c3068e7ffc2e833c0f4e868`; its [log](evidence/merged-baseline-diagnosis.log) has SHA-256 `d5fd23e46fdc993d63fbc8308ab7a44a90875fd2ba13a71526af0b4207e80291`. Both match the released bytes. The comparison pins current source **8cf0034e** / tree **33f509a5c4012d36e7261befce58c216a2930d37** against controller **f71edbfcbccb33c2fbc424116c6684b4ed7596ad** / tree **14a20b71e3333511b9a9cf479230ac9561e53d2d**.

### Independent audit of the captured evidence

The diagnostic simulation executions belong to `import_rpc_repair`. My independent work was read-only analysis of their existing captures; I launched no simulator, baseline command or test suite.

I inspected the embedded loader, capture and analysis helpers. The controller loader supplies the actually imported changed modules from the pinned f71 Git objects in memory; the current runs use the unchanged current source. Both receive identical observation code. That code retains the existing event/combat trace and copies primitive entity pose/vital values after each ordinary `sim.step(SIM_DT)`, before a requested reload. It does not alter the input tape, clock step, physics writer, entity collection or simulation state, and it adds no numerical rounding to the motion samples.

I then independently verified:

- **20** recorded stdout/stderr files against their recorded sizes and hashes, with successful command receipts and empty stderr.
- All **3** helper source hashes against both the embedded source and local helper bytes.
- All **11** distinct controller-module substitutions against the actual pinned f71 Git-object bytes.
- All **9** recorded source/input/fixture hashes, before the integration owner applied the reviewed metadata update.
- Every raw snapshot hash using the unchanged canonical snapshot hashing function, complete recursive snapshot differences, all captured metrics, full event and combat traces, all per-step motion/vital frames, and final native-body data.
- The two actual current-runtime version-only controls, including their audit showing **only `src/data/saveVersion.js`** substituted from f71.

The independent analysis completed successfully. Its comparison scope is the existing curated `legacy47a` profile, seed **47**, the existing input tape, and **720 ticks**. It is not a new whole-Adventure, browser, performance or repeat-count qualification.

### Exact semantic result

| Paired route | Motion/vital frames per run | Entity rows observed | Existing event records | Canonical snapshot delta |
| --- | ---: | ---: | ---: | --- |
| V3, reload at60 | 720 | 7870 | 855 | Only `$.meta.version: 22 → 23` |
| V3, reload at600 | 720 | 7870 | 855 | Only `$.meta.version: 22 → 23` |
| Legacy, reload at600 | 720 | 14001 | 414 | Only `$.meta.version: 22 → 23` |

Within **each matching route pair**, the full motion/vital frames, trace summary, full event trace, combat trace, metrics and final native-body fields are equal. This is not a claim that trajectories at different reload points are interchangeable.

Both controller variants reproduce their existing pinned golden hashes. The exact versioned mapping is:

```text
V3 v22: 26f47b219803ed86bdf8f02bee0294990ffa697b40e3171609a415964a25596b
V3 v23: 30b35458d74d3acdea176872b647d0624fc71992f5cea50aadfb7d81e4900b6c
Legacy v22: 560c28a8f5463ce9f237d2b8d595b264a98a50e65c7d35808a5231c779faa448
Legacy v23: 695e63f6120917e66bae0b018c45da8cfa3b7c8ff42ed35d543c874592eb235c
```

Changing only the copied snapshot's version back to22 reproduces the old snapshot and hash exactly. More significantly, the **actual current-runtime controls** for V3/reload60 and legacy/reload600, with only the version module supplied from f71, independently produce the complete controller snapshot and all observed telemetry. The conclusion is therefore supported by both an exhaustive captured-state difference and a single-module runtime intervention, not just a convenient post-hoc hash adjustment.

The generated schema retains **465 total serialized paths** including the root, or **464 descendants**, with unchanged key order and no path additions/removals. The sole sample-value difference is `$.meta.version`. The remaining text changes are the declared version, the v22→v23 migration step, and migration coverage to23. I independently verified that the working generated schema matches the captured current generator output.

### Exact metadata update subsequently checked

After receiving this independent result, the integration owner committed **`07a39eef4d26ce09061d2a430a98726b125527cd`**. I compared that commit with8cf and independently applied the released proposal operations to copies of the old JSON fixtures in memory. The committed fixture objects match those exact proposed results:

- V3: replace `acceptanceCriteria.authoritativeHash` and its reload-at60 and reload-at600 hash entries, plus the two provenance notes.
- Legacy: replace `acceptanceCriteria.authoritativeHash`, plus the two provenance notes.
- `SAVE_SCHEMA.md`: exactly the reviewed current canonical generator output.
- Import test: clarify the controlled-owner comment; no test behavior changes.

The production `src` and `scripts/lib` diff between8cf and07a is empty. No input tape, scenario, event count/family, acceptance bound, repeat requirement or physics behavior was changed by these metadata operations. The existing five-run telemetry requirement remains in force. The parent's rerun of the three originally failing baseline links is separate verification; I do not claim its completion from this semantic audit.

### Additional frame16 metadata — peer-observed

The parent subsequently relayed Reviewer1's read-only frame16 metadata: ordinary `viewKind=overhead`, `viewMix=0`, tilt **60**, configured zoom **176**, displayed zoom **152.55**, live zoom **152.01**, FOV **50**; public **medium/auto** quality, render scale **1**, dynamic resolution **false**, full motion. Ward roots **602/603/604/606** reportedly had pitch/roll **0** and scale **1**. The operation was still **brace**, with original lamp603 reeling toward receiver604. These are peer runtime observations, not values extracted from the pixels, and the frame16 review makes no completed-installation claim.

Only this report was appended by this reviewer.


## G6 baseline closure receipts — metadata format correction retained

I inspected and verified the log hashes in [merged-baseline-closure.json](evidence/merged-baseline-closure.json) and [merged-golden-closure.json](evidence/merged-golden-closure.json), together with both corresponding logs.

The first attempt on07a **passed save-schema**, but both simulation links failed the existing evidence-schema validation because the two new provenance notes exceeded **260 characters**. They did not reach simulation. My preceding review established the semantic hash diagnosis and exact proposed JSON operations; it had **not checked that note-length constraint**. The [failed receipt/log](evidence/merged-baseline-closure.log) remains part of the evidence and is not described as a green baseline.

The integration owner corrected only the notes in **`8c66b48500d475e48518118293b810dab589e4fc`**. I independently compared both JSON envelopes with07a after removing their `notes` arrays: every remaining field is identical. All notes now meet the existing bound; the maximum lengths are **258** characters in the V3 envelope and **260** in the legacy envelope. The production `src`/`scripts/lib` diff from8cf remains empty.

The [successful rerun log](evidence/merged-golden-closure.log) records:

| Existing baseline link | Recorded result | Relevant unchanged command conditions |
| --- | --- | --- |
| `save-schema` | PASS on07a, 918 ms | Canonical generated-schema check |
| `sim-v3` | PASS on8c66, 6195 ms | Seed47, 720 ticks, existing tape/expectation, `--hash --repeat 5 --reload-at 60 --flight-system v3` |
| `sim` | PASS on8c66, 7217 ms | Seed47, 720 ticks, existing tape/expectation, `--hash --repeat 5 --reload-at 600` |

The two golden links are **2/2 green**, with an internal check-baseline wall time of **7220 ms** and process exit **0**. The outer command receipt measures **7489.575153 ms**, which includes its process overhead. The strict five-run commands are confirmed by the existing baseline source; they are not the comparison-only links that tolerate an expected-hash difference.

These executions belong to the integration owner. This reviewer read their receipts and checked the metadata-only correction; I did not rerun them. Together the receipts close the three previously failing links. They are **not** a fresh full13-link or17-link run, and they do not close the independent public visual requirement.


## G6 public import/reload and identity closure — independently audited peer evidence on `8cf0034e`

**R2-06: CLOSED for the exercised public Import & Load → F5 → F9 route. R2-02: OPEN because the provided ordinary views still do not show the required work relationship clearly. Overall visual acceptance remains REJECT on this evidence set.** The remaining image limitation is insufficient subject framing; frames20–21 do not establish a shape defect in the corrected family-lamp/receiver/cradle kit.

### Provenance and independent audit

I read Reviewer1's released [public import/F9 artifact](evidence/independent-public-import-f9-8cf0034e.json), **279133 bytes**, SHA-256 **`6a96431e369a0cc7de6ce9fce4cd931a5395524da2eaeeacfce33dd71f93d7ed`**. I independently verified its hash, all six referenced PNG hashes, and the unchanged imported export: **2388721 bytes**, SHA-256 **`d010d23e939dcbc6aa61e090913dd5b23026d7a65b72a8495f23aed0e283f3ed`**. All **15** extracted observation objects exactly match their corresponding recorded raw read results in the **88-entry** harness log.

The browser execution belongs to Reviewer1, session44212, using Chromium/SwiftShader at **1280×800**. My work in this pass was independent inspection of the saved pixels, raw results and source provenance; I did not operate a browser or rerun a suite. The loaded production runtime is **8cf0034e**. The final checkout was **8c66b485**; the intervening schema, golden-metadata and test-comment commits did not change production runtime, and the browser was not reloaded for them.

The raw UI sequence shows an empty Quick slot, normal file selection, the observed **Import save file?** confirmation naming Quick, and **Import & Load**. No storage injection or edited save is present in the recorded route. The original v23 export records seed **7407**, playtime **557 s**, and saved-at **2026-11-04T22:35:37.741Z**.

### What the public route now establishes

| Boundary | Independently inspected recorded result |
| --- | --- |
| Successful import | Flight at tick **35239**, simulation time **587.3167 s**, with no recurrence of the earlier Promise-clone failure. The opening plan is complete, its first-playable set is complete, the resource census matches, and it has **18 roots** with zero unverified blocking entries. This particular initial cohort contains **no named Ward roots**; it is not the specific six-root Ward admission proof. |
| F5 checkpoint | The ordinary **Saved Quick** acknowledgement appears at paused tick **35867**, simulation time **597.7833 s**. Main and worker seed are **7407**; credits are **5000**. The Ward operation is still **brace**, so this is an in-progress service save. |
| F9 restore | The first observation returns to the same saved tick/time. The normal **Back to the run** control is then used. The completed opening plan has **36 roots**, matching census, a complete first-playable set, no capture failure and **zero unverified blocking entries**. |
| Specific Ward admission | The F9 plan contains **six blocking Ward roots** with distinct recorded UUIDs and nonempty, verified 64-character content hashes: cradle, lamp, receiver, one shore spine, and both service cheeks. Their asset IDs identify the intended procedural production assets. This directly exercises the previously failing opening boundary in an ordinary public reload. |
| Subsequent service | At tick **37439** / **623.9333 s**, the operation is **installed**, original lamp603 and receiver604 are lit, and the lamp still has serial `venn-family-lamp:01` with receiver custody. This happened after the in-progress F9 restore. |

The F5 read also contains stale pause-summary wording saying nothing was saved this session, and nullable main-side write-status fields. I do not reinterpret those fields as a separate durable-write acknowledgement. The explicit **Saved Quick** UI acknowledgement followed by the actual F9 restoration of tick35867 is the relevant observed roundtrip.

This closes the prior public admission failure for this source/export/route. It also supplies the valid-export public success that the controlled-owner import unit cases did not establish. It does not prove every save entry point or compressed-envelope path; the earlier unexecuted adjacent `saveLoad` RPC observation remains qualified and unreproduced.

### Original identities, custody and native bodies

The observed original work/actor IDs are retained across F9:

| ID | Durable identity | Observed role/result |
| --- | --- | --- |
| 602 | `lantern-ward:cradle` | Original cradle remains alive, hull280, physically separated from the lamp at the receiver. |
| 603 | `lantern-ward:lamp` | Original family serial, hull90, receiver custody; unlit during connect, subsequently lit. |
| 604 | `lantern-ward:receiver` | Original fixed receiver, hull1400, subsequently lit. |
| 605 | `lantern-ward:obstruction` | Original mast remains alive, hull540; already displaced in the imported history. |
| 606 | `lantern-ward:service_face` | Original service face, hull1000. |
| 607 | `lantern-ward:maintenance_part` | Original `lantern-ward:shutter-bearing:01`, hull90, service-face custody. |
| 608 | `lantern-ward:tug` | Original Nessa remains alive, hull200; later recorded moving back from the receiver area. |
| 609 | `lantern-ward:commuter` | Original commuter remains alive, hull320; later position and velocity show renewed movement. |
| 610 | `lantern-ward:maintenance` | Original maintenance actor remains alive, hull320; later recorded approaching the service area. |

Runtime occupant generations renew from **89–97** to **371–379** across restore. These are renewed runtime occupants with retained durable records, not a requirement that lifetime generations remain identical. At the common paused tick **36568**, the seven worker probes for **602/603/604/607/608/609/610** contain actual native bodies. I independently compared each native position and velocity, hull and occupant generation against the corresponding main-side observation: all match exactly. The reported native masses include cradle **54**, family lamp **9**, receiver **0**, and bearing **9**.

At that checkpoint, lamp603 is approximately **0.014 world units** from receiver604, while cradle602 is about **45 world units** away. This supports the observed physical separation and receiver custody. The artifact does not capture the cradle's explicit load-serial field, so I add no new field-level claim about that projection. The recorded nine-ID observations likewise establish those identities; the F9 query is not a fresh whole-world duplicate census.

All recorded player-help/history flags remain false, including `ignored`, and credits remain **5000** through the final observation. This route supports **attended completion without help credit**. It does not demonstrate the seven-minute ignored branch, initial blocked-cut legibility, or a fresh final-source reload of an already completed installation. It also does not replace my earlier separately attributed seed7405 assisted-service/once180-credit and completed-state Continue evidence. Those are distinct runs and source pins.

### Independent ordinary-pixel review: frames17–21

I opened the actual PNGs independently. The earlier frame16 review remains applicable to its own in-progress view.

| Frame | What the pixels establish | Acceptance limit |
| --- | --- | --- |
| [17 — post-F9](evidence/17-independent-public-ward-post-f9-7407.png) | Ordinary live Overhead flight with full hull, shoreline/traffic and some memorial context. | The required work trio is not clearly identifiable as one operation. The installation state comes from the immediate runtime observation, not from decoding these pixels. |
| [18 — Balanced attempt](evidence/18-independent-public-installed-balanced-7407.png) | A full **PAUSED** overlay. | Retained failed capture; it is not a gameplay visual-acceptance frame. |
| [19 — Balanced flight](evidence/19-independent-public-installed-balanced-flight-7407.png) | A visibly sharper ordinary Overhead scene, full hull and stationary HUD, pale/teal shore pieces and small work-like props. | I cannot confidently assign the family lamp, receiving cup and cradle from the image alone. The apparent small-prop grouping is not sufficient proof of their shared household mark or functional relationship. |
| [20 — cradle tracked](evidence/20-independent-public-cradle-tracked-7407.png) | An ordinary view after public map selection/Track Target. The HUD identifies the Borrowable Procession Cradle at **242 u**. The memorial arc is clearly recognizable. | The memorial dominates the composition; the work subject is distant and the trio relationship is not supplied. |
| [21 — approach attempt](evidence/21-independent-public-installed-approach-7407.png) | Ordinary Overhead after public D/W/brake input, target distance **249 u**. An active Navy intercept alert and visible weapons effects are present. | This is failed subject framing with combat interference. It cannot establish the corrected trio's shape legibility. |

The bounded read-only diagnostic after frame21/public pause projects the original root centers into screen coordinates as follows: cradle602 **(−22.54, 29.96)**, lamp603 **(−82.20, 130.45)**, receiver604 **(−82.24, 130.43)**, against a **1280×800** viewport. All three centers lie outside the left frustum. Their captured roots retain scale1 and zero pitch/roll. The receiver's `rootVisible=false` is a runtime visibility flag in this off-frame situation, not independent evidence of an on-screen disappearance defect. Center projection also does not bound every pixel of an extended mesh. These observations explain why this last image cannot settle the subject question; they do not establish that every ordinary viewpoint fails.

Frames16/17 used Automatic quality with a stored scale1 and the adaptive-resolution toggle off. The public UI explains that Automatic can trial resolution bands; the actual earlier transient band was not measured. Public Balanced selection changed quality mode to **manual**. Frame19 onward records **medium/manual**, scale1, dynamic resolution off, full motion, **1280×800** canvas and `dynResScale=1`. I make no exact earlier-band or sole-cause sharpness claim.

The prior giant cargo-package and rescue-beacon surfaces are absent from the inspected visible regions. However, a recognizable memorial and a valid installed-state record are separate from a readable view of this particular family work scene. **R2-02 therefore stays open on the released frames16–21.** The separate new-save arrival capture requested by the integration owner is not presumed successful before its pixels are available.

No owner-GPU or60fps qualification follows from this software-rendered session. Reviewer1's ordinary quit receipt closes only its own session44212; I took no process action. This pass appended only this report.


## G6 final fresh-arrival pixel review — public seed7421, runtime `8cf0034e`

**Narrow visual progress is established: an ordinary fresh arrival is reachable, and the Chase views now communicate a small work area in front of the large memorial at credible ship scale. R2-02 remains OPEN for the required finite-lamp/cradle/receiver relationship and clear-versus-carry choice. Overall visual acceptance remains REJECT because those clauses are unproved, not because these new pictures establish another geometry defect.** The prior public import/F5/F9 closure, R2-06, is unchanged.

### Verified provenance and route limits

I independently opened the actual five gameplay PNGs32–36 and reviewed the integration owner's [fresh-arrival artifact](evidence/root-fresh-arrival.json): **76442 bytes**, SHA-256 **`77dedbd76ed718a093c898870bbab154da8cdd646e5e04f867407c414dee4286`**. I verified all **six** recorded PNG hashes and byte counts, including the excluded launch image30; the embedded harness source and actual harness file both match their recorded hash, and the referenced final-source manifest matches its recorded hash. Requested image31 does not exist, consistent with both recorded screenshot timeouts.

This browser execution belongs to **root/session8971**. The recorded runtime is **8cf0034e814ef18af14dcc52f26485e637820e57**, published equivalent74329c72. The artifact records source checkout **f3d8cc3cbd2724107b4070d945027e28508fcfcc**. I independently checked that its production `src`/`scripts/lib` diff from8cf is empty; the different documentation/publication commits are not relabeled as new runtime executions.

The **48 unaltered tool-result events** record ordinary New Game with **7421** entered through the public Universe Seed field, **Standard/Hitch**, and **I've Flown Before**. They also record the normal Video-page **Balanced** selection before launch and visible **Full** motion wording. The harness uses Chromium/ANGLE SwiftShader at **1280×800**, with no game URL flags.

The ordinary local-map search selects the Borrowable Procession Cradle contact. After a locator stability timeout, a DOM read supplies the actual visible, enabled **Track Target** button's rectangle; a normal mouse click inside it produces **Course set: Lantern Ward · Apron approach**. The subsequent gameplay HUD reaches **2 u** in frame32 and **3 u** in the following DOM read, with **100% hull** and **0 U/S**. These are directly supported public-arrival observations.

A public **Space** input and Massline feedback also appear during the route. This is an ordinary-input run, not a certified untouched or ignored-history experiment. No native identity, help flag or work phase was successfully read. The later camera changes use ordinary Backslash/Minus/Equal and the public brake key. Frame36 is followed by Escape and a visible Pause footer reading **SEED7421**. The only subsequent commands are read-only diagnostics and the harness's own normal quit.

Both post-pause diagnostics—the larger Ward/settings projection and the smaller mode/tick/phase read—fail their **10-second** bounds. Final runtime settings, native poses, identity mapping and operation phase are consequently **unknown in this fresh run**. The earlier public Balanced selection is established; a complete final settings or dynamic-resolution snapshot is not. The two failed45-second image31 attempts and the additional DOM-read timeout remain in the raw evidence. No cause is assigned to those host/browser stalls.

### Independent frame judgments

| Frame and actual mode | What now reads from the pixels | Remaining limitation |
| --- | --- | --- |
| [32 — Overhead arrival](evidence/32-root-fresh-approach-7421.png) | Clean active flight at the named Apron, full hull, stopped ship, nearby traffic and small fixtures. | The family work trio is not identifiable at this framing. Offscreen or unassigned objects are not evidence of malformed geometry. |
| [33 — Chase, despite its filename](evidence/33-root-fresh-apron-overhead-7421.png) | The large candle memorial sits behind a distinct pale/brass platform with a cup/pedestal-like upper form. A separate red/amber rail machine lies to its left, with open space between the forms. This is a coherent work-area composition at ordinary ship scale. | The separate finite lamp, current load state and shared household mark cannot be assigned confidently from this picture alone. The bright cylindrical item is visible but remains unassigned. |
| [34 — wider Overhead](evidence/34-root-fresh-apron-wide-7421.png) | Clean active view, full hull, stopped HUD and Apron10u; nearby ships and scattered fixtures remain visible. | Widening this mode does not retain the useful memorial/work relationship from33. This is a framing limit, not a new shape finding. |
| [35 — wider Chase](evidence/35-root-fresh-chase-shore-7421.png) | The red twin-rail body and the pale platform/cup form are larger and easier to distinguish. The HUD records impact218,4 U/S and full hull. | The ordinary camera-mode panel and radar overlap the right-hand platform. The image establishes neither the cause of the impact nor the current named work identities. |
| [36 — final tighter Chase](evidence/36-root-fresh-work-pocket-7421.png) | Clean active flight, **100% hull**, **0 U/S**, Apron**31u**. A small pale/brass work platform sits clearly between the player and the much larger candle memorial; the separate red rail machine remains at left. This is the strongest new context/scale view. | At this low viewing angle the central object's recessed well and the repeated three-stroke household identity are not unambiguous. The original lamp and its relationship to the two seats remain unverified, as does the current blockage or service phase. |

Frame30 is a launch-preparation image and is excluded from gameplay acceptance. Image31 is not claimed. No Pause overlay or Navy-intercept alert covers the final36 gameplay capture; the subsequent public Pause is separate provenance evidence.

### Exact closure boundary

| Visual/public clause | Current independent verdict |
| --- | --- |
| Fresh ordinary Adventure route to the named Apron | **PASS for this7421 route.** Public inputs, successful arrival HUD and clean live frames are recorded. |
| Recognizable memorial context with a smaller distinct work area and credible ship-relative scale | **PASS within Chase frames33/36.** These pictures improve materially on the earlier missing-subject views. |
| Previously observed screen-covering fallback-package/beacon wall | **Not visible in these inspected regions.** No new repeat of that symptom is established. This is not a new all-root transform or animation audit. |
| Unambiguous finite family lamp ↔ loaded/empty cradle ↔ destination receiver, with shared household identity | **UNKNOWN / not qualified by these views.** The scene contains plausible work forms, but assigning the exact three bodies or their present state would exceed the pixels and the failed diagnostics. |
| Visible initial mast obstruction and intelligible clear-versus-carry alternative | **UNKNOWN / not exercised as a verified initial-state view.** No successful contemporaneous phase or identity observation exists. |
| Current attended contact, clamp/load state, native maintenance, installation, payment or another Continue | **Not established by this fresh capture run.** Earlier independently attributed runtime evidence remains separate and is not reopened or substituted here. |
| Full-motion registration or target-device performance | **Not newly qualified.** A static screenshot cannot establish an animation time series, and this SwiftShader run supplies no owner-GPU or60fps result. |

I identify **no new narrow geometry defect that can be assigned confidently to a named Ward object from these frames**. The remaining visual acceptance gap is concrete: the ordinary images still do not communicate the exact finite lamp/seat relationship or the original route-choice problem sufficiently to close R2-02. That does not imply every ordinary viewpoint fails, and it does not justify a speculative camera rewrite, relocation or geometry patch.

The raw quit receipt reports **exit0** for root's own session8971. I did not operate or stop a browser, execute a suite, or modify source/fixtures. Only this report was appended. **This bounded review is complete and the report-only claim is released to the integration owner.**
