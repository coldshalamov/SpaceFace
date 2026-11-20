# Whole-game stability and performance checkpoint

Use the [whole-game program in the build map](../../../build_map.md#whole-game-completion-program)
and resume through the QUAL rows in [the fleet queue](QUEUE.md). Keep route status there and use
this checkpoint for measurements, behavior results, and build references.

## Integrated batch — November 19, 2026

The full fleet gate passed source syntax, import lint, Adventure boot, Swarm boot and the
20-repeat 47-A simulation replay. The shared-checkout Swarm candidate sealed the runtime and
verified 549 current asset files by SHA-256 over HTTP. The manifest was 35.5 MiB and referenced
the art already in the checkout. The server preserves byte ranges for pinned movies. A fixture
verified range responses and rejection of a same-size edit.
See `.devshots/fleet/coordination/whole-game/nov19-current-art-gate.txt` and the
[candidate workflow](../../../docs/VALIDATION_WORKFLOW.md).
The later integrated gate also passed Adventure boot, Swarm boot and the 47-A replay. It
included the deliberate floor purchase, local radar and presented gantry fixes. The separate
Swarm report is still **INCOMPLETE**. It reached active flight with valid thrust and yaw and
watched 10.5 simulated seconds. It recorded one visibility pop and zero loading-state pops.
There were too few coherent pixels to grade combat readability, and the software run supplies
no hardware frame verdict. See `whole-game/nov19-presented-gantry-gate.txt` and
`.devshots/fleet/gate-swarm-N2HAEe/verdict.json`.
The zero-Scrap build then passed both pinned boot routes and the 47-A replay. Its Swarm
play report again reached live flight, with one visibility pop and zero loading-state pops.
Round resolution, coherent enemy/projectile samples and hardware timing still need coverage.
See `whole-game/nov19-zero-scrap-gate.txt` and `.devshots/fleet/gate-swarm-B4YuO8/verdict.json`.
The later pinned batch with Cargo decision handling and the Foundry round-panel guidance also
passed syntax, imports, Adventure boot, Swarm boot and the 47-A replay. The independent Swarm
play report is **FAIL**. Ordinary flight and controls passed with zero visibility pops. Its
fitted-item read timed out on the free shelf, while the headed route already verified the exact
fit. The preparation reader now fits one visible free gun and checks the accepted receipt, zero
charge, exact owned instance and visible hardpoint. The legacy paid comparison still runs on
paid shelves. The new reader passed those checks in headed Electron. The exact instance stayed
fitted through first thrust. The full software verdict awaits a rerun.
The software capture flagged 33% threat-box overlap with effect bounds. The retained frame
shows a bright blue effect and scenery near the HUD. It lacks the target silhouette pixels
needed to determine whether the effect covers the hostile. Hardware timing remains open.
See `whole-game/nov19-cargo-guidance-gate.txt` and `.devshots/fleet/gate-swarm-Eq6JGD/verdict.json`.
Ten closed main-thread traces reclaimed 1,198,582,167 stored bytes. All ten stayed at their
original paths and matched their original SHA-256. Git lists one registered worktree. See
`whole-game/more-closed-native-trace-compression-nov19.json`.
Thirteen older Finish pins and runtime snapshots reclaimed another 249,862,488 stored bytes
with matching SHA-256 at the original paths. See `whole-game/closed-finish-pin-compression-nov19.json`.
Eight more closed source bundles reclaimed 542,488,857 stored bytes with matching SHA-256
at the original paths. See `whole-game/closed-source-bundles-compression-nov19.json`.

The independent Swarm opening verdict remains **INCOMPLETE**. Hornet setup, the Ricochet
Foundry spawn and flight controls passed over 10.5 simulated seconds of ordinary play. VFX
bounds covered 1% of the screen at p95 with 0% player or threat overlap in the graded summaries.
Four coherent pixel splits recorded no threat overlap. Enemy and projectile readability,
round completion and hardware cadence still need evidence. The prior committed-art bound
failure came from the projected Line rim overlapping one of two threat boxes. The closest
retained picture did not establish silhouette loss. See `.devshots/fleet/gate-swarm-pSxeLu/`.
The current screenshot also caught the incoming warning covering the Crate label. The HUD now
uses the label's painted position when seating the warning. Mounted checks passed at 960×540
and 390×844 when the label appeared and moved, with the danger cue still shown in a tight layout.

The warm Round 20 capture remains at 20.36 draws/s and 11.27 fresh world poses/s. A direct
four-step worker replay showed four distinct player poses, with only the last sent in the
canonical reply. The renderer consumed every newly visible tick on its first callback. A
presentation-only candidate exposed intermediate player poses between batch replies. A
crowded headless replay kept a safe sample before reply in 34 of 48 batches under the contact,
tether and nearby-body guards. On the strict native pair, the enabled warm window gave four
early draws and two additional distinct player updates. Stock and enabled drew 25.40 and
21.58 frames/s. Fresh world poses were 12.92 and 11.76/s, with 56.19 and 65.17 ms p95 draw
gaps. Contacts and surviving hull differed across the windows, so the timing delta does not
isolate publisher cost. The gain was too small to retain the added path. The sensor and
world-activity candidates also showed no material gain. See
`whole-game/round20-player-pose-native.json`.
The latest strict Round 20 capture uses the native 1832×973 buffer at the same Low/Auto
30 FPS cap. Over simulated seconds 21.07–27.12 it delivered 21.09 world draws and 11.04
fresh world poses per second, with 67.47 ms p95 draw gaps and 0.602 sim/wall. It kept one
pilot life and 13–15 hostiles. The GPU query receipts near the end cover 31 matched
warm frames. Scene and composite together had a 21.01 ms median and 23.00 ms p95.
Worker reply work had an 80.62 ms median with three simulation steps at the median.
The pilot's contacts, scene calls and host load differed from the previous run, so
these timings establish the current shortfall. Next, measure and reduce the dominant
fixed-step stage while keeping native pixels. See
`.devshots/main-thread-profile/whole-game-round20-sharp-native/`.
Matched headless warm replies reproduced the worker miss with the same input, native settings,
body counts, commands and state/event signatures across the control and attributed arms. The
control fixed steps took 25.06 ms at median and 38.70 ms at p95. Sampled Physics took 11.55 and
24.97 ms, Tactical AI 7.04 and 16.21 ms, and the Rapier solve itself 1.59 and 4.40 ms. Impact
processing reached 21.34 ms on the slowest sampled step. A shortcut for impact pairs with no
consequence target saved about 0.11 ms across 915 impacts and stayed out of production. See
`whole-game/swarm-round20-warm-worker.json`.
The follow-up matched the warm control's state and commands. The 21.34 ms impact spike did
not recur. Native contact extraction stayed below 0.42 ms at the four sampled busy ticks.
Grouping the 38 campaign-plant callbacks preserved order and saved 0.008–0.012 ms per
contact batch, so the original registration stays. See `swarm-round20-warm-impact-hierarchy.json`
and `swarm-plant-impact-cohort.json`.
The next exact worker pair tested cheaper AI capability projection. It preserved state, events
and commands. The measured owner saved 0.003 ms at median per active AI tick and the full steps
did not improve. The candidate was removed. See `swarm-round20-warm-capabilities.json`.
The Round 20 worker census attributed repeated batches of 12 bodies to complete Foundry
optic-lattice restamps while older cells remained live. A bounded single-stamp diagnostic held
peak native bodies to 150 versus 165 and kept the sampled pilot and full-hull arrival receipts.
Fixed-step p95 was 27.45 ms versus 26.49 ms stock. The candidate stayed out of production.
Ordinary Round 2 preparation previously found no valid starting lattice beside the live wrecks.
Two authored Foundry alternatives now give all 12 cells clearance. The production worker kept
the same cells and wrecks through the first four physics steps. Rendered first-picture and
replacement-cue checks remain open.
The Round 1 opening rock producer now also honors the active Crate apron at spawn. The test
kept six physical rocks and the early throw corridor across the full seed rotation. Seed 25
gained about 40 u of apron clearance. Seed 4242 kept the same layout and moving-cover play.

A strict uninstrumented Intel startup pair tested moving hidden menu-holder compiles to the
later cook. Both arms reached the same paid Hornet, active Round 1, sealed requirements and
17 matching room signatures. Launch to first draw rose from 19.07 to 23.71 seconds while the
early wait stayed near 4.01 seconds. The change was removed. The pictures came from different
simulation moments. See `whole-game/swarm-menu-holder-art-pinned-{baseline,candidate}-native/`.

From the paid Tethys Quick, the headed Adventure pilot weighed the crate at Scale 4, accepted
Furnace Detail on the Tethys mission board, paid the 194-credit Ceres gate toll and saved at
the marked refinery. Tracking a moving repair mite on the Chart used to drop the mission
owner and its Frag and Casket instructions. The authority now resolves the same live body at
its current position. The next headed Continue kept the mission and used one Frag cassette
for the first marked site. The Quick Save records 1/4 cleared, three cassettes left, 6,386
credits and all three Casket worms alive. See `whole-game/furnace-detail-postscale/` and
`whole-game/furnace-detail-first-clearance/` under `.devshots/fleet/coordination/`.
The worker now supplies the loaded rack and cooldowns to the preview. A headed Continue
showed two warning rings around an endangered Casket with Bomb held. The warning cleared
after the pilot moved away. Canceling both holds and saving retained all three Frags and 1/4
progress. The clear example was away from the site. See `furnace-detail-casket-preview-bridge/`.
The next headed attempt fired one Frag from a clear warning frame. The blast landed within
3.57 u of the preview center and all three worms survived. The marked mite moved out of the
blast over the six-second fuze. The new Quick is 1/4 with two Frags, and the earlier three-Frag
Quick is retained. The worksite briefing stays on the objective and the Vessel Link waits for
deliberate inspection. Both competing surfaces were absent on the release frame. See
`furnace-detail-casket-direct-release/`. The stock worker reached 2/4 on a different coasting
release. Holding Bomb now marks the moving mite when it could leave the projected blast before
detonation. Focused checks cover both recorded shots, exact target life and warning rendering.
The moving-target cue and a safe follow-on shot still need a headed check.

The authored Furnace layout gives the repair mites an eastern approach and Caskets a western
refuge around the Stone Lung. Two seeded layouts preserved the fauna identities, and Continue
kept the earlier dead mite and ore lots. From the earned 1/4 save, the production simulation
worker flew the eastern approach and used two stock Frag cassettes to reach 4/4. The three
Caskets kept their hull and one Frag remained. Two headed Continues on the same pin also
reached 4/4 and saved one Frag, all three Caskets and all three ore pods. The tracked objective
switched to the intake. The yard gantry materialized, but remained offscreen at the tested
approach, 97 u away. Hail, disposal and settlement remain open. See
`furnace-detail-authored-refuge/` and `furnace-detail-refuge-gantry/`.
The next headed approach brought the gantry's center into view. The ordinary pick selected
the colocated intake beacon. The gantry now stands 30 u to the west, and a Rapier fixture
pulled a reachable pod into the original intake. The authority offers a reachable original pod
when an earlier one has drifted past the cable. In the next headed Continue the new anchor was
in view and 51 u away, but the gantry model stayed pending. Its live picture and settlement
remain open. See `furnace-detail-cr-feed-approach/` and `furnace-detail-offset-gantry/`.
The missing authored-place flag is now set on the gantry's spawn record. The headed route
selected an exposed part of the rendered gantry, hailed it and winched original pods 2 and 3
into the physical intake. Both receipts survived Quick Save. The last intact pod was 1,371 u
away. The mounted offer named the 900 u cable limit and told the pilot to tow it closer.
The pilot tracked it on the Chart, latched it with F and towed it back into range. The final
headed Continue winched that original pod and paid 480 credits once. Quick Save contains
all three original pod receipts, all four clearances, one Frag and a 6,866-credit balance.
The run also caught an idle RMB pick selecting or aiming at the gantry while attaching a
separate body. See `furnace-detail-gantry-exposed-aim/`, `furnace-detail-last-pod-tow/` and
`furnace-detail-last-pod-winched/`.
The canvas pick now carries that explicit service interaction through the existing mouse
event. Main and worker checks protect CR-FEED selection from an idle cross-body latch,
including a reused entity ID. They cover later empty-space acquisition, existing F bindings
and an active throw. The post-fix native input route remains open.

The saved pilot has zero fuel after Furnace. Chart previously offered an immediate drive leg
to Tethys even though the jump owner would refuse it. The same earned save now shows that the
drive needs 36 fuel and 0 is aboard. The 180-credit gate is available as an alternate plotted
route. Focused checks verify both the drive refusal and the available gate, and the existing
course stays plotted. The headed Mission Log opened Tethys Trade Hub without replacing that
course. The pilot repaired and refueled at Ceres, paid the 180-credit gate toll, reached Tethys
and accepted Cinder Marks. A departure scan seized 16 units of restricted or contraband cargo,
fined the pilot 7,278 credits and saved a zero wallet plus 1,167 in debt. Chart had shown the
gate fare before commitment. It now uses
the same onboard exposure rule as the scan to show the possible seizure and fine before a
jump, with the hidden hold and exposed salvage bay accounted for. The headed Chart showed
the 16 units and 7,278-credit fine above the 180-credit jump. The Ceres Market now lists
eligible carried specimens with no opening stock. The two headed sales paid 13,548 and 2,161
credits. Auto retained 22,000 credits with only two Stolen Goods still exposed. A later run
loaded that exact Auto, stopped clear of the berth and jettisoned the two units as a real pod.
An incoming Custody card then intercepted the Cargo Close button. The clean crossing and
signed Cinder save passed on the next pinned candidate. The actual Close button received the
pointer, and the latest run paid only the 180-credit toll, accepted `m_5` at Tethys and saved
21,820 credits, 100 fuel and zero debt. The Custody card did not recur during that click.
The focused input checks cover both panels open and keep the decision's digits available.
See `adventure-cinder-legal-sale-native/`, `adventure-cinder-paid-gate-native/`, and
`adventure-cinder-cleared-and-paid-native/`.
The Ceres docked Quick reported a 281 ms elapsed paced serialize phase, which spans any yields.
The separate in-flight Quick used the synchronous path and spent 733 ms from capture through
the write. Live Quick now captures a detached snapshot at the keypress and uses the paced
encoder and writer. The focused check advances real motion while the write is pending and
verifies the exact captured state, current slot precedence and restore. The remaining true
capture was about 347 ms at Ceres and 191 ms after gate arrival in the headed clean route.
The encoder and writer no longer share that capture task. The later Cinder tow Quick still
recorded a 405 ms synchronous capture. The next headed tow save recorded 300 ms, including
118 ms of native export and canonicalization, 41 ms of attestation compaction, 114 ms of other
save readers and 27 ms detaching the snapshot. The two saves represent different live scenes,
so use the breakdown to choose the next reduction. See `adventure-cinder-contacts-tow-continue-native/`.
Native physics accounted for 108–141 ms in two adjacent paced autosave captures. Save adoption
now reuses one normalization of each saved body for both independent geometry comparisons.
The isolated comparison on 99 bodies from the earned Tethys save fell from 31.23 to 14.31 ms.
The real adoption checks still reject mismatched native or authored geometry and keep the prior
world. End-to-end Quick timing for this follow-up remains open.
The Cinder wreck shows its original callsign before scanning and after recovery from Continue
in the same-life and durable-marker tests. A headed Load of the signed Quick crossed both gates
to Charon, preserved full fuel and showed the three named Wasps. Another ship destroyed Cinder
Two. Quick retained one clearance and the original `aft_1lg7wde` mark at 21,700 credits. Only
one player shot at a different Wasp was observed. The original wreck initially fell below
ambient hostiles in Contacts. The three contract bodies now receive priority while the job is
tracked. A headed reload selected the exact original, retained the 1/3 mission, and showed the
correct bearing. The pointer click left the right HUD focused and blocked a trusted yaw press
with no menu open. Contacts now returns pointer selection to flight focus. The next headed
reload confirmed an unblocked A press and real yaw after selecting the same wreck, then closed
under thrust. The visible F Tow cue also works when it follows the wreck to the screen edge.
Pressing F on that cue latched the exact original `aft_1lg7wde`. The headed Quick recorded
2/3 clearances and the original hull, with the active tether and native joint in the save.
The old save lacked the combat attachment's durable target reference and reopened detached.
New Quick Saves record the original Cinder marker. The focused restore checks reconnect only
after Aftermath binds the same wreck and reject recycled, stripped, or explicitly detached bodies.
O now opens Contacts explicitly without a prior lock. A headed run reopened the legacy Quick,
selected the rematerialized wreck, latched it again, saved and restored it without another F
press. The native run used the existing persistent target reference. The focused tests also
cover the new reference for a newly encountered hull. Rook settlement remains open. See
`adventure-cinder-contacts-tow-continue-native/report.json` and `adventure-cinder-visible-tow-native/`.

An Adventure frame showed an incoming decision and the flight powers both advertising 1–3.
The live instrument now reads the decision deck's current claim. It shows any available
alternate binding and gives back the numbers when the decision closes. A held key's auto-repeat
can no longer answer a newly arriving decision. The headed Ceres frame shows that division and
the moving-mite cue together. The optional Hymn scene started inside the tracked refinery job.
The lived scene scheduler now waits while the player tracks the job inside its authored zone.
The focused check verifies the same vignette can start after leaving the job. The older Dust
planner digest still differs even when the changed scheduler is excluded from the test process.

The first paid Hornet run ended at the Foundry rim before collecting an eight-credit chip.
The revised actor let the title film finish and reached Round 2. The wall label showed
`PULSE LASER S · 500` and `Replaces Autocannon S` before a Wasp ended the run.
The next native run welded the Hull from 167 to 260 for 40 credits. A physical Round 2 chip
gave exactly eight Scrap at the pickup tick. Before that pickup, a transit line crossed the
Crate and automatically spent 950 credits. The Polarity Inverter replaced the gun and the
exact Autocannon instance went to spares. The named paid wall gun and bank route remain open.
See `swarm-earned-floor-centre-pickup-natural-title-native/` and
`swarm-earned-floor-centre-pickup-weld-and-move-native/`.
The floor now requires the player's Interact at the shown quote and physical contact to buy.
Focused worker checks bought the chosen gun once and left the Crate alone during transit.
The revised tag showed the price, replacement policy and the bound Select input in headed
combat. A center approach reached the Crate at full hull. A moving rock closed the final
approach on that run and the follow-up, before physical contact. Headed purchase verification
remains open. In `swarm-round-one-crate-tangent-visible-native/`, the same live frame shows the
new 600 u radar with separated local marks. Focused checks cover expanded range and mode
transitions.
The later ordinary setup starts at zero Scrap and shows free compatible gun choices on the
bare hull. The player can fit one lasting gun or explicitly launch empty. The worker preserved
the exact fitting on Retry and reopened the choice on Again. The exact granted instance has
no resale value. Focused checks preserve checkpoint and legacy shared launch funding and show
that the ordinary start keeps the Hangar profile while skipping the War Chest award. Headed
Easy Foundry opened the chosen Hornet with eight empty fittings and zero Scrap. Selecting
the shown free Autocannon installed one instance at price zero. The same instance and zero
balance reached active Round 1. Pressing W advanced the ship 5 u and four fresh draws. Cold
Launch to first world draw was 17.94 seconds. See `swarm-zero-starter-native/`.
The opening now shows only available free compatible guns, with an explicit comparison and
an exact fitted or spares status. Launching without a gun is explicit. The optional Circuit
remains in Round briefing. Mounted Equipment checks verified compare, free fitting, spares,
rearrange and bare launch. The native cadence actor can now confirm a free fit with the same
receipt and slot checks used for a paid fit.
The headed run on the updated shelf showed the three free cards and their prices without the
browse controls. Autocannon S still fit at zero cost, and the same instance reached Round 1
at zero Scrap. W moved the ship 16 u across seven world draws. The title film reached the
menu without a skip. Launch to first draw was 22.49 seconds in this run. See
`swarm-starter-shelf-native/`.
Again now restores the approved starter gun into its original slot, or preserves an explicit
bare start, with zero Scrap and the original seed. Mounted recap and worker flight checks
prove both outcomes and send a refused mount back to the starter shelf. The first headed test
flew past the early fight and stayed alive. The headed pilot then retired from Round 1 and
clicked Again. The same seed, Hornet and exact starting gun model and slot were active at zero
Scrap, with a newly issued instance. W moved the ship on the new run. Headed first draw ranged
from 5.89 to 9.74 s before the diagnostic capture. The 9.74 s cook spent 8.13 s in current-sector
preparation, including 2.81 s waiting for post-opening admissions and 2.34 s for the upgrade queue
to become idle. The broad earlier pipeline wait took 0.25 s.
Comparison bars for the free Autocannon kept their exact lengths before and after fitting in
the same headed run. Rearrange showed the actual gun on Hardpoint 1 and the pilot flew with
that instance at zero Scrap. See `swarm-starter-retire-again-comparison-native/route-log.json`.
The next headed debrief said `You started with a free Autocannon S` and omitted the draft
claim. Its instrumented Again drew at 10.27 s. The late 1.56 s color-pipeline wait tracked two
new asteroid material programs. Both keys were absent on Results and the last one became ready
at the end of the wait. The capture added no graphics readiness queries. See
`swarm-starter-retire-again-pipeline-tail-native/route-log.json`.
The five-second target and headed defeat path remain open.
The seed-4242 bank impact had an unobstructed high-speed approach without a warning. A bounded
player-only predictor now reads the actual oriented bank and rim faces. The saved approach
raised one quiet warning 1.25 simulated seconds before contact and turning clear retracted it.
The focused checks include real gaps and corner contact. Gameplay presentation remains open.
Outside the Foundry, a single marker and return bearing target a real rim gap. The simulated
routes approached around the actual plates and removed the cue on re-entry. The headed run
created the return alert while its generic seat stayed hidden. Moving it to the Swarm round
panel made the cue and one gate visible outside the gap. The next pinned headed run held W
through the gap, saw `Foundry gate →`, then held S to cross back through the same gap. The
marker and cue cleared on the same ship life in active Round 1. See
`swarm-foundry-guidance-again-reentry-native/route-log.json`.
Mounted starting equipment also follows the active device and current Fire binding on an
open card. Headed controller switching remains open.
Ordinary zero-Scrap Swarm now pays the authored wave-clear reward through the run wallet.
The Easy Foundry owner replay earned 118, 289, and 514 Scrap after three clean rounds and
paid the existing 500-Scrap wall-gun quote. The ledger prevents duplicate or special-run
payments. Native earning and fitting through that route remain open.
New ordinary door codes carry the zero-Scrap start, exact bare hull, difficulty, Threats and
training into the existing Equipment flow. Copy and Paste plus first-flight fit were checked
in the mounted door and production worker. The legacy code still decodes byte-for-byte.
Native playback of the new share format remains open.

The headed Raid Continue completed the intended throw with the actual held Raider. The pilot
let out the line, flew past the side of the marked rock and tapped RMB on the lit Throw cue.
The release registered a solid impact at 59.96 u/s and Quick Save recorded the completed Raid.
The objective now teaches that side pass, then keeps the marked rock and the instruction to
watch it on the HUD while the Raider is in flight. A later headed run observed that instruction,
completed a solid hit at 57.44 u/s and decoded its saved Raid completion. See
`adventure-raid-fly-past-native/` and `adventure-raid-hud-witness-native/`.

## Integrated batch — November 18, 2026

The [batch checklist](../../../build_map.md#checklist-for-each-integrated-batch) drove release,
simulation, presentation, and Adventure job work together. The following outcomes carry forward in
the QUAL rows.

A headed Continue stopped before the title because an extra `else` broke the minimap module.
The import-path lint had passed. The duplicate line was removed and the existing parser now runs
first in the fleet gate. The updated quick gate passed syntax, imports, and playable Adventure
boot. The 720-tick V3 47-A comparison also passed across save and reload. The full Swarm gate
subsequently ran on the [November 19 current-art candidate](#integrated-batch--november-19-2026).

### Follow-up on the first hour

| Player outcome | Evidence | Next action |
|---|---|---|
| Adventure law and tools | One native run reached the 47-A scan after throwing the learner rock and the Raider. Another recorded a direct collision with Warden Keel at 5.22 s of simulation while the learner rock was attached. The kill opened a warrant and dispatched three patrol units because kill adjudication bypassed the opening protection used by the damage and latch paths. The native collision fixture now exercises both sides of that boundary. A further rendered run again reached the scanner and showed the new instruction. | Follow the marked sample through mining and the first berth. Record any collision or navigation stall by the exact body and input. |
| Scanner and mining controls | The tracker names Q and the appropriate wheel slice on keyboard, reads the controller's own bindings, and names Powers → Flight → Scan on touch. Continue refreshes the lesson from the current bindings. The mobile deck fixture activates the actual Scan control. The worker test verifies complete taps between sim frames, one delivery per tap and cancellation on blur. | Check hardware touch in the opening and confirm the visible scan advances to the right mining target. |
| Returning controls | Boot and Continue now share the binding migration. The real input owner gives older stock profiles Shift boost and F tether, and keeps saved custom bindings and explicit unbinds in both modes. The V3 save/reload comparison matched. | Reopen a representative old profile in the packaged desktop route and use the two controls during flight. |
| 47-A chart and camera | The marked rock binds to the actual Helios rim. A direct approach once stalled against the station truss 1.3k u from the sample, and a later Chart course lost the Scan prompt and cropped the rock. The tracker now gives the Chart action beyond scanner range. The plotted course keeps its original coordinates as the world marker and camera follow the matching live rock. In the fresh headed replay at seed 4151827082, the regular Chart course cleared the truss, with both ship and marked rock visible at Full Stop, followed by Scan at 95 u, Mine Beam and a recovered sample. The Mission Log opens the same site on the Chart. The hover tag now names the recovery site and shows Scan or Mine Beam with the current binding in the mounted check. | Check the revised hover on hardware and keep the separate Raid throw open. See `adventure-fresh-bound-workpoint/16-47a-work-view.png`. |
| First paid freight and Continue | The signed Helios Auto restored eight sealed Fuel Cells, 400 credits and the exact tracked course. The native route paid the 180-credit gate toll and docked at Tethys. It paid 760 for the Fuel Cells and 600 for the separate alloys. After the GPU admission change the run earned the same 760 and saved 1,580 at sim 518.25. The stock-title replay restored that exact Quick Save with the completed Fuel Cells receipt and the empty Fuel Cell hold in visible Tethys flight. See `adventure-signed-freight-startup-recapture/` and `adventure-boot-ktx2-baseline/`. The signed run reversed and replotted after a stall near a transfer arm. A same-position Rapier test cleared it on both avoidance sides, so the cause remains open. | Verify the uninterrupted fresh route. The driver records heading, velocity and available native contact evidence if the gate stall recurs. |
| Leaving the Raid and taking the first job | In the headed saved route, F released the tether and the pilot flew clear. The tracker marked 47-A, the camera framed it with the ship, and the pilot scanned at 110 u, mined at 109 u, saved the sample, and earned the 400-credit assay at Helios. From that berth Auto, the normal board accepted eight sealed Fuel Cells and kept the course after Undock. The pilot paid the 180-credit gate toll, delivered all eight at Tethys and received 760 credits. Title Continue restored the exact Quick Save with one completed freight receipt, 6,580 credits, zero Fuel Cells, and a visible Tethys world. See `adventure-withdrawal-freight/` and `adventure-withdrawal-offer-receipt/`. | This also passed from fresh New Game. On an earlier saved replay the offer control mounted just after the automation wait, so the actor now waits for the actual button and holds it until it commits. |
| Fresh first freight and onward to Scale 4 | Fresh New Game at seed 4151827082 reached the assay, docked at Helios and took eight sealed Fuel Cells. The selected freight stayed tracked after departure. The toll charged 180, the Tethys delivery paid 760 once, and Quick Save and title Continue retained 6,580 credits, one receipt and zero Fuel Cells. From that exact save the headed pilot used the Mission Log, plotted Scale 4, closed the Log and flew into the ring. The original six-unit crate read 18.8 t against a 20.0 t stamp once. The hold and balance stayed the same. The corrected crate tag distinguishes those numbers in focused checks, including older saves. The next Furnace Detail row now opens Tethys Trade Hub in the mounted route. | Accept and finish Furnace Detail through the live station. See `adventure-fresh-bound-workpoint/` and `tethys-scale4-mission-log-ring/`. |
| First-freight interruptions | The Helios survey prism was using checkpoint enforcement despite being authored as a passive weighing site. Focused checks kept its measurements and a real checkpoint's escort behavior, and preserved old settled fines. The advertised chart inputs now remain available with a selected hostile or low hull. The native signed-freight replay passed both chart actions. Workshop and Empty Seat each defer unsolicited offers during the tracked freight in focused tests. The later native Helios Continue showed no optional Workshop or Empty Seat decision during the signed job. Calm zone flavor is now deferred during first freight and readable in the Zone Record. Real law and caution events still pass the focused checks. | Check the revised attention behavior from fresh New Game. |
| Flight hold value | A mixed lot of ten Fuel Cells was valued as though all ten could be sold. The same lot, with eight committed to freight at a quote of 100 each, now estimates only 200 credits. When the freight seal is released, the full value returns. The hold readout wraps in the mounted 1280×720 and 1000×540 desktop views and the 390×844 touch layout. The latest Helios Continue shows the wrapped readout with active cargo. See `flight-hold-readout/` and `adventure-signed-freight-startup-recapture/06-flight-start.png`. | Check the physical phone route. |
| Raider encounter | A real Rapier offset pass confirms the wider stationary rock gives a larger target. The headed run paid out from 37 to 96 u over 21 maneuvers without a lit release. The exact Auto also lost the rock as a default aim target until the next latch, since the held Raider restored before the mark. It now acquires the late marker for that same held life without overriding an explicit target. An aligned boosted pass with the real 220-ton Raider reached 47.74 u/s against the 55 u/s solid-impact floor. Two stock 32-ton comparisons reached speed more readily and never lit the aimed release. The validated ordinary withdrawal let the pilot release and fly clear, stood down the wing and returned to 47-A. | Close the authored throw with understandable inputs and a physical result. See `adventure-raid-wide-target/` and `raid-stock-corsair-worker-wide-pass.json`. |
| Mid-Raid Continue | The prior earned Auto serialized the attached Raider and wing while clearing their rail slot IDs. The old restore staged another Raider. The native replay with the adopted cast held the original Raider 676 immediately after Continue and reattached that hull after release. The restore reuses the attachment and rebuilds only a missing rock. Focused checks also preserve an unrelated captured or remote actor. See `adventure-raid-restored-cast/`. | Continue through the lesson after restoring the exact Auto. |
| Claimed salvage | Flying directly away used to leave the opening waiting for the two-minute timer. The guide identifies Helios's claim and tells the pilot how to take the load or leave. After four seconds to read the offer, outgoing flight past 480 u advances the lesson. A normal one-unit pickup reusing the same numeric slot once caused theft heat. The life check now keeps its pickup and retirement independent. Taking the original four units applies one theft consequence and leaving clears the pursuit. This also passed the focused Continue cases. | Exercise the choice in the rendered opening, then mine the assay. |
| Starter identities | The title and Load name match Hitch in the signed Continue. Ordinary native Swarm setup selected Hitch, Mule and Pelican. Each selection decoded distinct ship art, and their seven, eight and eight starting slots were empty. The mounted follow-up spells out equipment sizes and gives the slot list a darker backing. The real fit and purchase checks passed in that mounted route. See `swarm-hull-chooser-native-choices/` and `swarm-slot-language/ship-kit.png`. | Verify the new slot presentation through the next native armory entry. |
| Zero-credit fit | The mounted Expert Hornet route showed zero credits, no guns, and the free round-one loan. Borrow for round 1 installed an Autocannon S for zero and the normal left click fired it in the active worker. A separate launch without borrowing entered with the advertised empty slots and zero balance. | Check the same choice on the native screen and retain an explicit useful opening option as OVH-02 changes startup gear. |
| Equipment and launch | In native Electron, choosing Review Equipment made the seed-4242 Hornet's shop usable within 4.68 s. The shop showed 2,400 credits and accepted the 18-credit Autocannon S fit while the game clock stayed at zero. Launch reached a controllable Round 1 with the same fitted gun and 2,382 credits in 42.35 s. The worker fixture preserves the paid fit through Retry when room admission fails. See `swarm-early-armory-proof/`. | Trace the remaining Launch wait on the same native route. |
| Swarm floor purchases and rewards | The mounted worker shows the gun or empty slot affected before crossing a wall pad. A 500-credit cannon replaced the Pulse Laser S and put it in spares. The Crate discloses the random compatible gun and the same spare transfer. The sale price now updates on the same tag as the till. A real crossing charged 475, installed the seeded Mirrorjaw Pulse and named the replacement. With no compatible gun there is no charge or RNG draw. Ordinary enemies used to credit the player by touching the player's remote chip. They now leave it. Magnetic elites still steal it without payout. Physical pickup and floor spend publish the exact new balance with the receipt in the same worker reply. | Verify the labels and first earned spend in rendered play. |
| Bank and same-seed Retry | In a staged Round 10 combat clear using the actual owner, One Hull added 90 to the spendable purse and the run earned 353 from the clear. The old Bench counted the signing grant as earned money. The corrected Bench secured 176 and the mounted debrief and durable Hangar both showed the 264 final payout. Retry restored the original empty Hornet and 2,400-credit stake while retaining the 264 permanent result. | Run the full visible opening through the first Bank and Extract. |
| Cold Swarm pipeline timing | A pinned follow-up with timing only reached first flight in 47.19 s after Launch. Render pipelines occupied 46.67 s. The final seal, capture, submission and residency accounted for 0.44 s. Post-opening preparation consumed 15.87 s, of which reported color issue, driver drain and touch accounted for 5.11 s. See `swarm-early-armory-timed/`. | Isolate the remaining post-opening work before changing the schedule. Preserve film pacing and the exact first-picture gate. |
| Swarm opening and defeat | The one-enemy option now explains when the rest of Round 1 arrives and is unavailable for an earned later-round start. The worker check follows the real first kill into the normal round and a fresh Retry. A separate first-boss regression sent a real arena-impact defeat before the queued victory card mounted. Results now show the loss cause and offer same-seed Retry and Back to hangar. An earlier native combat defeat also returned a fresh ship and purse on Retry. | Check the one-enemy presentation in native flight and the first-boss result in the next relevant run. |
| Foundry rim defeat | An ordinary Round 3 native loss hit the rim at 140.81 u/s while the previous Wasp retained kill credit. The old debrief named the Wasp and showed its closing speed. The corrected result names the Foundry rim and the starboard impact, and leaves speed out when the committed collision has no speed field. Actual enemy weapon kills retain the attacker, gun and appropriate warning. The HUD and debrief agreement passed the focused checks. | Capture the approach to the rim and verify the first brake cue in flight. |
| Projectile propagation | With the real weapon and physics owners at seed 4242, a plain shot's impact borrowed Forked Core from another live shot by the same shooter. A recycled numeric slot also inherited the effect. Each impact used to emit three hit receipts. The owner now resolves the exact live projectile and both yield a single ordinary receipt. A real Forked Core hit retains its two children and their attack records retire on expiry. The retained Round 20 samples peaked at 10 and 22 real projectiles against the 420 limit. | Verify the correction in a rendered build that uses Forked Core. Sustained combat performance remains open. |
| Best Line practice | The page lost Practice before the worker started the run, and the results could write a Lifetime Best or promise the usual payout. The mounted route now follows a saved Best Line into Practice, scores a real worker defeat, repeats the setup through Retry, and then starts a regular run. Practice leaves ranked records, the ladder and Hangar unchanged. The existing Three.js ghost displayed both expected positions from the selected same-seed pose tape and cleared on the next regular run. | Verify the native Practice and ghost route. |
| Scheduled Swarm challenges | The mounted Daily menu and production worker now start at Round 1 even when an earned checkpoint was previously selected. The actual defeat files under the selected UTC date, Retry retains it across midnight, and a fresh Daily uses the new day. The Weekly worker now carries its selected mutator to first flight and Retry. Weapons Cold used to sell and fire a gun from the arena Crate. Its corrected route starts gunless, skips the Armory, preserves Taps, and removes gun sellers. The ordinary wall gun still charges and fits the original item. | Verify live Daily and Weekly and the remaining Best Line Ghost. |
| Gauntlet briefing and debrief | The production worker and mounted pages showed the actual opening wallet and kept the earned 50-credit end deposit as its own result after wave-two loss. Rearm equipped the chosen item and Retry restored the original prepared kit. Historical first-contact receipts still lack matching first draw for the same wreck or hostile. | Render the variants and verify first draw before real contact. |
| Camera during nearby kills | An ordinary NPC kill 40 u away added 0.5 camera trauma and its rupture added 0.133. Both now add zero while sending local fire and fracture. The actual Swarm boss defeat also used to set simulation speed to 0.35 for one simulation second. It now leaves simulation at 1× and gives one 50 ms chase hold, with at least 800 ms between holds. Ordinary kill chains keep body, audio and zoom cues without a chase hold. The owner fixture preserved Pause and Adventure's capital framing. | Review the in-flight combat camera through a real boss defeat and large chain. |
| NPC hull crossings and arrivals | Two stock Wasps on opposing tracked passes changed heading while keeping direct thrust and collided for 23 positive-impulse ticks in Rapier. Aligning force and heading let both pass without an impulse or disturbance to a nearby rock. Separately, an arriving Reaver reinforcement hit a rock at 49.42 u/s after its landing point had passed the old clearance check. The swept approach check found a clear seat on the same scheduled tick and retained the authored warning and arrival cues. An unblocked approach kept its original seat and timing. | Run the wider ambient contact census and check the reinforcement in the rendered opening. |
| Line with an older save | The actual worker latched a stationary 960-ton asteroid with F and held it past 12 s on the current repair. A saved 0.62 deployment-era factor still slowed the first authoritative reel tick. Clean and old saves now take the same first 0.1597 u reel step. Heavy-Duty Winch and the genuine limit under extreme load still pass. The current shared relation helper follows the revised rule of TOW through equal mass and ANCHOR at triple. | Exercise the anchor and relation readout in native flight. |
| Swarm world ownership | The cold Hornet/Ricochet Foundry worker admitted 19 campaign bodies and the menu warmed 35 campaign places. Arena-only admission preserved the paid fit and the room while removing campaign bodies and discovery. Adventure still materialized Helios Trade Hub. With strict source pins, the native candidate reached the same fitted active Round 1 with zero campaign bodies. Stock campaign scenery at the edges disappeared. All 17 live Rapier bodies and authored room mesh signatures matched retained stock evidence. Launch to first draw was 34.31 s on the candidate and 40.09 and 41.41 s in separate stock sessions at the same Intel device and settings. See `swarm-ovh04-candidate-native/`. | Measure already-warm crowded flight. The observed startup difference comes from separate sessions. |
| Cold Swarm launch after arena isolation | After excluding the unused campaign transit ring, the native first draw took 29.47 s. The next strict pin warms specimens for the authored ship boundaries used by the live batching controller. The timed specimen pass fell from 8.53 s to 0.70 s and the whole post-opening phase from 11.00 s to 2.96 s. Launch reached the first lit active draw in 22.57 s. The sealed admission, paid fit, balance and all 17 colliders and render signatures matched at the same Intel settings. | Trace the remaining cold first-picture cost and the next warm fight. Launch totals are from separate sessions, and the specimen change does not establish a sustained cadence gain. See `swarm-ovh04-ring-timing-native/` and `swarm-ovh04-ship-specimens-native/`. |
| Docking, warnings and phone controls | The Tethys Continue picture showed the Dock command crossing an open decision. The dock readout now moves aside for that panel. A later native Continue showed both readable together at Tethys. The mounted route verified the cue returns to center on close at 1280×720, 1100×700, 1000×540 and 390×844. Separate mounted checks kept WANTED clear of Field Build and opened the 44px touch entry. | Verify the phone on hardware. |
| Selected-object detail | At 1000×540 the desktop asteroid card began 43 px above the viewport. The HUD applied a phone-only clearance to the desktop radar. The compact desktop card is now fully visible below Field Build, and Detail opens by click or Enter without moving the radar. The mounted fixture also passed at 1180×650 and 1280×720. At 390×844 the phone radar still clears the simulated safe area and Field Build opens on tap. See `target-dock-bench/`. | Verify the crowded live flight and physical touch routes. |
| Circuit scoring | Textile Belt Time Trial finished 16 of 16 in 2:35.68 with zero Recover uses. Retry started a distinct attempt and Leave kept the clean best. Pack finished all 16 without Recover in 2:53.70 and placed second. A native Cup finished Textile, Tally, and Veil with no resets and kept a 5/18 Bronze on reload. The same Cup kept its first two scores when the Veil actor ran out of time and retried. The board puts the next heat above the results at 960×540 and keeps the interrupted heat's starter and difficulty on Retry. See `circuit-cup-veil-final/report.json`. | Verify Pack career persistence. |
| Pallas race records | Soft Berth earned and saved one 60-credit Bronze award in 76.25 s. The native Continue route tracked Counterweight Circuit from the chart, returned to the registrar, and opened Records and the course preview. The balance stayed at 1,700 credits. Records and previews now keep each authored line readable and the registrar uses plain progress wording. The mounted registrar passed at 960×540 and 390×844. | Run the next Counterweight event from the ordinary registrar. |
| Pallas Long Arm | A load touching the gate plane used to score before crossing. The authority check now requires a real crossing and accepts a valid pass with an intermediate sample on the plane. In native flight the registrar previously lost its active page to Workshop when changing courses. The updated route kept The Long Arm expanded while Workshop waited as a chip. Ordinary flight and F started the clock and reached Swing with the course load. Abandon cleared both bodies and the Line. Quick Save recorded the cancellation and preserved the 76.25 s Bronze and 1,700 credits. See `counterweight-public-long-arm-fixed/report.json`. | Finish a ranked run through the gate. |
| Sealed cargo at the market | At the mounted Market, a pilot with ten Fuel Cells aboard, eight sealed, could type nine in the focused quantity field while the quote offered a sale of two. The field, quote and Sell button now agree. The browser fixture sold two while keeping the eight sealed. The authority fixture also bought provisions and paid the original freight once for 760 at delivery. | Repeat during an ordinary dock-to-gate trip with the contract active. |
| Pallas decision copy | The native registrar frame showed an unrelated Choir offer displaying `spared_escape` in the player-facing record. The offer now describes the fee and the actual consequence in plain language. The save fixture reopens a legacy pending offer with readable wording, files the same displayed text and reads it back once. | Observe the corrected prompt in the next real Pallas session. |
| Live combat labels | The flight HUD uses Swarm, Gauntlet and Practice as set at launch. Ricochet Foundry and Tethys Exchange retain their setup names in the mounted HUD test. | Verify the names on the next native captures for the touched modes. |
| Crowded presentation | A long particle frame packed four intermediate transport buffers for one picture. It now takes the same physical steps and packs the final buffer once. The exact mesh queue workload kept the same admissions and order while cutting camera relevance calls from 284 to 35 and median scan workload from 59.4 to 47.4 ms across 500 passes. | Isolate the scene pass and worker cadence after controlled runs of the same opening workload. |

The first native round-20 follow-up on Intel D3D11 reported 11.65 successful world draws/s,
133.52 ms callback p95 and 0.842 sim/wall. The preceding native run reported 12.43 draws/s,
150 ms p95 and 0.923 sim/wall. Source changed during the follow-up capture and its workload began
on a separate launch. Use it to identify expensive work. The matching-frame GPU samples were
22.76 ms at p50 and 25.94 ms at p95, compared with 66.64 ms median gaps between their submissions.
The scene and composite used about 88% of timed GPU work. The worst measured moving mesh gap was
257.72 ms in the follow-up. The worker executed 630 of 732 owed ticks and dropped 87 at the debt
cap, with zero reply backpressure. Align step durations and heartbeat holds to determine the next
simulation cost. A later paired composite test compared 96 native timers and byte-identical pictures.
The ink shortcut showed no gain and was removed. Crowded cadence remains below the authored bar.

A real production-worker round-20 replay at seed 4242 reproduced a 25.3 ms step p95 and 86.6 ms
four-step workload p95 without a renderer. Physics accounted for 37% and TacticalAI for 22% of
measured step work. The RunState validator dropped from 7.05 to 4.86 µs in an interleaved workload
with identical worker replay results. Empty Nocturne shade regions now skip four unused vector
uniform uploads per illustrated draw, with byte-equivalent active regions. Using overlap-only Swarm
shop pads removed 1,472 native pose resyncs through 528 ticks. The purchase test still debits once
and installs the weapon. Body interactions at the pads change as intended, so replay trajectories
can diverge there. Tactical AI contact construction dropped from 2.562 to 2.036 µs in an interleaved
capture workload. The paired simulation outcomes matched through tick 528 for that contact change.

The native `whole-game-round20-draw-ownership-launch` run exercised the actual Round 20 launch.
Its contextual result was 8.36 world draws/s, 180.67 ms p95 submission gap, and 7.52 sim seconds
over 12.08 wall seconds. Two app sources changed during that capture. The GPU check also rejected
one zero-result timing query, and late draw attribution arrived after defeat. Use the pinned source
overlay and run draw accounting before footage decoding so the owner sample lands in active combat.

The pinned Intel D3D11 round 20 recorded 11.24 world draws/s, 148.57 ms p95 submission gap, and
10.23 sim seconds over 12.10 wall seconds. All 24 actual draw census frames stayed alive in round
20 and averaged 190.58 scene calls. The Hornet submitted 38, the two Wasp aft wrecks 24, and
payloads 16. The structural effects submitted 149,248 triangles per sampled frame, including
invisible slots. The new packed instance prefix preserves the ordered live transforms and radiance
while reducing submitted triangles 87.7% in a matched effects timeline. The same-lock native
`whole-game-round20-structural-ab-{stock,packed}` pair saw 12.38 to 15.19 world draws/s and
158.57 to 120.63 ms p95 submission gaps. The two source overlays differed only in the effects
file. Host busy fell from 61.08% to 42.00%, and the samples reached different simulation ticks.
The packed frames still saved at least 39.1% of structural triangles compared with submitting the
capacity of just their two active pools. Both GPU captures passed. The packed video decoded 61 of
62 selected frames, leaving continuous video content coverage open. Both arms recorded Auto
quality, the Low preset, a configured 30 fps cap and a 1832×973 drawing buffer. The probe now
records effective cap, adaptive resolution and raster relief at the timing boundaries.

The worker's activity classifier now samples collision lookahead once per pass. Its paired round-20
production replay kept the same 543 passes and state, while dropping those reads from 61,075 to
543. The aggregate four-change replay tallied 2,512 to zero fixed-pad resyncs and 93,309 to 755
collision lookahead reads. Individual-step p95 went from 72.30 to 43.98 ms. The modified pads
changed physical trajectories and load. Both arms missed the 16.67 ms budget, and the accepted
arm had more steps over 16.67 ms while reducing steps over 33.33 ms. Physics led average sample
cost at 9.46 ms per step. Tactical AI led the two largest attributed step spikes. The physics
retirement-scan prototype increased median and p95 sync time, so keep the existing scan.
A view synchronization change now validates the existing resolved pose row once for a moving
body. The stale-generation and culled-root checks pass. Its live frame-time effect is open.

The shared checkout has one registered Git worktree. The `.devshots` subdirectories contain
126.23 GiB of logical output, including 44.12 GiB in `.devshots/finish`. Some files already use
NTFS compression. The archived source baseline directory went from 7,860,529,311 to
6,877,075,615 stored bytes after compressing 24 large files in place. A checked archival manifest
kept the same SHA-256. The baseline writer and shared validation server now support `.json.gz`
and verify the same source identity. Eight older source overlays under `.devshots/finish` now
occupy 307,621,888 stored bytes, down from 948,297,182. An archive reopened at its original path
with the same SHA-256. Legacy validation copies and stale Git temporaries still need separate
storage work.
Six additional older native traces now occupy 839,012,352 stored bytes, down from 2,283,567,806.
Every trace kept its original path and SHA-256. The five checked PR-audit source overlays were
already compressed and took the same space. The storage receipt is
`historical-native-trace-compression.json`. The two former `SpaceFace-beta` and `SpaceFace-dossier`
sibling paths were absent on this check.
There is still one registered Git worktree.
Four Round 20 trace files were compressed in place. Their stored size fell by 250 MiB, and they
remain at their original paths.
The closed owner-timeline trace later reclaimed another 65,096,064 bytes at its original path.
Its SHA-256 remained identical. See `round20-owner-timeline-compression.json`.
Five more closed native traces reclaimed 1,275,391,792 bytes at their original paths with the same
SHA-256 for each file. See `closed-trace-compaction.json`.
The main-thread profiler now requests gzip from Chromium when writing a trace. Its analysis reads
compressed and older plain captures, and the campaign picks the file named by the capture's format.
A real 391-event Chromium trace shrank from 145,139 to 25,197 bytes. The saved gzip decoded to the
same events and Perfetto queried its original marker. See `profiler-trace-compression/report.json`.

The integrated development sources were pinned in `whole-game-integrated-2026-11-18.json.gz`.
The server validated strict runtime isolation, 3,779 files, and digest `e05537b0b6cb3686f5a5a3a90ff5590da68b4fed76dd62b52cda7b5abb3f9c9b`.
The compressed archive is 37,097,601 bytes. The subsequent `whole-game-round20-integrated/`
native capture ran the same Round 20 and seed for 11.98 s. It recorded 10.18 world draws/s,
138.98 ms p95 submission gap, and 0.722 sim/wall. The effective cap was 30 and both resolution
scales were 1 at the capture boundaries. Intel D3D11 used a 1466×779 render buffer with 69.99%
host busy. The actual scene averaged 15.99 ms GPU work and the composite 7.37 ms. All 627 GPU
queries passed. The source digest matched after the run. Host load, render buffer, and scene
contents differed from the 15.19 draws/s comparison, so this is an absolute diagnostic result.
Current combat remains below its target. Continue with scene and composite cost, the automatic
quality controller's measured response, and the worker's longest steps.

The native `whole-game-round20-auto-relief/` run pinned the integrated sources at
`b708d7c3344f6020beac4c06c2582024021f394a8b71769629238bc40e007e66`. Auto now learns only from
consecutive eligible flight presents. Its second step applies the same effective color options as
Video's Post Effects setting. At the beginning of Round 20 the renderer reported four bloom levels,
grade 0.60, vignette 0.08, and toe 0.0039. It ended on relief step two with one bloom level and all
three style amounts at zero. The 1466×779 buffer and 30 fps cap held. The run submitted 12.17 world
draws/s with a 140.23 ms p95 gap and 0.811 sim/wall. The scene and composite GPU averages were
13.55 and 5.46 ms, with all 752 queries valid. Host busy was 55.93%, and 23 source files differed
from the previous pin. These results establish that Auto applied the intended changes during real
combat. A matched improvement in frame pacing remains open.

The pinned `whole-game-round20-combat-current/` follow-up drew 9.34 world frames/s in a 12.10 s
sample. The p95 submission gap was 163.76 ms and simulation ran at 0.674 seconds per wall second.
The native 1466×779 buffer stayed at scale 1 and Auto again reached its second relief step.
Scene and composite averaged 17.42 and 7.37 ms of GPU work, with 599 of 599 queries valid.
Worker replies containing four steps took a 77.93 ms median. Host CPU busy was 73.25 percent.
Source matched before and after the run. This independently reproduces the performance miss.
It used a different host load and encounter timeline from the previous capture.

The source-identical native timing follow-up drew 17.23/s with 101.1 ms submission p95 and
54.4 percent host busy. In nine of its ten longest draw gaps, an advancing worker reply was
already applied 45–72 ms before the next draw. The 157 ms outlier included a 92 ms main-thread
timer with shader compilation and residency work. Nineteen issuers entered the link lane in the
same task after a short shader-readiness callback. Two worker replies had posted but waited
behind that main-thread work. Worker four-step replies took 65.02 ms at median, and Physics was
the largest sampled worker owner. This identifies work on both sides of the renderer boundary.
The host and profiling conditions differed. See `whole-game-round20-owner-timeline/owner-alignment.json`.

In the retained hold and warm Round 20 windows, all 197 callbacks with a newly visible worker
tick submitted that pose in the same callback. All 97 other draws changed the model using the
existing interpolation bracket. In the separate worst-gap alignment, main tasks occupied 980 ms
of 1,002 ms while reply application took 71 ms. The color capture's median preparation and
submission took 17.13 and 17.45 ms. These measurements leave active simulation and presentation
cost on the critical path. Dropping bracket draws would remove visible motion.

The compile issuer now gives the compositor a turn between queued roots once the foreground
budget is spent. Pending shader links can continue, and a visible mesh still waits for its
own shader readiness. Startup, urgent ordering and retired owners passed focused checks.
The strict native pair used the same assets, input, Intel D3D11 and 1466×779 buffer. The two
stable source pins differ only in the compile pacing and its renderer callback. Round 20 drew
16.82 to 21.02 world frames/s, with the submission gap at p95 falling from 105.97 to 82.22 ms.
Advancing world poses rose from 13.99 to 16.27/s, and simulation ran at 0.867 to 0.944 seconds per
wall second. This is one pair of native measurements. Dense combat still misses the target.
The trace shows the new post-present handoff running. The largest admission burst went from
32 starts in a 65.35 ms task to 14 in a 9.35 ms task. The longest gap in either arm still
included presentation or native drawing work. Host busy fell from 55.99 to 42.37 percent,
and the two flight windows covered different ticks and draw counts. These differences limit
attribution of the whole cadence gain. Both arms had changing pictures and kept the player
mesh present. Per-entity admission timing still needs its own observation.
See `whole-game-round20-compile-pacing-strict-baselin/` and
`whole-game-round20-compile-pacing-strict-candida/` in `.devshots/main-thread-profile/`.

The native color-pass attribution run submitted 12.66 world frames/s, with a 117.68 ms
p95 gap and 0.718 simulation seconds per wall second. Ninety uninstrumented control frames
showed 17.13 ms median preparation and 17.45 ms median CPU color submission. Nineteen
matched scene GPU queries had an 11.63 ms median. CPU and GPU intervals can overlap.
Color sampled 847 ms in program setup, including 396 ms in uniform upload. No one model
dominated that work. The four largest captured callback gaps each advanced the worker pose.
The worker’s median reply work was 75.38 ms and median apply work was 3.16 ms.
See `whole-game-round20-color-boundary/` in `.devshots/main-thread-profile/`.

A later pinned Round 20 baseline measured 15.85 world submissions/s and 104.42 ms submission
p95 at a 1462×873 buffer. It drew no cargo capsules in 24 successful color frames, so the
capsule batching experiment has no matched native timing result. The focused case reduced
four identical capsule shells from sixteen to four submissions. The experimental pins remain
available and the change was removed from active source.

Two long worker replies took 80.58 and 41.07 ms. Tracing their tasks found synchronous death
handling after the arena crusher. Live Swarm-owned deaths now stop before the Adventure
Loss Ledger. A native owner replay also found a live attacker sending Adventure rescue chatter.
That owner now limits ambient hails to Adventure. Focused checks preserve historical and ambient
losses, Adventure deaths, run rewards, real rescue events and the Maw wreck. Measure the next
native worker tail separately.

The November 18 fleet gate stopped at the asset check before Swarm boot. The first attempt had 467
tracked asset edits and a Kestrel HTTP manifest mismatch. The follow-up found 477 tracked asset
edits. Embedding the full runtime source closure and the changed assets exceeded the overlay
size limit. The committed-art overlay `swarm-gate-head-assets-301d3fb.json.gz` pins those 477
asset paths and two runtime catalogs to Git. The unchanged preflight checked 8,849 assets and
verified all 479 overrides over HTTP. This exercises current gameplay code with committed art
and matching catalogs. Current working-tree art still has separate integration work.
The direct Swarm check with that overlay reached the menu, empty Hornet, three installed items and
11 seconds of Round 1 simulation through public controls. The launch route passed. The overall
SwiftShader verdict failed the transparent-layer coverage estimate for threats, scoring 50% at
p95 against a 30% limit. Peak screen coverage was 2%. Its two named layers were the Massline
latch rim and pilot. The estimate uses a bounding grid, and actual pixel occlusion needs to be
joined to the captured pictures. Hardware cadence and round completion were ungraded in this check.
See `.devshots/fleet/gate-swarm-head-assets-301d3fb/verdict.md`.

The exact failing sample was frame 1104 at sim 12.4, with one of two projected threat boxes
overlapping the effect estimate. The previously reported peak screen sample had zero threat hits.
The report now points to the failed sample and keeps the verdict and threshold unchanged. The
nearest actual picture predates that sample. Diagnostic attribution redraws now require the
existing `--vfx-attribution` option. The scoring passes and captured result are unchanged.

A later native Round 20 kept the same launch, pilot, and video settings across two six-sim-second
windows. It drew 12.81 world frames/s during the initial residency hold and 20.36 after it, with
113.59 and 67.12 ms p95 draw gaps. Simulation pace was .620 and .735 sim seconds per wall second.
New authoritative poses arrived in 10.53 and 11.27 successful world submissions/s. The latter
window had more hostiles and fewer expensive draws in the tail. The cause of the gain remains
open, and sustained cadence in both intervals falls short. A controlled three-step worker
candidate published more often but ran the same ticks 2.44% slower and shed 11 more.
The four-step policy remains. See `whole-game-round20-residency-phases/residency-phases.json`.

The pinned native `swarm-first-three-current/` run bought an Autocannon S for 18 credits and
cleared all ten Round 1 enemies. It reached eleven of twelve in Round 2 before the defeat screen.
Successful world draws averaged 18.22/s and 23.07/s with callback p95 of 116.60 and 66.68 ms
respectively. Simulation ran at 0.981 and 0.990 seconds per wall second. The run confirms the
Round 2 route and its result. Round 3 and the combat frame-time target remain open.

The native Wasp run fitted a Concussion Cannon S for 18 credits and died in Round 1 after
9.33 simulation seconds. The original results included a 182-point hit with no named source.
The pinned replay recorded 181.714 applied at 5.60 s from the bounding proxy of Foundry plate 1,
before the first captured native player contact. A second proxy slam from rim 12 killed the
Wasp at 6.32 s. The results now keep the known impact source for the hardest hit and show the
arena's setup name. Native slams now require a current Rapier contact with the authored solid.
In the exact one-file replay, the Wasp stayed active to 20.58 s, resolved four threats, and
took two rim slams with matching contact receipts. The earlier run died at 6.58 s. The pilot's
path varied. The one-file Hornet replay cleared Round 1 and resolved eleven of twelve in
Round 2 before dying at 44.92 s. A separate Hornet pilot spent 28 credits on Shield Capacitor M
at the first rearm, kept Autocannon S, and raised shield capacity from 240 to 420. The first
Round 2 plate hit consumed 114 shield and zero hull. The pilot cleared Round 2 and reached
three of fourteen resolved in Round 3. A real rim impact ended the run at 71.15 simulation
seconds. See `swarm-hornet-defense-round-two/receipt.json`.

The same source pin includes lower CPU cost for the material effects in crowded combat. In a
replay of 122 captured Round 20 frame intervals with modeled effect inputs, parcel state,
positions and opacity were identical. The median of ten paired total update timings was
163.37 → 124.23 ms, saving about 0.32 ms per interval in that replay. The native scene's
overall draw cadence is measured separately.

The Swarm Armory follows each purchase by equipment instance. The native Kestrel run started with
empty slots and 2,400 credits, bought an Autocannon S and then a Concussion Cannon S for 18 each.
The quote named slot 1 and explained where the old gun would go. The Autocannon displayed
In spares. Rearrange loadout restored the exact original gun at 2,364 credits, put the replacement
in spares, and launched with the original fitted. See `swarm-gun-replacement-native/route-log.json`.

The new launch receipt measures the first enabled title action separately from screenshot time.
The Continue run's main startup journal began at 2.62 s after navigation. It reported the menu
handoff at 6.35 s, overlay retirement at 8.81 s, and actionable New Game at 18.60 s. The latter
interval includes the cinematic and the replay's response to First light. Instrument the menu
event, the next paint and the existing overlay retirement receipt to locate their 2.46 s interval.

The `adventure-boot-film-witness/` capture records actual media playback separately for
the two films. The loading film began at 2.97 s and had one 116 ms wait after playback started.
The title film waited from 14.96 s until dismissal at 18.37 s, with no decoded frames or skip
input. A 1.76 s deferred rendering callback began at 15.17 s, followed by another long frame
with presentation and asset loading work. After holding deferred graphics work until the title
film released the picture, `adventure-boot-film-paced/` recorded 2.21 s of title playback,
34 delivered and 22 dropped frames. The bake was absent in that window. The title was actionable
at 26.85 s with the actual First light interaction, and Continue restored the paid freight.
A 1.37 s presentation callback still interrupted playback. The presentation owner leaves
the world and VFX idle while the opaque title film is active, keeps UI frames running, and restores
world rendering at dismissal for the fade. The fixture observed the handoff. The real
`adventure-boot-film-render-hold/` run reached the actionable title in 19.51 s and restored the
paid Quick Save. The large hidden presentation callback no longer appears during the film. Its
replacement sample still dropped 24 of 48 title frames. The 1.44 s animation frame at 14.38 s
includes a 653 ms initialization of the title's optional second WebGL renderer. The optional layer
now waits for a delivered movie frame and parallel shader link readiness. In the next headed
1280×720 replay, `adventure-boot-film-parallel-remix/`, the film delivered 43 of 63 frames rather
than 24 of 48, the remix stall was absent, and the menu was actionable at 19.51 s. The original
films both remain. The replay did not identify whether the optional layer activated. A 1.35 s frame
remains before first title playback in background asset work and shader readiness.

A startup CPU profile on the earned Continue route located a 1.45 s frame at 11.45 s.
Its asset-loader callback spent 1.01 s starting the Basis WebAssembly fetch. KTX2 acquisition
now sets format capabilities and waits for an actual texture request to start the transcoder.
The focused check exercises two concurrent requests sharing the same fetch and renderer
retirement followed by reacquisition. The next native profile sampled 1.6 ms in the Basis fetch
at actual demand and a separate 2.40 s WebGL extension query before playback. Its title was
actionable in 20.63 s. The earned Continue restored the exact freight payment and hold.

A matched startup experiment deferred extension-object requests until a KTX2 texture required
one. The sampled driver work fell and the named title wait moved from 3.985 to 2.190 s.
Actionable title moved from 20.119 to 23.796 s and first drawn flight from 42.259 to 45.451 s.
Both arms restored the exact latest paid Quick Save. The original loader was restored after the
experiment and the two films remain. See `ktx2-title-extension-discovery/native-pair.json`.

A recurring optional lighting bake left the pre-title profile after its work moved to the first
stage that needs the map. The authored title uses its own lighting. Title attract, Replay Theater
and flight loading retain their environment paths. The post-fix native title was actionable at
18.20 s, with no pre-title bake. The WebGL extension stall also did not recur in that sample.
The loading film delivered 211 frames. The separate title film reached its fallback at zero
decoded frames. The next capture followed Continue through a real world draw to the Tethys HUD.
Its D3D11 title decoder played 2.285 s and counted 59 frames. Both movies had requested byte
ranges from the shared server and received full responses.

The server now streams video ranges. The next headed capture received 206 responses for both
actual browser requests, and Chromium reported byte-range support. The loading film played
9.24 s. The title film waited 4.29 s and played 0.29 s before the fallback. The title took
18.39 s to become actionable. Continue again restored visible Tethys flight and the exact save.
See `adventure-boot-media-ranges/demo-route.json`. The early title fallback remains open.

The title now gives one 1.5 s window to a first frame arriving just before fallback. The earlier
deadline still covers early playback and no-frame startup. The focused test reproduced the 4.29 s
start and verified skip and cleanup. A native check took the normal branch with a first frame
at 2.41 s after the splash and 1.88 s of playback. Both movies retained range support, and Continue
reached Tethys flight. The title's late branch still needs a live observation. The first visible
Tethys frame reported no environment map in this run. The shared loading cover had blocked the
required world bake while Continue waited on the first scene. Required world loading now binds
the same map to the scene and the renderer before reveal, while the initial films keep their
admission fence. The native `adventure-boot-world-light/` replay showed the map in visible
Tethys flight at 18 fresh world draws and restored the paid save. Focused checks also covered
the pending bake when the graphics context is unavailable.

An unpacked Windows release candidate at `.devshots/demo-performance-continuation/` reached first
flight from both Adventure New Game and Swarm Round 1 using the same ASAR (`58592532190e…`). Both
routes showed their normal controls, activated the simulation worker, took a real forward input and
closed cleanly. The main process reached the actionable title in 23.61 s and 20.75 s respectively.
The Swarm sample submitted 17.14 world draws/s over 18.21 s. This package predates the title hold
and Auto correction. A separate isolated reload of that ASAR staged the earned Quick Save and
used the actual title Continue. F5 wrote a new save of the restored Tethys run with its one paid
freight receipt, balance and cleared cargo. See `packaged-earned-continue/startup.json`.

The later unpacked candidate in `.devshots/demo-performance-retest/` passed both fresh routes on
ASAR `161063895eda…`. It submitted 26.93 world draws/s in Adventure and 23.24/s in Swarm Round 1,
with simulation close to real time during each sample. Title times were 13.72 s and 21.27 s.
The maintained packaged startup command now selects Swarm directly. Its own replay of this ASAR
recorded the live Swarm HUD, worker lane, forward input, zero hard errors, and clean exit.
These runs sample first flight on that package. Sustained combat and the updater remain open.

Evidence is under `.devshots/fleet/coordination/whole-game/`. The opening receipts are in
`adventure-raid-recovery/`, `adventure-sample-berth/` and `adventure-law-freight/`.
The later Continue receipts are in `adventure-lost-sample-resume/`, `adventure-beam-target/` and
`adventure-clear-mine-view/`. The repaired camera, earned assay, and first freight acceptance are in
`adventure-framed-paid-delivery/`. HUD fixtures are in `wanted-alert-bench/` and `target-dock-bench/`.
The story owner also keeps pending Adventure retry, ending and New Game Plus messages queued
until delivery. Focused checks verify that saving and continuing while a notice is held delivers
it once and expires it when its beat has advanced. Slate now marks its exterior loading receiver
once the pilot personally tethers the correct core. Release brings the core marker back. The
headless B0–B7 walk used the real Slate and Maw hand-in owners and reached the later retry. Later
native campaign checks remain open.
Performance evidence is under `.devshots/main-thread-profile/whole-game-round20-followup/` and
`whole-game-round20-ink-ab/`.

| Player outcome | Current result | Next check |
|---|---|---|
| Fresh retail web launch | Integrated package `87161647fe5e16dacbf3cd60546e719b1fca84cee63ecee1bd7fba4bb741eef0` (3,021 files) passed ordinary Adventure New Game and Swarm Hornet → Ship Equipment → round 1. W moved displayed speed from 24 to 56 WU/s in Adventure and 0 to 41 in Swarm. Both modes captured changing gameplay pictures. First playable paint took 54.986 s and 84.824 s respectively under SwiftShader. The package contains the five combat atlases that returned 404 in the first run. | Measure boot and launch separately on the native package and investigate the delayed flight transition. Verify quit, Continue and updater on Electron. |
| Swarm fitting recovery | Native Hornet bought Autocannon S for 18 credits. Rearrange moved it from hardpoint 1 to spares and back through the visible Strip and Fit actions. The balance stayed at 2,382 credits after the purchase. The actual fit and round 1 launch agreed with the visible notices. | Replace the fitted gun with a different item and verify the former gun is recoverable. |
| Adventure learner and approach | The attached learner rock fractured when it hit the player at 122.73 WU/s. The material owner now protects it until the first throw. A same-seed replay kept the same rock through 150.47 WU/s impacts. The following native run latched rock 610 with F, aimed at wreck 611, threw with RMB at 4.4 s of simulation, and advanced to the Raider. The Raider was also thrown. After the next latch attached a different body, the old objective gave no recovery instruction. The Raid tracker now prompts the player to release that line and latch the Raider. | Verify the Raid recovery prompt in flight, a qualifying raid impact and the first berth. The opening renderer admits visible collidable fallbacks. Compare each first successful draw with actual contact for the same object and generation. |
| Adventure cargo and station recovery | A pending station refuel charged 480 credits, then incorrectly refunded the outgoing hull into an older save's balance. The station owner now drops the outgoing service on a successful restore and retains it on rollback. The combined owner test preserved eight sealed freight items and one 760-credit payment, and retained the refuel on failed restore. | Run the station visit, freight outcome and Continue in the rendered game. |
| Dione Lane Target Practice | The public gate charged 186 credits. The pilot reached Dione Exchange and accepted Target Practice from Jobs. The chart's search keeps its result list after using shortcuts, and tracking the range preserves the active mission. The native HUD showed the green countdown, then red Hold Fire with one point and zero fouls. One Pulse Laser hit earned SURESHOT and paid 280 credits once. The range marker cleared, and Quick Save recorded the callsign, receipt and 2,411 credits. The focused owner tests also cover a five-point drone collision and manual courses through settlement. See `dione-practice-public-scored-berth/report.json`. | Verify the next Dione commission. |
| Asteroid Works | The earned Dione save reached an asteroid through the Local chart and actual F and B inputs. The operation guide now waits for working equipment. Once ready, S cut the first cell and Survey reported six contacts. Leaving awarded two Iron Ore. Re-entry preserved all three cuts and returned the rover to depth three without another award. Quick Save succeeded. See `asteroid-works-dione-ready/report.json`. | Verify dry equipment and hazardous excavation through the same operations. |
| Market and sealed freight | The earned Tethys arrival paid 194 credits into Ceres and berthed at Ceres Refinery. Sell now shows the held six sealed Composite Alloys even though the local market cannot quote them. Both this lot and the eight Fuel Cells showed zero sellable. A real sale of the last free Iron Ore paid 16 credits once, leaving 4,326 credits and both contracts intact. The screen reported the sold lot had left the board. See `ceres-market-sealed-cargo-closed/report.json`. | Check fabrication and an owned convoy sale through their public entries. |
| Ceres refining | The native replay showed Titanium Ore as unlisted at the refinery and removed its invalid local Market action. The Iron Ore action opened the selected 17-credit Buy quote. One held Refine committed two free Iron Ore into one Refined Metals, retaining both sealed lots and the tracked freight. An earlier dock receipt never reached the station screen. It resolved on the diagnostic rerun with no page errors. See `ceres-industry-dock-diagnostic/report.json`. | Capture the station transition if the dock handoff fails again. |
| Player Trade Relay | Dispatch previously changed a read-only mirror while the worker kept the original schedule. The button now sends the owner's command and describes the 20-u single-commodity load and free cargo. The worker sent one 60-u convoy from Rookery to Ceres, added 60 to station stock, paid once at the existing terms and left eight sealed units aboard the player. | Exercise dispatch and settlement from the rendered Base and station route. |
| Scale 4 after delivery | Before the fix, Continue measured the crate with the pilot 1,379 u away. On the earned Quick the step stayed pending on approach. At 82.64 u the desk measured 18.8 against the 20.0 stamp, preserved 5,864 credits and the hold, and posted Furnace Detail. The owner receipt and board visit recorded the result despite the driver's early mirror comparison. Focused checks retain the desk crate for a 60 s delay and hand the story marker to the actual posted job without replacing a manual detour. | Verify the delayed arrival and next chart marker in the rendered route. |
| Pause and worker clock | A time-scale command could advance an active UI pause. The worker now routes that request through the time-effects owner. The real command and pause check passed. | Keep the live Pause, Resume and minimize route in the shared stability run. |
| Combat pressure and late-round rewards | Nestbreaker split produced 421 live shots with a 420 reservation. Both missiles now spawn within the cap. A recycled shot ID can no longer inherit a prism family's spent rays, and normal hits no longer create family records. In Asteroid Mill, the nine-credit bonus follows the original ore pickup and is consumed once. | Profile the round-20 workload and take the late-arena reward through the real round transition. |
| Swarm earned rewards | An immediate defeat could bank 1,200 of the 2,400 starting credits. The wallet now keeps the starting budget spendable while limiting settlement to earned credits. The real settlement owner checks cover an unplayed defeat, resale, mixed-credit refunds, partial deposit and Retire, and a distinct same-seed retry ending on the same tick. The deposit becomes durable on terminal settlement. | Witness an earned deposit and return on the rendered route. |
| Iron Maw recovery | The bow ring shares the mouth used by aiming and physical intake. Focused Rapier checks verified one credit for a consumed Detonator and found a legal approach seat for the reserved Dart. In a second layout the Dart was obstructed or dead. The readout now gives the hull-attack fallback and changes to the latch or throw instruction for an actionable Dart. The native seed-73311 checkpoint showed five openings and clear ring draws with the fallback. `COLLATERAL` yielded in all 140 joined draws. It also showed a Detonator marked READY but attached the boss after F. No Dart reached the mouth. Two Adventure throw files changed during this checkpoint. The boss and presentation files stayed fixed. See `iron-maw-round5-native-honest/`. | Fix the acquisition handoff and verify the full live counter. |
| F target and latest Maw attempt | A real DOM-to-worker fixture reproduced F selecting a different body after a camera update. The press now carries the Ready mark's life identity. Valid endpoints attach and a recycled ID is refused. The round's reserve now arrives separately. The worker tape acquired it and held its armed charge into the opening. A spent charge uses the hull instruction and ordinary ejection without a second blast. In the pinned native attempt enemy blasts destroyed the reserve before a Ready opportunity. Another Dart produced a latch cue. One of 123 visible ring draws had a covering banner. See `iron-maw-round5-native-free-gate/receipt.json`. | Observe the exact displayed Ready target attach and a physical Dart counter in Electron. |
| Round 26 Warden cover | The two authored Wardens now choose each other. The production combat router transfers up to 40% of a hit when the partner is on the shot line and has link energy. The test verifies both shot directions, separation, exhausted links, and a recycled slot. | See both links and their recovery windows at the normal gameplay camera. This change followed the integrated web bundle above. |
| Outpost sales and yard refunds | Owner checks cover a normal fleet order, acquisition before production, stock and payment agreement, Continue, duplicate-payment prevention, the next sale after restore, and yard refunds for undelivered work. | Exercise the rendered operations and Continue. |
| Sustained simulation cost | A matched worker benchmark measured plant dispatch at 279.19 → 250.20 ms in Swarm and 343.10 → 322.08 ms in Adventure over 480 timed calls per arm. The current native round-20 stress checkpoint submitted 12.43 world frames/s, with 150 ms callback gap at p95, 0.923 sim/wall, and 1.6% sampled main-thread idle. The GPU timer sample was invalid on a zero result. | Isolate the largest main-thread and render-pass costs through matched workload experiments. Crowded Helios and the authored 60 fps bar remain open. |
| Desktop HUD and Field Build | The desktop red alert is constrained to the lane between the objective card and camera controls. Field Build now describes moving goods between sites and uses the shared count formatting. | Verify the WANTED alert on the gameplay camera and follow Field Build through a real transfer. |

The focused release, worker, fracture, aim, station and combat checks passed. The fast suite passed
40 checks. The original 47-A replay matched 20 runs. V3's append-only v27 reference records the
approved 2× boost and tender-haul reputation field; the earlier reference is preserved. The
registered V3 checks passed 20 repeats and a continuous-versus-reloaded comparison with zero
differences. The integrated package evidence is under `.devshots/retail-boot/whole-game-integrated-adventure/`
and `.devshots/retail-boot/whole-game-integrated-swarm/`. Other evidence is under
`.devshots/main-thread-profile/whole-game-round20-current/`, and `.devshots/fleet/coordination/`.
The latter holds the Adventure replays, `whole-game/swarm-loadout-recovery/`,
`domain-signature-key-cache/plant-dispatch-interleaved.txt` and `v3-native-contact-v27-staged/`.

The same-seed round-20 experiment at `.devshots/main-thread-profile/whole-game-round20-attribution/`
bracketed each render experiment with the default raster and effects. The first default arm drew
13.42/s. Later default arms drew 27–30/s as the encounter evolved, while the lower-resolution
arm drew 19.02/s and the no-post arm 16.66/s. Keep the authored preset. Separate opening work
from settled play before attributing the stall to a render pass.

The current cold native Adventure trace reached flight 12.8 s after Launch. Render-pipeline
preparation occupied 7.13 s and authored visuals 3.44 s. The loading movie reported played frames
through those phases, alongside seven dropped frames in render preparation and one in authored
visuals. Main-thread animation still had a 200 ms gap during render preparation. The corrected
profile follows the title's New Game action through the shared route. See
`.devshots/main-thread-profile/whole-game-adventure-cold-phases-corrected/`.
The follow-up scroll-cue scheduler coalesces redundant deferred measurements in a frame. The
24-sync fixture reduced paints and geometry reads from 48 to 25 while preserving immediate
scroll updates and the same final thumb and MORE cue. A startup timing change is still open.

The repeated-wave owner reproduction retained 111 ordinary wrecks with a keep count of 40 when
the pilot remained in the neighborhood. The same five-wave case now retains 40. Authored cover,
the Maw offcut, the active Line and carried throws still survive. The renderer keeps the old
onscreen mesh with its geometry and texture for a brief silhouette collapse after collision and
interaction end. The lifecycle check verifies ID reuse and release of the retained texture.
Check the retirement across a visible native wave boundary. The original reproduction is at
`.devshots/fleet/coordination/swarm-wreck-boundary-repro.test.mjs`.

The integrated dev gate passed import resolution and Adventure boot. Swarm's preflight rejected
467 local asset differences against HEAD before its browser started. The same built web artifact
passed both ordinary doors independently. In the world checks the convoy fixture now identifies
the forced shipment separately from an independent arriving hauler. The ignored distress check
ties the silent ledger receipt and absence of a follow-up message to that one call.
The complete living-universe check passed all 19 sections.

The staged asteroid diagnostic recorded real impacts but found no matching draw for the struck
rock. The no-relocation opening diagnostic recorded a draw of the learner rock but no matching
contact. Keep first-contact visibility open. Both receipts are under `.devshots/asteroid-appear/`.

Crowded cadence, the complete paid Adventure route, late Swarm progression and its live rewards,
the other public modes, device inputs, and the authored play-through bar remain open. The package
check establishes the fresh web startup, flight picture and response on its recorded build.

## Whole-game playability recovery — November 17, 2026

The owner's Swarm run exposed a broken first session from boot through death. Existing locked
measurements below establish that slow presentation and simulation also affect Adventure and
Circuits. The [whole-game review](https://github.com/coldshalamov/SpaceFace/pull/1117) supplies
source findings beyond the opening. Use those findings and the current QUAL routes to drive
repairs across systems. Each pass follows a player from intent through result and recovery.

| Order | Player task | Repair and completion condition |
|---|---|---|
| 1 | Launch, choose a mode, and fly with familiar controls | Restore Shift boost and F tether across modes and profiles. Keep existing remaps and make prompts use the resolved bindings. Reconcile [draft #1118](https://github.com/coldshalamov/SpaceFace/pull/1118) with the live input and HUD owners so a player can steer while switching the cone on or off. Check boot-to-interactive time and the loading movie separately. Use the desktop launch and packaged retry route in QUAL-01. |
| 2 | Choose a Swarm ship, buy gear, fly round one, and retry | Enter ship and gear setup from the title. Show the actual hull, fitted gear, available slots, and round before launch. Selecting a card previews it without spending. An explicit install shows cost, replacement, and what can be removed. Confirm that a player can launch with zero purchases, identify threats before contact, and see why the run ended and how to retry. Follow QUAL-04 and QUAL-05 for combat and retry. |
| 3 | Fly and fight through busy scenes | Use the existing locked runtime captures to isolate shared CPU/GPU cost. In the same run, align input and contacts with the rendered ship, obstacle first visibility, projectile counts, and frame gaps. Prioritize the work that makes the scene unreadable or the ship unresponsive. Recheck quiet flight and crowded combat in Swarm, Adventure, Gauntlet, and Circuits through QUAL-03/05/06/07. |
| 4 | Learn, travel, take work, and return in Adventure | Teach what the action actually does and use an observed outcome to complete the lesson. Follow a normal job from offer through navigation, first dock, cargo or mining work, payment, save, and Continue. Extend to markets, ship fitting, industry, bases, crew, law, and later story jobs using the review's task matrix. Exercise full holds, denied actions, death, and recovery as part of the same routes. Follow QUAL-02 and QUAL-09. |
| 5 | Return on another input device or after an update | Complete a scored Circuit, retry Gauntlet, and check the same basic actions with controller and touch. Recheck visible controls, saves and recovery across supported devices and packaged updates. Follow QUAL-01/05/06/08 and the authored acceptance card. |

Preserve successful steps when touching a route again. A control change must keep familiar defaults
or preserve the player's saved choice. A loading change must improve the wait and preserve first-flight
readability. A UI change must preserve reachable actions, existing art that serves the decision, and
the ordinary route. Focused checks protect the specific behavior. Close the player task after it works
in the ordinary build and can be understood, performed, and recovered without developer help.

### Integrated work in the shared checkout

- Shift boost and F tether were restored, with saved remaps preserved. Rig toggles on press and
  reports the active cone or scoop in the HUD. Shove acts on press. Focused tests verify the live
  field owner while steering, release, remapping, controller, and buffered touch.
- Desktop title uses the earlier Orrery dial and live ship composition. The loading film uses the
  original ring treatment. The cold native run decoded ten more frames across a 0.4-second sample.
  Full startup cadence still needs measurement.
- Swarm prepares a single selected hull without Adventure starter gear. The bench exercised hull
  selection, free inspection, and an explicit installation that spent 18 credits and fitted the
  selected gun. It checked the launch summary at small desktop and phone sizes. The actual worker
  verified the bare opening hull and authorized fitting. The optional Circuit start sits beside
  Round briefing. Required Circuit decisions remain visible above the catalog.
- Native Swarm r4 showed the loading film at 97.7% over an already mounted equipment screen.
  The veil now yields to that paused preparation screen, and r5 reached it with the veil hidden
  and received equipment clicks. The native r6 purchase fitted Autocannon S in slot one and
  spent 18 of 2,400 credits. The worker now sends the current player weapons to the HUD when
  fittings change. Arena impact retains its damage source through the death dial and run results.
- Adventure points to the learner rock, then the wreck while tethered. A broken line restores the
  learner rock. Cold Start stays tracked. A normal browser session latched the rock with F and
  threw it. The raider objective followed. The capture also confirmed that the
  held-rock throw cue can stand on its own, with one instruction in the tracker.
  The first paid Helios delivery now names its accepted
  berth at Tethys Trade Hub. The owner checks keep the sealed load intact at Ceres and pay 760
  credits at Tethys. Continue preserves the active delivery waypoint and the sealed manifest.
  The station's Buy & Fit confirmation also rechecks the actual slot before spending. Gameplay-camera
  visibility beyond the first throw and the full live station/delivery route remain open.
- Circuits Retry preserves the completed Time Trial after the board has been switched to Pack.
  The ordinary scored finish after an F8 reset is open.

The source-stable Electron r7 run entered from the restored title, bought and fitted Autocannon S,
then reached round-one cleanup with ten threats resolved. Over the 9 seconds of measured combat
there were 20.11 successful world submissions and 18.56 fresh poses per second, with 100 ms
callback gaps at p95. Simulation kept up with elapsed time. This remains far from the visual
cadence target. The capture and main/worker profile are in
`.devshots/fleet/coordination/playability-hull-first/first-fight-r7/`. The main profile includes a
2.16-second sampling gap. Outside that gap, drawing, frame preparation and HUD geometry reads
were substantial. Real layout changes invalidate the existing HUD cache.

The stopped-ship scale experiment used the public round-one launch and three six-second windows
in the same flight. At 75% internal resolution it submitted 24.43 frames per second with a 50 ms
p95 callback gap. Its neighboring standard-scale windows submitted 16.50 and 20.83 frames per
second. This identifies render resolution as a useful investigation seam. The world evolved
between windows and the comparison did not measure visibility or feel during combat. See
`.devshots/main-thread-profile/first-hour-foundry-scale-public/report.md`.

At held thrust, a separate within-flight comparison submitted 10.13 world frames per second at full
resolution, 13.82 at 80%, then 24.12 after returning to full resolution. The later full-resolution
window had the smallest callback gaps. Keep the configured resolution. The next useful comparison
is opening versus settled flight at the same resolution, with entity admission and scene-pass work
aligned to the frame gaps. See `.devshots/main-thread-profile/first-hour-foundry-moving-raster/`.

The next source-stable native Swarm run paid for its first fitting, cleared round one, used the
ordinary between-round action, and entered round two. The samples submitted 10.80 and 12.33
world frames per second at 150 and 117 ms p95 callback gaps. Simulation advanced at 0.80 and
0.74 times wall speed. The capture ended during round two and is a separate current-build
observation. See `.devshots/fleet/coordination/playability-hull-first/through-round-two/`.

A later native round-one sample submitted 14.21 world frames per second with 150 ms p95 callback
gaps. The HUD now searches its mounted overlays for obstacles to world labels. The old document-wide
lookup was absent from the current profile. HDR world submission remains the largest sampled render
cost. The profiles came from separate runs and do not establish a cadence gain. See
`.devshots/fleet/coordination/playability-hull-first/real-loss-and-retry/`.

Foundry opening placement checks the pilot's swept hull. A collidable rock can still wait for its
visible model or fallback to finish admission. The relevant follow-up is to join the pilot's first
contact with the first successful draw for the rock's ID and occupant generation. Current frustum
samples and shared instanced-mesh draw markers leave that ordering unresolved.

The debrief's Hangar action previously replaced the only open screen while the session stayed in
dead flight. Back from that new screen then exposed the dead ship. The shared debrief exit now
ends the session and builds the title beneath the hangar. A mounted regression starts from a
fatal hit and verifies the inactive run and reachable title afterward. A locked Electron run
retired through Pause, opened the debrief and hangar, and used the accessible Back action to return
to the active title. See `.devshots/fleet/coordination/playability-hull-first/retire-debrief-return-r2/`.
Retry could submit two new games in quick succession. The mounted defeat test now checks that the
same hull, arena, seed and difficulty start once, with a fresh budget for fitting the ship again.
The native pilot then closed with visible opponents without firing and reached an ordinary combat
death. Retry restored the Hornet, arena and seed, with 2,400 credits and empty fittings. Installing
the same 18-credit gun through Equipment and launching again reached active round one. Holding W
moved the new ship forward while world submissions advanced. See
`.devshots/fleet/coordination/playability-hull-first/real-loss-and-retry-approach/`.

The next Adventure route latched and threw the actual Raider. It later lost the line and kept
showing the once-only instruction to build speed and let go. The waypoint now follows the live
rope, marking the throw rock during the tow and the Raider when the line is gone. The first run
did not establish the qualifying collision or reach the berth. Several scripted attempts had
the target rock outside the viewport.

The next short route used the live player tether instead of inferring attachment from all ships'
events. On seed 4151827082 it latched the learner rock, lost it, and later attached other bodies.
The lesson now tells the player to release the current line before asking for a latch on the marked
rock in that state. The focused continuation check covers that change. The live run stopped at the
opening lesson, and the updated wrong-object prompt still needs an ordinary route witness.
The lesson could also rebuild its entire cast when the target wreck went missing, removing the
rock the player still held. Recovery now replaces the wreck while preserving the tethered rock.
The focused swing fixture completes the throw and collects the reward after that recovery.
The replay from the same Adventure seed held the original rock through about 141 simulation
seconds. The derelict moved farther out, and no throw, berth, or delivery was recorded. Its HUD
displayed `F · THROW` even though the aimed throw uses the right mouse button and F controls the
tether. The capture does not establish why the attempted right-clicks failed. See
`.devshots/fleet/coordination/playability-hull-first/adventure-preserve-line/`.
Both throw cues now name the right mouse button, and the lesson explains when to tap or hold it.
The target wreck now stays at its authored position and still registers ship and rock impacts.
The same-seed replay saw the corrected prompt and the wreck stayed at (-229, 18). The player lost
the original target at 5.17 simulation seconds and the tracker showed how to release the wrong
line and reacquire. This replay still stopped before a throw. See
`.devshots/fleet/coordination/playability-hull-first/adventure-wreck-and-throw-cue/`.
A short lifecycle capture on the same seed kept rock 610 alive and attached. No relevant terminal
entity or material event was observed. It confirmed the live `RMB · THROW` cue and still did not
record the throw. Keep material behavior until a loss receipt identifies its owner. The release
attempt showed the solver targeting a different body while the pilot aimed at the wreck's screen
position, so check target choice and actual throw input together on the next run. See
`.devshots/fleet/coordination/playability-hull-first/adventure-learner-life/`.

The Continue probe originally selected the displayed slot, while the worker had not received
the browser's existing save keys for shared-store reconciliation. The launch directive now
stages those managed keys ahead of worker initialization. The locked title probe selected Slot 3
and fetched the byte-identical server envelope. Worker and cross-shell continuation checks cover
the restore owner. A normal paid cargo route through quit and Continue is still an open milestone.

The default worker could also forget existing local Circuit bests and ghosts during startup or an
Adventure save or load. Those records now travel with the local worker snapshot and use the existing
pending-write order. The focused checks cover F8 and a clean finish that writes one best. The public
scored finish and return to Adventure are still open.

Classic and Helm Assist now honor an explicit Boost remap that uses an arrow key. The same key no
longer also steers or strafes through the old arrow fallback. Stock arrows and the remapped movement
keys still work. The default Hitch turned about 89 degrees in a 0.55-second V3 and Rapier input
probe, then settled at about 94 degrees after key release. The live spin report still needs an
aligned input, authoritative angle and visible facing sample during a hitch.

Import lint and ordinary Adventure boot passed the fleet gate. Its Swarm asset check stopped before
browser launch because the shared asset changes differ from HEAD. The separate native probe above
reached and played round one. A stable **boot to controls** measurement, scored Circuit, and
physical-device feel still need their own ordinary route evidence. For the startup delay, use
`__SF_STARTUP__.snapshot()` from `game:new` to `ui:loadingHidden` plus the opening cook ledger. The
screen-to-screen automation time includes deliberate menu actions. An earlier broad cook bypass
hurt the first fight and should stay off while the startup receipt isolates where that time went.

## How to keep work from disappearing

- Start from the current route result and commit. Reproduce again when code or the route changed,
  or when the previous check missed the reported symptom.
- Record the next concrete action for every failing or incomplete route. A fix can be committed
  after its focused regression passes. Close a route only after its ordinary entry point passes.
- Keep successful draws, fresh simulation poses, drawn ship movement, and hitch gaps separate.
  Compare performance within a matched locked run when feasible. A boot gate checks launch and
  controls, and whole-game acceptance still uses the authored standard in [doc 18](../../game/18_SOUND_LOOK_AND_DONE.md).
- Keep workers on disjoint owners and place one lead on the complete player task. Use engineering,
  visual and UX review where they can change that outcome. Every game or browser uses the shared
  game lock. Preserve exact foreign paths.
- If the work stops mid-pass, leave the current commit, route outcome, artifact path, and the next
  runnable action here or in the relevant queue row. Keep a severe defect open when its root
  cause or normal player route is still unverified.

## Current hardware baseline

Four isolated Electron launches on Intel D3D11 used a pinned game source at 792519bd72e9 and 16 s of
held-thrust observation after flight became available. Settings and viewport match. Each route
was measured once. The runs are diagnostics on this host. Gauntlet's opening stayed near real-time
simulation, while Adventure, early Swarm and Circuits lost simulation time. No route reproduced
a signed player backtrack under straight thrust. The moving-player gaps still show visible jumps
in cadence. Raw results and opened screenshots are in the four `.devshots/main-thread-profile/whole-game-before-*/` folders.

| Route | World draws/s | Fresh poses/s | Sim/wall | Callback p95 | Moving ship gap p95 |
|---|---:|---:|---:|---:|---:|
| Adventure New Game, Helios | 15.17 | 12.35 | 0.787 | 117 ms | 84 ms |
| Swarm round 1 | 13.39 | 10.76 | 0.813 | 150 ms | 139 ms |
| Gauntlet wave 1 | 25.40 | 25.28 | 0.999 | 67 ms | 67 ms |
| Public Circuits, Textile Belt | 14.14 | 12.14 | 0.823 | 117 ms | 112 ms |

## Landed and in verification

| Route | Latest result | Next runnable action |
|---|---|---|
| Desktop launch and close | `38b32852efe3` dead renderer quit, `a082946968b5` signaled child exit, `47580244082c` save before update, `ecf7b829c450` GUI environment, `1a29bf4711d7` legacy migration, `00fe1054ceb1` cold relaunch focus. `44096fab0953` bounds first navigation and paint. `4c32805ffe3f` bounds interrupted and trickling browser-server responses. Four ordinary matrix windows closed gracefully. | Finish the queued owned crash/relaunch probe. Packaged updater acceptance needs a rebuilt artifact. |
| Adventure save and story | `497814d84c4b` Anvil hazard route, `f07646fe67a7` Chart destination, `1c905c84edfe` paid jump save boundary. `ed9a9ebe6529` restores first-berth guidance and replacement alloys. `280970113e27` prevents stale shared saves and deletes from replacing a newer slot, while valid recovery still repairs an unchanged primary. The real HTTP race and recovery tests passed. Two public F5/F9 cycles in locked Electron saved and returned to flight in 7.67 s and 9.26 s, then closed gracefully. Evidence is `.devshots/fleet/coordination/whole-game/adventure-save-continue-r2/evidence.json`. | Continue at the completed Helios berth and take Weigh-In from the live board. |
| Adventure custody and workbenches | `8c5e463e88da`, `13262e9605e5`, and `90465f6f912c` keep sealed freight out of base delivery, fabrication, and bore storage. `3576c855aa3d` lets convoys sell their own freight with market rules intact. `bf0a4ea4b093` fixes station yard, service and weight-slip projection. `ae48547c908d` applies death penalties only after recovery commits. `dfa4e4f95176` tracks the wreck across sectors until its freight is aboard. `5939abb2cc09` keeps partially delivered contracts when the surviving cargo covers the balance. | Check sealed cargo and recovery through the ordinary player routes. Opus has the Base display quantity follow-up. |
| Physics and input | `94ecd46689ca` native body lifetime, `966f2d70f417` clears input at Pause, `e0f8ac41727a` corrects wrapped heading, `1aa922156005` waits for the first restored flight draw, and `c3e94a199ae7` keeps AI sensor cache entries with their live hull. `91a04da72389` passes intentional turns and stops through the pose smoother, repairing about 35° of visible heading lag in a 30 Hz reproduction. `453f0992bb3a` releases an Ashfall jump handoff when the player chooses Stay. `5faee660d029` prevents the main presentation read from displacing a received worker pose or writing world records. Its production bridge reproduction moved a ship 88.5 WU before the fix. | Observe a powered turn and key release on both matched arms, then exercise Pause and minimize/return while moving. |
| Early Swarm and Gauntlet | `e1512147a913` first-input protection resets per Retry. Both rulesets passed real worker launch, death and Retry regression. | Verify early Swarm combat and a real Gauntlet Retry; continue from the hardware baseline rather than starting at round 20. |
| Circuits | `276d5367de24` fixes stale dock fixtures. `2024492bf5ab`, `51cd46eb2209`, and `05ab8a839342` reset boost, ghost split and gate announcements per attempt. Focused routes passed. | Through the ordinary board choose Time Trial and press F8. Play a complete scored route before closing the row. |
| Whole-game performance | Adventure owner trace in `.devshots/main-thread-profile/whole-game-adventure-owner/`. Its biggest named single sample spans a lost sampling interval. Physics and tactical AI recur across the useful samples. `8bde9b72f7f5` reduced classification work, `ca21b36890ad` reduced isolated Adventure wire-diff time by 18%, and `6292f61ccfe4` cut manifold queries from 66 to 10 with identical native fixture outcomes. `b78c7a31cd50` cut 24,000 remote Helios wash ticks from a median 483 to 6.7 ms in the isolated fixture and preserved contact outcomes and receipts. | Finish the locked Adventure/Circuits comparison and Clips A/B. Use live cadence and draw attribution to choose the next shared cost. |

Additional matched CPU measurements under the same inputs and owner state:

| Change | Replayed work | Before → after |
|---|---|---:|
| `4162156aef77` Massline obstruction | 1,600 previews with 100 or 400 nearby spatial hits. Acquisition receipts matched. | 95.4 → 76.3 ms and 330.8 → 239.7 ms |
| `399bb0ba24c2` Vael ledger | 8,000 Adventure owner updates in quiet Helios and in the Veil with invoices and an active lien. Ledger, actors and receipts matched. | 334.7 → 191.7 ms and 1085.4 → 384.3 ms |
| `8aef717c4fe4` plant station and cursor reads | Seven plant owners on matched production Node-host scenes. Median combined cost across Helios, Pallas, early Swarm and Gauntlet. | 37.4 → 30.3, 36.9 → 25.6, 34.9 → 30.9 and 27.8 → 22.2 µs per tick |

These owner measurements establish specific CPU savings. Live world cadence remains open. The main
thread's recurring render submission and the worker's above-budget simulation steps both need work.

## Playtest checkpoint

- Windows Electron recovered an injected renderer crash, offered Quit on the next crash, and
  relaunched to an interactive title. The two public F5/F9 cycles also returned to flight.
  The packaged updater remains unverified. Crash evidence is in
  `.devshots/fleet/coordination/electron-crash-quit/report.json`.
- The matched powered turn and release measured p95 hull-to-pose heading error at 17.8° → below
  measurement precision. Callback p95 was about 100 ms in both arms. `5faee660d029` fixes a
  worker pose overwrite, and `052899aebd10` stops a patrol's side impact from creating a false
  player warrant while preserving real player ram attribution.
- `e8cce95972ea` keeps campaign actors, ambient collision and Act I outside standalone Circuits.
  Time Trial and Pack/Cup retained zero and two authored rivals respectively in the three-format
  worker reproduction. The production restore test confirmed campaign traffic returns on Continue.
  Fifteen focused checks passed. Live F8, a completed scored run and a new Circuits capture remain open.
- `a73aee08fa79` preserved measured telemetry values and historical snapshot identity. On a matched
  360-tick native 60-ship fixture median time fell from 326.3 to 287.5 ms. The 12-ship result was
  87.4 → 85.9 ms. The deterministic replay matched v27 across 20 repeats. Live impact remains open.
- `e9fd39b0eb63` gives Retry/Back when native physics preparation refuses flight. The next desktop
  investigation is a diagnostic Adventure launch where HTML rendered with native lifecycle
  `hidden-or-minimized`, zero world draws and only the first-picture hold. Trace the native window
  state and shell command before changing the hold. Fresh-app Ceres Continue also needs to warm
  RU-7 before the worker restore publishes entities. Its cold fallback was reproduced in isolation.
- The four-arm Clips run showed no consistent frame or hitch improvement from disabling capture.
  Circuits candidate and stock drew 13.7 and 16.2 frames/s with different public seeds and world
  paths. Repeat with matched seeds only after live flight and the Circuits roster changes settle.
  Import lint and Adventure passed the fleet gate. Swarm stopped in asset preflight because six
  Works files were being edited. Those edits have since landed, so repeat Swarm through the lock.

## Recorded Windows world freeze

The November 12 player recording shows Ricochet Foundry round 2 with the Supply Pod wager.
The matching unpackaged Electron launcher receipt records five full-scale, focused flight holds.
At tick 2491, 16 world draws occurred in 1.01 s while simulation time and the ship's position
stayed fixed at a reported speed of 100 WU/s. There was no pause request. The timer and ACK
values in the receipt came from the last delivered reply, so they cannot establish whether the
worker's current timer had stopped. Clip samples and the matching receipt are under
`.devshots/fleet/coordination/player-freeze/`.

The Foundry round-two candidate reproduced the Supply Pod event with seed 1. It registered 342
shots and 10.76 draws/s over 51.9 s of active round time. The widest observed moving hull gap
was 209 ms and stale simulation age reached 465 ms. Zero backtracks across 103 assessable
intervals and zero stale-ACK watchdog recoveries during active round two. Simulation advanced
0.56 s per wall second. Opened the flight PNG and confirmed clean shutdown. The baseline
attempt had its Armory launch click intercepted by the boot overlay. The corrected harness
waits for that overlay to lift. Its paired verification is queued with the Adventure retry.
The candidate run uses a temporary Electron profile and a diagnostic round-two entry. It
yielded four independent worker samples during reply-age episodes. All four had the same tick
as the main mirror, a pending wake, and no backpressure or heartbeat hold. A completed 15 s
worker window measured 31.9 ms p50 and 39.9 ms p95 per authoritative step. It shed 472 of 903
owed ticks. That window's lost flight time came with an overloaded worker, even though the
original recording also contains transport watchdog recoveries.

- `aa5b5517ed0c` unified main and worker shared-memory layout sizing. The old main allocation
  silently prevented the envelope ring from binding. Activating the ring exposed a second issue
  in live combat, where four queued command batches could stop flight. `da56112e4fba` uses the
  ordered worker message queue for controls, retaining shared buffers for completed replies.
- `5c70500d527f` releases cumulative ACKs before queued authoritative work. `14faa9c79438`
  sends journal progress as a cumulative ACK without asking the worker for a command reply.
  `37e2ce7e8425` adds the independent worker watermark to the existing launcher freeze receipt.
- `64678c44a573` re-sends the already applied reply watermark with a foreground heartbeat
  during starvation. In the dropped-ACK regression, four credits filled while the worker kept
  stepping. Motion delivery resumed before the three-second rebuild watchdog, and incorrect
  lifecycle and future watermarks did not free credits.
- `2c0f3ecd0856` fixes a separate forward-then-backward ship snap. The same live player moved
  authoritatively from 780 to 786.5 WU. After a rebuild the drawn ship previously moved from
  838.5 back to 786.5 WU. It now advances to 839.28 WU. Reused IDs, restore, sector changes and
  explicit resets still invalidate old poses. The regression crosses the real journal,
  publisher, pose fence and renderer. The player's recording cannot tie each snap to this path.
- In a locked Foundry round 2 diagnostic entry at seed 4242, both arms cleared the round and
  reached the Armory. The largest sampled active-flight reply age fell from 522 to 158 ms and
  the recorder's reply-starvation episodes fell from three to zero. Callback and moving ship
  gap p95 were 117 → 100 ms and 120 → 100 ms. Active simulation advanced 0.61 → 0.64 s per wall
  second. Outcomes and durations differed, and the recording had a different arena event.
  The harness did not yet confirm firing in this pair.
- A second locked pair used the recorded Supply Pod event, and confirmed held thrust, turn, and
  primary fire in both arms. Neither reproduced the recorded multi-second freeze. Over the first
  27 s of active flight, world submits fell from 21.1 to 16.3/s and simulation advanced 1.00 to
  0.84 s per wall second. Peak sampled reply age fell from 242 to 167 ms. Across the complete
  samples, drawn moving-mesh gap p95 rose from 70 to 100 ms, with a maximum of 126 to 193 ms.
  Stock cleared round 2. The envelope candidate was still in combat when its window ended.
- `386eebfd9305` keeps the shared numeric journal but returns message envelopes to structured
  clone. The fixed-size JSON envelope is diagnostic opt-in. In the isolated locked comparison,
  the ordinary journal route fired 210 times in about 24 seconds, with 13.4 world submits/s and
  a 126 ms drawn-motion gap p95. The envelope arm reached Armory and timed out entering active
  flight, so that run cannot establish an FPS gain. Neither transport result closes QUAL-07.
- `6bb94413ed9d` keeps duplicate and rewind semantics while skipping repeated AI membership lookups.
  The native 240-tick Foundry replay kept its hash and contact counts. The isolated owner pass was
  about 10% faster. `f4de88a6214a` batches floor-label layout reads, preserving separate chip seats.
  Its isolated frame benefit has not been measured.
- `60cd8a4cdc35` keeps native contact fences on the simulation side, preserving all impact and
  consequence receipts. In a 480-tick Adventure replay this removed 451 of 1,754 bridge rows.
- `7dfe58b4ac73` queues cold dormant rock geometry during flight, before contact or simulation
  promotion. The real admission queue passes its focused regression with a controlled GPU port.
  The Ceres browser probe reached live flight but staged no dormant row, so its ram leg did not
  exercise this fix. Three common live rocks met its frustum-sphere check without a mesh for
  1.8–2.5 s. A remaining short episode was a separate reentry by one of the same rocks.
- `07df4340e225` keeps a rock on the direct draw path until its instance is drawable. The old
  instance batch retains only the records it covered, and releases an old matrix before its
  entity ID can be reused. The admission and pool fixtures passed. This is separate from the
  remaining meshless live-rock episodes.
- In a follow-up Ceres flight after the pool fix, all 55 observed entries drew, six with delays
  of up to 43 ms. The probe followed a different path and saw no common live or dormant rocks.
  Keep the long no-mesh case open. `13d2a084fd8c` makes the probe match the submitted instance
  to its actual draw batch and retain camera and admission data on missing meshes.
- A 33-second locked Supply Pod flight on the journal path recorded 382 player shots, no
  detected multi-second holds and no drawn backtracks in 58 assessable intervals. It submitted
  20.7 world frames/s, with 77 ms p95 and 155 ms maximum drawn-motion gaps. It ended with one
  hostile still alive. This is a single flight, captured before the heartbeat recovery landed.
- The final locked Supply Pod pair overlaid the 12 changed runtime paths from the pre-fix and
  post-fix commits and opened both flight captures. Over approximately 28 seconds per arm, world
  submissions rose from 12.0 to 20.2/s. Callback gap p95 fell from 133 to 83 ms. Drawn moving-ship
  gap p95 fell from 129 to 85 ms and max fell from 177 to 113 ms. Peak sampled reply age fell
  from 482 to 199 ms, and the simulation advanced 0.66 to 0.96 s per wall second. There was one
  reply-starvation episode before and none after. Player fire was confirmed (210 and 318 shots).
  The encounter evolved differently in the two arms. The original seconds-long freeze did not
  recur, and the final candidate still hitches. Raw measurements and screenshots are
  `round2-final-pair-before*` and `round2-final-pair-after*` in the recording evidence folder.
- `1c0bc6a49b6d` removes unused per-entity slice-clock checks from synchronous rendering.
  The 13 focused pose and view checks passed. Its isolated live frame gain is unmeasured.

The Windows matrix status is in `.devshots/fleet/coordination/whole-game/pending-routes.jsonl`.
Two isolated Adventure launches reached the route's flight state but timed out before its clock
was live. A third reached full-speed play. Pause held tick 122 and minimize held tick 405.
After Resume and native Restore, both advanced ticks, resumed drawing, and accepted thrust.
Opened both captures from `flight-holds-owner.json`. The intermittent first-picture hold remains open.
The locked Circuits run used the public Time Trial route and F8 reset the same attempt in its authored
sector. Its opened screenshot still showed the campaign act heading above the race objective.
`8566b710688a` uses the temporary run's existing public launch context to hide the campaign
heading and radio, keeping gate guidance. Fifty-three focused checks passed. Scored finish,
and restart after a cleared gate remain open. The post-fix public Time Trial capture confirmed
gate guidance, the campaign heading and comms tape hidden, and a same-attempt F8 restart.
The first image still showed an Adventure yard-control line above the racing panel. `f859298abed6`
resets POI guidance on New Game and keeps its sector planner out of temporary circuits.
The regression enters a race after Adventure and continues the campaign afterward. Twenty-three
focused checks passed. A follow-up public F8 restart retained gate guidance and cleared the
yard-control line in the opened `circuits-place-isolated.png` capture.
The released checkpoints for flight restore, AI identity and Helios wash used the existing deterministic replay hash.

The previous round-20 report remains in `.devshots/fleet/coordination/quality-round20-performance.md`.
Use it as one stress route. For the separate visual lane, the Yardmaster/Line overlap reproduction
and candidate are recorded in `.devshots/fleet/coordination/whole-game/` for Opus.

## Worker ledgers, rendering, and native startup

- `0dbde54a8fc5` connects the worker's dormant asteroid deltas to the renderer's actual spatial
  table. The old path only updated the private read model. Field rows now enter the render roster
  before promotion, without becoming live bodies. The 56 focused checks include grid movement,
  promotion, reused IDs, and coalesced replies. Ceres live contact remains open.
  The production worker's Ceres entry emitted 525 dormant rows, including 27 diamond cells.
  One ordinary rock resolved in the presentation grid before the ram-promotion command, then
  transferred to the live body roster and left the field. The owner probe found no aux breaches.
  The locked Chrome probe staged 556 rows in Ceres and recorded 288 of 293 dormant metallic
  entries drawing immediately. Five drew late. One common rock was never stamped while its
  bounding sphere intersected the frustum. Its center started offscreen. Two late live entries
  started with their centers onscreen (671 ms for a rescue rock and 279 ms for a metallic rock).
  The ram target began 2,122 WU away and never reached the frustum. The probe therefore does
  not establish contact continuity. Opened `2026-11-13T12-01-28-862Z-shot0.png` and recorded its
  sibling JSON under `.devshots/asteroid-appear/`.
- `0427216c1975` drains dirty and removed IDs directly. New and replaced tables compare membership
  once. The 720-tick auxiliary probe had no reader mismatches or missing journal marks. The separate
  transport threshold failed on this host (2.54 ms p95 against the 0.5 ms per-tick threshold).
  A matched Node benchmark with 6,000 dormant rows and one change every ten replies measured
  1.66 to 0.012 ms median in the diff itself, with the same upsert and removal counts. These are
  isolated owner costs. Evidence: `aux-rock-journal-bench.mjs` and `aux-rock-journal-spike.json`
  under `.devshots/fleet/coordination/`.
- `f7294f59cb55` packs Nocturne probe uniforms once per frame. Isolated vendored Three.js uploads
  with four probes took 3,995 to 313 ms across 720,000 material uploads. The 21 focused tests
  preserve shader values. `81f1eb4c31ef` reuses measured compact-hull bounds, preserving the native
  200-tick combat hash and mutable authored hulls. Its isolated benefit was about 0.03 ms per tick.
  Neither result measures the effect on live frame time.
- `2562d286fd30` republishes actual Electron window visibility after the first show. An injected
  missing native `show` event previously left a visible window marked hidden, which cancels
  presentation and simulation. The regression failed before and passed after. The earlier live
  Adventure stalls did not record enough native state to attribute them to this race.
  The `ledger-shell` follow-up captured a different failure. Native Electron was actually
  minimized while the Chromium document reported visible and focused. The game was at tick 0
  with four draws, the first-picture hold active, and a black playfield under the HUD. Its
  isolated teardown needed the exact-child fallback. The opened screenshot and native receipt
  are `flight-holds-timeout-ledger-shell.png` and `flight-holds-owner-ledger-shell.json` under
  `.devshots/fleet/coordination/whole-game/`. Capture native state on any future opening stall.
  The next public launch was already visible and focused at flight entry. Pause held tick 66
  and native minimize held tick 178. Both advanced simulation, drew the world and accepted
  thrust after return. Both PNGs were opened. Cleanup passed. See `flight-holds-owner-native-resume.json`.
  This route deliberately introduces two holds, so its aggregated cadence is not a steady-flight
  comparison. In its active samples it still recorded 1.73 s maximum simulation staleness.
- `64092aa260a1` and `15f2694cd228` capture the same held thrust, turn and primary-fire workload
  in cadence, worker CPU and Chrome scheduling traces. Use `combined-input-trace.mjs` under
  `.devshots/fleet/coordination/` with the locked steady-flight probe. Keep the timing of actual
  moving poses distinct from successful draws and validate that player fire occurred.
  The source-stable Intel D3D11 Foundry round 2 diagnostic recorded 101 player shots in the
  21.34 s controlled input window. Over the full observer interval it submitted 5.45 world
  draws/s, with a 267 ms callback p95, 259 ms drawn-motion p95, and 0.38 s of simulation per wall
  second. No intervals supported a signed reversal verdict. The renderer trace reported no data
  loss. The capture ran Chrome tracing and a worker CPU sampler together, so compare only with a
  matched run and establish absolute live cadence without these observers. The raw worker report
  assigned its first unsampled 4.21 seconds to squad merge. Correctly timed samples give that
  function 265 ms (0.89%). Artifacts are in `.devshots/main-thread-profile/combined-input-trace/`.
- `b30d3e7d4070` gives each posted catch-up wake a one-shot timer for the same pending operation.
  In a deterministic loss injection, the old worker remained on one tick through two seconds of
  foreground heartbeats with no outstanding ACK. The fixed clock recovered after two fixed-step
  periods. The delayed task could not step again, and pause and shutdown still cancel pending work.
  This mechanism has not been attributed to the retail recording.
- `44aa8f37f041` fixes a second Ceres visibility gap at dormant-to-live handoff. In the locked
  diagnostic, rock 299 had an admitted root and its center was on screen, yet the root hid for
  279 ms across four samples. Its live row was in the newest completed pack while the displayed
  bracket still preceded its spawn. The existing visible root now keeps the dormant pose through
  that interval for the verified promotion and exact occupant only. The pose, visibility, bridge,
  and pool checks passed. The production worker reported the expected promotion receipt and field
  removal with no journal breaches. Live contact verification is queued under the game lock.
  The separate Helios rescue rock first-build delay remains open.
- `14d03ddb7252` rejects distant compound bodies before precise spawn overlap checks. Four matched
  Foundry worker runs made the same 319 guard decisions, including seven nudges, and finished with
  the same state hash. Mean guard cost was 218 to 154 ms over 144 ticks. Host contention varied
  substantially, so this gives directional owner timing only. The rotated offset-body check
  confirms the guard still detects reachable compound children.
- `63dc0d82086f` reuses CSS viewport dimensions for projection, verified across a high-DPI resize.
  `5be2cb0782a6` reuses the static run schema during validation. `3287b160abe1` aligns arena tests
  with the staged Foundry banks and checks terrain identity, duplicate prevention, and sweep timing.
- Desktop startup source review found no request to minimize during launch, and the isolated probe
  did not load remembered window state. The failed screenshot shows the window already minimized
  at timeout. A subsequent native probe passed Pause and minimize/restore from active flight.
  The timing of the unexpected startup minimize remains unknown.
- `23fa79612f51` reuses the physics owner's snapshot for its pooled impact receipt. The final
  retail hold recorded 20,464 cumulative shed background impact events. Those events had already
  paid recursive serialization before being dropped. A same-payload copy benchmark measured
  72–73 ms versus 5–10 ms for 20,464 snapshots. The traced workload attributed about 118 ms of
  29.8 s of worker CPU samples to this bridge path. Preserve all effect and gameplay receipts
  under the existing policy. The measured cost cannot account for the original freezes by itself.
- The lightweight locked Foundry run confirmed 189 player shots while exercising thrust and turn.
  It measured 8.23 successful world draws/s, 187.7 ms moving ship pose gap p95, and 426.6 ms max.
  The largest measured stale-tick window was 600 ms. There were zero backtracks in 30 assessable
  intervals and 235 unknown samples. The capture opened and Electron closed cleanly. It used a
  different seed from the earlier pinned 12.0 to 20.2/s comparison. A 717 ms reply gap showed the
  worker 20 ticks ahead of the main mirror, with one outstanding reply and 326 retained rows.
  That episode was presentation delivery lag. Its worker was advancing and still had a wake.
  See `round2-post-ledger-light.json` and the matching PNG under `player-freeze/`.
- Opus's headed Adventure route separately measured 10.5 average callback FPS outside capture
  intervals and a 167 ms p95 callback gap. It timed out pursuing the 47-A Recovery Site before
  docking. See `.devshots/fleet/demo/adventure-1/demo-route.json`.
- The locked Ceres probe opened on the correct sector and its PNG was inspected. It mistook remote
  activation at 1,230 WU for contact and collected zero on-screen frames for the target. `1c7225d24604`
  distinguishes close contact from remote activation and stages against the rock's drift position.
  The previous report is `2026-11-13T12-59-43-929Z.json`. `1a37fa62f9bb` reads the nested world
  RPC receipt. The corrected Ceres run observed promotion at 63 WU with a 41 WU target radius,
  but stamped zero visible target frames and produced no approach PNG. The inspected contact PNG
  does not show the target. Contact visibility remains unverified. Next capture must identify the
  exact rendered target and bracket at approach and contact. The same run separately recorded a
  952 ms Helios rescue rock admission gap. See `2026-11-13T13-25-50-256Z.json`.
- `db9ecd228b47` fixes one proven reply recovery delay. With four replies posted and a fifth
  retained, the first ACK freed credit but left the ready reply waiting for a later worker turn.
  Native ordered delivery now releases the retained reply immediately when all preceding posted
  ranges prove a contiguous, same-lifecycle prefix. Only the real ACK trims the journal. Gaps,
  rebuilds and other transport paths retain their existing rules. The production clock fixture
  failed before the fix and passed after. The 32-test clock suite passed. A same-lock, single-file
  source comparison ran as `player-freeze/pair-credit.mjs`. During the roughly 30 s firing windows,
  the two arms confirmed 204 and 208 player shots and drew 9.72 and 10.55 world frames/s. Measured
  over each capture, moving hull gap p95 was 154 to 151 ms, the maximum fell from 525 to 248 ms,
  and maximum stale-tick time fell from 470 to 302 ms. The callback p95 was 150 ms in both arms.
  One reply starvation episode during startup became zero. Both pictures were opened and both
  Electron runs closed cleanly. Combat state evolved differently, and one pair gives directional
  evidence only. The game still misses a smooth cadence target.
- `9dc2491bfc1d` makes an authored same-sector relocation reseat the player pose even during
  extrapolation recovery. Ten pose and journal checks passed. The next locked Ceres run again
  found the target activated away from the ship (1,227 WU) and captured zero visible target
  frames. This does not attribute the visibility gap to player relocation. Its separate Helios
  rescue rock remained late by 891 ms. See `2026-11-13T13-29-39-195Z.json`.

## Shared flight costs under thrust, turn, and fire

The public Electron Adventure and Gauntlet routes used held W, D, and primary fire through the
game lock. The comparison pins the shared spatial hash and retained opaque batch modules at
`5d2ef99c92eb` and `fa30330f4048`. The other modules and assets come from the shared checkout.
Successful draws and moving ship poses are measured at submission. Hardware display scanout
is outside the probe. Both arms of each route closed cleanly, and their PNGs were opened.

| Active route window | World draws/s | Drawn ship gap p95 | Worst drawn ship gap |
|---|---:|---:|---:|
| Adventure, 24 s | 11.33 → 10.03 | 156 → 172 ms | 258 → 213 ms |
| Gauntlet, first 8 s | 10.15 → 12.78 | 148 → 121 ms draw gap | 350 → 190 ms draw gap |

Adventure fired 54 shots in each arm. Fresh poses fell from 9.49 to 8.95/s. There were zero
signed backtracks in 227 and 200 assessable intervals. The route had different combat states
and no live performance win. The before arm shed 600 fixed ticks in 24 s with zero measured
backpressure and 12 ms held for a missed presentation heartbeat. Its measured worker-step
window was 25.13 ms median and 41.47 ms p95 against a 16.67 ms target. Preparing and drawing
the world used 29.43 ms median on the main thread. External callback gaps also mattered.

Gauntlet's opening segment improved directionally. The before arm reached Rearm at 9.8 s.
The after arm continued through 18 s. Signed movement direction had too few assessable
intervals for a conclusion. The initial probe used the wrong ruleset selector and timed out at
the door. The corrected run used the public Gauntlet tile. The Circuit filter was briefly
present in the unpinned checkout during Gauntlet, so the comparison cannot isolate source effect.
See `.devshots/fleet/coordination/player-freeze/shared-owners-pair-pair-summary.json` and
`shared-owners-gauntlet-pair-summary.json`.

- `1e66a7186520` shortened 105,600 shared radius queries from 537 to 214 ms in the isolated
  replay with exact ordered results and diagnostics. `fa30330f4048` removes redundant
  retained geometry and unused texture-slot checks. The distinct-material fixture measured
  1,313 to 1,029 ms across 180 frames before adding shared-geometry reuse.
- `68fb41cd6a98` admits a flying rock when its visible footprint reaches glass and simplifies
  per-entity activity bookkeeping. The original code failed the boundary regression. The
  corrected code passed 61 checks. The first matched native Adventure classifier replay used
  354 to 296 ms over 144 ticks with identical motion, pins, and 14 shot receipts before adding
  the boundary fix. Live rock coverage remains open.
- `395256f5ff06` removes the Circuit owner scan for foreign cargo impacts. `745f433d3b66`
  avoids collision proxy resolution for ineligible bodies and reuses its computed substance.
  The 14 Circuit and 43 collision proxy checks passed. The 47-A replay matched 20 of 20.
- `9a4c3b27e2da` stops repeated journal acknowledgements from restarting paused worker
  maintenance at an already trimmed cursor. The native Gauntlet baseline generated roughly
  3,000 extra directives after Rearm opened. The regression failed on the old worker and all
  33 clock tests passed after the fix. In the locked, single-file worker comparison, Rearm
  dropped from 2,772 directives in 7.17 s to 441 in 6.97 s (387 to 63 per second). The after
  arm processed 440 actual commands and ended with zero unacknowledged replies. Both arms
  traveled about 2,294 WU and fired 274 and 276 shots before Rearm. Active flight drew 15.98
  to 13.24/s and moving ship gap p95 rose from 111 to 138 ms, so sustained flight remains
  open. Both Rearm PNGs were opened. See `shared-paused-journal-pair-summary.json` in the
  same `player-freeze/` directory.
- `8276b9524eba` reads the typed projectile lane for the weapon effects mirror. The production
  worker fixture confirmed pulse projectile publication and retirement.
- `aee1b488efe5` is a measured candidate that removes two unused bloom inputs and skips the
  unused tone curve at either endpoint. The locked Adventure fixture compared 15 frame pairs at 1832×973 and found zero
  differing RGBA pixels. All 19 focused tests passed. GPU timing drifted across the baseline
  blocks, so a speedup is unverified. `b6735b6bf4c5` returned the live file to the lead-owned
  look version. The capture was opened. See `eval-result.json` under
  `.devshots/main-thread-profile/stand-in-bloom-composite-paired/`.

The later locked Adventure pair compared seven pinned files across `5d2ef99c92eb` and
`aee1b488efe5`, including the isolated bloom candidate. Both arms shared the typed projectile
mirror and the unpinned checkout. During 24 s of held thrust, turn, and fire, world draws rose
10.48 → 12.59/s, fresh poses 8.77 → 10.28/s, and moving ship gaps fell 178 → 132 ms p95 and
347 → 184 ms maximum. Maximum stale ticks fell 329 → 177 ms. Shots were 51 and 54, with no
signed reversals in 221 and 267 assessable intervals. The after arm still executed only 0.61 s
of simulation per wall second. Combat evolved differently and the pair does not isolate a
single change. Both flight PNGs were opened. See `shared-latest-adventure-pair-summary.json`.

The follow-up pinned only committed runtime changes and left out the bloom candidate. Adventure
drew 11.89 → 11.33/s over 24 s of simultaneous thrust, turn, and fire. Actual moving mesh gaps
were 149 → 157 ms p95 and 246 → 322 ms maximum. The ship fired 57 and 54 shots, with zero
backsteps over 252 and 238 assessable intervals. The after arm ran 0.58 s of simulation per wall
second and shed 551 steps. Both flight PNGs were opened. See `shared-shipped-adventure-pair-summary.json`.

The next batch landed three focused changes:

- `1c5e7bdfa661` keys static dressing layers by roster identity. Before the fix, native physics
  and the projectile grid could see each other's obstacles when unrelated version counters
  matched, and they rebuilt both arrays every alternating call when the counters differed.
  The regression reproduced the wrong obstacle on baseline. All 26 focused dressing tests passed.
- `a8762fb12660` resolves the Helios claim face through the authored live slot or the versioned
  dormant roster. The opportunity still follows promotion, exhaustion and save restoration.
  All 21 focused Helios tests passed. The 20-run 47-A replay and reload matched its checked-in digest.
- `f09dfb9255bb` retains the visible tail of each authored instance chunk and reuses the owner's
  existing cull result across its proxy slots. `2daf823dbc0a` repaired the existing field-device
  fixture to assert both the skipped 60 Hz callback and the actual 30 Hz update. The 59 buffer
  range, package lifecycle, and instance policy checks passed.

The locked pair `shared-dressing-slot-and-pool-pair-summary.json` pinned those three changes.
Adventure drew 12.00 → 12.11/s, with moving mesh gaps of 135 → 143 ms p95 and 196 → 276 ms max.
Gauntlet drew 13.98 → 13.48/s during active flight and 9.86 → 9.77/s including Rearm. Active-flight
mesh gaps were 122 → 126 ms p95 and 171 → 185 ms max. Adventure fired 53 and 54 shots. Gauntlet
fired 191 in each arm before Rearm.
All four PNGs were opened. This pair did not demonstrate a sustained cadence gain.

`cf1508fed30a` moves background shader and residency work to an explicit background task when
available. The old bare yield used the caller's priority and boosted its continuation. The
starvation fallback still fires once if the browser never schedules the background task.
All 43 admission and scheduling tests passed. Its isolated locked Adventure pair drew
11.72 → 12.78/s and reduced p95 moving mesh gaps from 170 to 150 ms, while the worst gap
increased from 219 to 272 ms. Both arms fired 54 shots with zero observed backsteps. Median
worker pack time was below 0.1 ms, and the median reply tail was 4.6 → 3.5 ms against
89 → 84 ms spent in fixed steps per batch. Both flight PNGs were opened. See
`shared-admission-priority-pair-summary.json`.

A locked diagnostic compared the existing Windows graphics backends during the same Adventure
input hold. Intel D3D11 drew 13.14/s with a 124 ms p95 moving mesh gap, and D3D11on12 drew
9.25/s with a 190 ms p95 gap. Both hardware adapters and both flight PNGs were verified. The
launcher retains D3D11. See `angle-d3d11-adventure.json` and `angle-d3d11on12-adventure.json`.

Changing only the worker's 72 ms batch budget to 36 ms moved typical replies from 3–4 steps to
2. Locked Adventure still fired 54 shots in each 24 s arm. Fresh snapshots rose 9.87 → 11.60/s
and maximum stale simulation time fell 412 → 204 ms. Actual moving mesh gap p95 was 144 → 148 ms
and the maximum was 398 → 394 ms. Draw rate fell 12.53 → 11.85/s and simulation per wall second
fell 0.61 → 0.56. Both pictures were opened. The shorter budget was an overlay only. See
`worker-batch-72-adventure.json` and `worker-batch-36-adventure.json`.

The next substantial performance owners are the worker's fixed-step physics and tactical AI,
and the renderer's HDR world draw and admission. The old raw CPU profile's largest named
sample fell in a lost sampling interval. Filtering intervals over 20 ms leaves physics at
22.8% and tactical AI at 14.4% of sampled worker CPU. Do not treat Rearm settling or successful
movement receipts as closure of the live flight cadence failure.

The oldest economy spike comes from constructing remote listings and their 64-point price
histories on the first due period. Ten matched Node digests preserved exact market and receipt
values, but the candidate formulas did not reliably shorten the spike. Preserve the current
publication boundary until staged preparation can account for earlier on-demand mint and RNG.

## Physics, AI, rendering, and retail motion follow-up

- `58a04236c4cb` retries the last applied worker reply watermark on subsequent foreground
  beats during a stall. The old path tried only once per episode. A later beat now frees the
  slot after an invalid or missed attempt, without another diagnostic request or a stale
  lifecycle ACK. The 33-test clock suite passed. The original retail recording still needs
  same-path confirmation. It recorded 16 successful draws at tick 2491 with the ship fixed
  in place at 100 WU/s. The five stale-ACK recoveries and coalesced event bursts implicate
  the reply path, but the recording lacks an independent current-worker watermark.
- `125b067d3fc0` removes eager rounding and unnecessary contact correction math. In six
  matched 112-body pairs, median native step cost was 5.76 to 4.70 ms dispersed and 4.95
  to 4.23 ms packed. Per-tick poses and 52/4,025 contact receipts matched. The 47-A replay
  and reload at tick 600 matched the checked-in digest.
- `424f02858011` shares the optic firing scan and avoids aggregating pilot-only squad contacts.
  Optic query cost fell 28–30%. The six-pilot squad fixture cost fell 7% with zero projectile
  contacts and 74% with 60 contacts per pilot. Orders and debug receipts matched.
- `b6c33eff608c` cuts warm vertex binding validation and unused clip-space sort arithmetic.
  Isolated validation ran 1.51–2.34 times as fast and sort depth ran 1.12–1.31 times as fast.
  The vendored renderer fixture preserved buffer rebinding, upload and draw order.
- `315783bb183a` removes full input graphs from normal Worker replies. The worker still
  attributes every completed step and ships full rows when an input observer is installed.
  The browser-worker fixture confirmed a scalar count and no input graph in normal mode.
- `b401c3a7dea3` removes the whole-scene visibility rewrite from eligible exact-target GPU
  admission passes. The real vendor renderer fixture retains independent light discovery,
  shadow scope and ordinary subsequent drawing. Live startup and visibility cost are open.
- `b93310058ff0` uses a shared known-shape copier for repeat observations of pooled live sensor
  contacts and retains generic copy behavior for authored records. The candidate fixture used
  production sensor code with eight observers. Matched cost fell from 196 to 140 ms in the
  Adventure-shaped case and 250 to 172 ms in the arena case over 60 ticks. Timing preceded
  the final consolidation of three field writes into the copier. All 42 focused checks passed
  on the final source.

The locked Electron pair at `42bb57dc2b97` / `b93310058ff0` pinned the eleven changed runtime
files, used separate temporary profiles and confirmed normal Chromium background throttling.
Both modes accepted trusted thrust, turning and primary fire, moved the authoritative ship and
the drawn mesh, and closed cleanly. Neither arm reproduced a second-long in-flight hold with
successful draws continuing. Movement timing excludes the intentional Armory and Rearm pauses.

| Public route | Active world draws/s | Moving ship gap p95 / max | Player shots |
| --- | ---: | ---: | ---: |
| Swarm, seed 73311 | 7.47 to 8.54 | 210 / 575 ms to 214 / 297 ms | 136 to 104 |
| Gauntlet, seed 4242 | 15.30 to 13.20 | 112 / 178 ms to 138 / 276 ms | 143 to 165 |

Across the first ten seconds of active flight, Swarm drew 7.12 to 8.34/s and Gauntlet drew 14.50
to 11.19/s. The arms spent different lengths of time fighting before the wave cleared. Maximum
observed stale simulation age was 583 to 106 ms in Swarm and 0 to 231 ms in Gauntlet. The fixture
CPU wins did not translate to a reliable game-wide cadence improvement. Opened both Swarm Armory
captures and both Gauntlet Rearm captures. Both initial Adventure attempts used an obsolete text
selector and never reached flight. The lead has the failure captures for the clipped Adventure
headline and collapsed hit area. Evidence is `shared-work-cuts-pair-summary.json` under
`.devshots/fleet/coordination/player-freeze/`.

The repaired locked Foundry pair (`shared-work-cuts-adventure-keys-pair-summary.json`) used the
seed-1 Supply Pod round. The baseline was `42bb57dc2b97`, the after arm was `5ef7f502fe2f`,
and the third arm used the current development tree and bundled worker without an overlay.
All three used focused Electron with normal background throttling and closed cleanly. Their
first 35 s of active draw rate was 11.41, 10.67, and 10.93/s respectively. Over the available
flight samples, moving ship gap p95 was 123, 139, and 133 ms and max was 433, 383, and 441 ms.
Zero signed reversals in 72, 74, and 44 assessable intervals. Baseline remained in round two,
while the two new-source flights reached Armory sooner, so compare cadence in the fixed window.
No active flight hit the three-second credit watchdog. Both the baseline flight and both Armory
PNGs were opened. This is a matched regression check of the event, with a fresh profile and a
diagnostic round-two entry. The recording's multi-second advancing-flight freeze remains open.

`80381af86296` lets a foreground beat recover the same pending fixed-step wake when its timer is
at least one tick overdue. The deterministic browser-worker test delays that timer, verifies the
beat completes a new step, and fires the obsolete callback to check it cannot step twice. The
foreground return test still verifies that hidden wall time does not become catch-up debt.

The repaired public Adventure route reached active Helios flight with trusted thrust, turn, and
fire. The separate locked seed-4242 launches at `42bb57dc2b97` and `1af30d8c0b99` submitted
12.07 and 9.78 world draws/s over 24 seconds. Moving mesh gap p95 increased from 150 to 172 ms.
The maxima were 428 and 418 ms. The ship fired 58 and 51 times and traveled 2,910 and 2,304 WU.
There were zero observed signed backsteps over 257 and 208 assessable intervals. Both flight
captures were opened and both profiles shut down cleanly. The source pins cover the batch's
runtime cuts and older clock fixes. The reservations ran separately against other evolving live
files, so individual patch effects cannot be inferred from this decline. In the latest launch,
the worker advanced 0.53 s of simulation per wall second. The graphics frame spent 13.1 ms
preparing and 29.9 ms submitting at p50. Original retail freezes and sustained pacing remain
open. See `shared-work-cuts-adventure-keys-before-adventure.json` and
`shared-work-cuts-final-r2-adventure.json` in the recording evidence folder.

- `1af30d8c0b99` preserves run state validation and defers path formatting until a value
  fails. Six alternating run-history fixtures went from 94.65 to 49.41 ms per 1,500
  validations. All 25 focused tests passed.
- `bda9a1b2fa2f` advances the field particle system through the original substeps and packs
  once after emission. The 250 ms case previously packed instance buffers four times. Final
  state, buffers and lighting matched through retirement. Two of 62 focused tests failed on
  both sources (distant aura snapshot and full VFX fixture cadence).
- `24dd46889364` lets a foreground heartbeat expire abandoned reply credits when their timer
  callback is late. A valid ACK on that heartbeat takes priority. The worker rebuilds through
  the existing journal path, and an obsolete callback cannot expire the replacement reply.
  All 35 worker clock tests passed.
- `ed036f7a2fe7` checks for a moving craft before repeating rock geometry and pin work for an
  invalidated view. In the mixed fixture, rock checks fell from 41,044 to 28,000 over 130 ticks
  with identical ordered views and world records. In the timing fixture, median classification
  fell from 141 to 115 ms over 270 ticks. The six focused retention tests passed.

The locked `round2-watchdog-field-after.json` run used the ordinary development launcher with
its bundled worker, in an isolated Electron profile. Foundry confirmed the Supply Pod event,
278 shots overall and continued movement under all three controls. Its first 35 s drew 9.77/s
and advanced 0.56 s of simulation per wall second. Actual mesh gaps reached 155 ms p95 and 473 ms
max. No signed backsteps across 67 assessable intervals. The active worker window reached
32.18 ms p50 and 41.27 ms p95 per step with no reply watchdog recovery or backpressure.
The combat PNG was opened and cleanup passed. This run started before the rock-classification
change was finalized and is a separate reservation from the earlier Foundry pair.

The locked `activity-field-pair-pair-summary.json` comparison pinned the worker clock, activity
classification, field transport and field owner files at `1af30d8c0b99` and `ed036f7a2fe7`.
All four public seed-4242 routes registered simultaneous thrust, turn and primary fire.
Both Adventure arms ended in flight and both Gauntlet arms reached Rearm. Opened all four PNGs.

| Route | Active world draws/s | Moving mesh gap p95 / max | Shots |
| --- | ---: | ---: | ---: |
| Adventure, 18 s | 8.17 to 8.79 | 216 / 514 ms to 174 / 530 ms | 36 to 36 |
| Gauntlet, first wave | 17.31 to 15.90 | 113 / 217 ms to 126 / 270 ms | 177 to 173 |

Gauntlet's fixed first 10 s drew 14.67 to 14.16/s. Adventure peak sampled stale simulation
fell from 793 to 526 ms, and the most recently reported step window changed from 28.66 / 43.85 ms
p50/p95 to 27.61 / 41.23 ms. Both rates are slower than the 16.67 ms step budget. No arm captured
the recorded seconds-long hold alongside continuing draws or a signed backtrack. The cadence
measurements are world submissions and mesh poses, with no display scanout sampling. Unpinned
content can evolve in the shared checkout, and both encounters evolved differently during play.

## Worker, launcher, and render follow-up

- `87e3cb31bfc2` reads live collision material and dynamic status without allocating a whole
  body substance record. In the 120-body fixture, median native sync took 0.332 to 0.235 ms.
  A 220-tick replay with live authorship changes matched poses, proxy choices and 6,775 contacts.
  The 47-A deterministic replay and reload matched. Turning off CCD just for zero-collision
  projectiles changed solid-body pose at tick 31 and changed the contact count. That experiment
  was discarded. Reproduction is `bench-physics-projectile-ccd.mjs` in the coordination folder.
- `7617ae84a1d1` caches static domain-path rules and immediately re-enumerates a node whose
  children were discarded on collapse. With live mutable rules and domain data, wire output
  matched and the two 330-pass fixtures took 274 to 224 ms and 191 to 162 ms. Final lifecycle
  and wire-parity checks passed.
- `857afa9d90eb` skips entity-reference traversal for the native scalar contact receipt. Synthetic
  impacts continue to rehydrate live references. Listener order and emit-time mode and sector
  context are preserved. All 21 bridge and solid-dressing checks passed. The old retail receipt
  replayed 1,271 events in 55 ms in one reply. These changes do not bound the listener cost of
  such a burst. The same test command exposed two `run:ended` listener errors in the concurrent
  untracked crowd coin and shadow coach plants. Their lead has the failing event and lines.
- `123143341f73` reused the six packed Nocturne probe uniforms within each linked GPU program
  and producer revision. The fixture observed 924,000 to 25,200 uniform calls and passed 47
  checks. In the locked Adventure pair, the two pinned renderer files drew 10.91 to 9.33/s and
  moving mesh gaps went from 156 to 169 ms p95 and 446 to 431 ms max. Both arms fired 36 shots,
  had no signed backsteps or one-second holds with ongoing draws, and closed cleanly. Opened
  both PNGs. `3ba59ed7f8cd` removed the candidate after the live pacing decline. The GPU call
  count alone did not establish a player benefit. See `nocturne-uniform-pair-pair-summary.json`.
- `c4da41846047` lets the desktop launcher retry once when its renderer dies before initial
  navigation settles. It keeps the same save origin and deadline and waits for a fresh first paint.
  All 52 shell checks and launch policy passed. Real crash injection was through the shell fixture.
- `abb428bcdcd5` rejects field auras on bodies outside the field contact reach. The previously
  failing distance test passed, alongside 39 other field, particle, and material checks.
- `32d2c479cbef` charges authored ship admission for its synchronous slices rather than counting
  waits between presents, and cancels the losing frame/timer callback. The injected test waited
  multiple seconds while correctly recording 3 ms of CPU work. All 93 focused checks passed.

`followup-fixed-work-pair-summary.json` pins the five physics, mirror, and bridge files at
`f57a05d6fb0e` and `857afa9d90eb`. Both seed-4242 modes confirmed thrust, turn, fire and visible
ship motion. Both Adventure arms fired 36 times. Gauntlet fired 188 and 163 times and cleared the
first wave in both arms. All four captures were opened and all four profiles closed cleanly.

| Public route | Active world draws/s | Moving mesh gap p95 / max | Worker step p50 / p95 |
| --- | ---: | ---: | ---: |
| Adventure, 18 s | 8.77 to 8.48 | 211 / 556 ms to 178 / 555 ms | 29.45 / 49.08 ms to 27.51 / 38.94 ms |
| Gauntlet, first wave | 15.65 to 15.26 | 105 / 414 ms to 121 / 220 ms | 11.54 / 18.89 ms to 10.03 / 17.39 ms |

Gauntlet drew 12.74 to 14.55/s over its first 10 s, and the two encounters cleared at different
times. Adventure advanced 0.47 to 0.52 seconds of simulation per wall second. Neither route
showed a seconds-long position freeze with drawing still active. Sustained cadence and the
original retail freeze are still open. Unpinned content comes from the shared checkout.

The locked `flight-holds-owner-followup-steer.json` run used the ordinary Adventure route, a
disposable Electron profile, and the bundled worker. The Pause menu held tick 126 and the ship
pose until Resume. Native minimize held tick 427 and the drawn pose. After native restore, fresh
W and D registered together. The authoritative pose advanced 171 ticks, moved 129 world units
between samples and changed heading by 110 degrees while the world drew 53 more times. Both
screenshots were opened and cleanup passed. The earlier W-only run resumed ticks but moved only
1.44 world units beside a rock. These runs verify restore and steering while leaving the cause of
the earlier low-movement case open.

## November 18 integrated-GPU first-fight pacing

The station preload now leaves DOM mounting and layout to the dock transition. Survival skips
that preload and the Ceres Ninth Mouth world-lighting pass. In Auto on integrated graphics, the
world buffer uses at most one pixel per CSS pixel. The HUD uses display resolution.

Two isolated Intel D3D11 Electron profiles ran the same seeded Swarm round-one workload for 18
seconds of held thrust. The source overlays differed only in those changes. The encounters
evolved independently and host CPU busy was 41.6% before and 49.8% after.

| Measurement | Before | After |
| --- | ---: | ---: |
| World buffer | 1832 × 973 | 1466 × 779 |
| World draws per second | 15.96 | 22.36 |
| Fresh moving-hull gap p95 | 132.74 ms | 95.87 ms |
| Worst fresh moving-hull gap | 359.54 ms | 190.75 ms |

Both screenshots showed moving flight. The second CPU profile had no sampled station `paintWarm`
or Ninth Mouth `update` stack. The pair measures the changes together. A later Hornet batching
trial changed source during capture and was withdrawn. The Ashline motion-ownership fixture still
fails on the original cohort selector. The focused lighting, docking and adaptive-quality checks
passed.

In the second CPU profile, drawing, scene preparation, VFX, and HUD and feel used about 26 ms of
main-thread time per world submission across the sample. A 60 Hz frame has 16.7 ms. The surviving
cost spans the normal presentation phases as well as the simulation's separate deadlines.

The unpacked Windows build went through New Game into Adventure with working thrust. In the next
18 seconds it submitted 18.00 world draws/s with 83.40 ms p95 and
233.33 ms worst browser callback gaps. Simulation advanced at 0.705 times wall speed. This build
still misses the demo cadence target.

The same executable reached Swarm round one through the title, ship selection and equipment
screen. It submitted 21.09 world draws/s over 18 seconds. The browser callback gap was 99.98 ms
at p95 and reached 816.64 ms. Simulation advanced at 0.952 times wall speed.

The instrumented repeat of that packaged Swarm entry submitted 24.52 world draws/s. Its worst
callback gap was 183.33 ms. Shader and buffer admission rendered extra exact-target passes during
combat, accounting for about 55 ms inside two of the largest gaps. The 816.64 ms gap remains
unattributed. The CPU profile is `swarm-hitch.cpuprofile` in the package evidence directory.

The comparison artifacts are in `.devshots/main-thread-profile/demo-performance-first-fight-stock/`
and `demo-performance-first-fight-candidate/`. The unpacked executable and public-route evidence
are in `.devshots/demo-performance-package/`.

### Single-instance retest

Exact-target warm-up skips unrelated scene branches and limits the color write to a 16×16 sample
on the same render target. It still submits the chosen geometry with the same shader and lights.
Shader compile collects lights from relevant branches. Cold pending subtrees without lights or
LOD work can be hidden at their root. The world renderer keeps up to 24 inactive, already
reflected shader programs for reuse. The focused fixture verifies reuse, eviction and release.
The salvage and boss-warning canvases start hidden at 1×1 and grow when there is a cue to draw.

The first continuation package left an isolated test process running. Its renderer and GPU
process used about 1.9 CPU cores during the check. It closed before the following retest.
The Adventure replay then measured an 11.16 ms median and 20.34 ms p95 fixed step with the same
1,080-tick motion digest as the run with the competing process. Physics and tactical AI were the
largest measured systems.

Both paths below reached flight with thrust in the same unpacked Windows executable. Each
sample covered about 18 seconds. The callback gaps include scheduling delays and use a
different clock from the world draw counter.

| Public route | World draws/s | Simulation seconds per wall second | Callback p95 | Worst callback gap | Raw gaps over 50 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Adventure | 26.93 | 0.995 | 50.02 ms | 99.99 ms | 52 |
| Swarm round one | 23.24 | 0.998 | 66.71 ms | 149.99 ms | 106 |

Both flight captures showed the ship, HUD and world together. Both unused HUD canvases were
hidden and measured 1×1 on both routes. These measurements describe the current package and
host together. The performance change cannot be assigned to a single patch. The 60 fps demo
floor remains open. See `.devshots/demo-performance-retest/` for the package and receipts.

The presentation loop now honors an explicit positive frame cap while Auto controls graphics
quality. The focused loop check verified that a 60 fps selection on the integrated route submits
every 60 Hz callback and that Auto still defaults to 30 Hz. The package above was built before
this change.

A native Adventure flight confirmed effective caps of 30, 60 and 30 at 1466×779. Over the three
successive eight-second intervals it submitted 11.49, 19.43 and 22.94 world frames per second.
The scene was still settling during the comparison, so this confirms that the setting was applied
and leaves its effect on actual draw rates unresolved.

With the CPU profiler and footage recorder running, the presentation callback accounted for
59.9% of the sampled wall time. Three's render-list submission used about 5 seconds of sampled
main-thread time over 506 world submissions. The last 64 samples per GPU pass averaged 10.31 ms
for the world scene, 5.01 ms for the composite and 2.83 ms across atmosphere, bloom downsample and
weapon distortion. CPU and GPU work can overlap. See
`.devshots/main-thread-profile/demo-cap-and-gpu-adventure/` for the profile and GPU timings.

Two local-light branch experiments preserved the fixture pixels. Skipping only zero-intensity
slots helped with every slot idle. The actual Adventure capture had all seven local lights active.
A guard after distance and cone calculation changed mixed-light GPU time by about 0.02 ms and
increased all-lit GPU time by about 0.60 ms. Both changes stayed out of the shipping shaders.
The paired native receipts are `demo-local-light-parity` and `demo-local-light-range-parity`
under `.devshots/main-thread-profile/`.

The rebuilt Ashline Dart and Rig base packages no longer matched the renderer's copied package
hashes. Both base hulls now use the generated manifest, through the same path as their LODs.
Bank verification, the exact bound node and single transform ownership still gate admission.
The failing Dart motion-ownership fixture passed after this change, along with 24 related
checks. A native Swarm round-one comparison activated seven batches for 21 hull leaves across
the same three Ashline Darts. This took median draws for those ships from 69 direct draws to
48 direct and seven batched draws. The scenes reached different ticks, and both arms ran near
the 30 fps cap. The cadence effect remains unresolved. See
`.devshots/main-thread-profile/demo-ashline-live/eval-result.json`.

### Rebuilt Windows package

The local unpacked executable in `.devshots/demo-performance-manifest/` includes the Ashline
manifest repair and the Auto frame-cap fix. The standard packaged startup checker passed its
Adventure and Swarm routes, including movement with W and graceful shutdown. The inspected flight
images show ships, effects and HUDs. The app archive SHA-256 is
`620396c07f292290093b37952a49cee04c29552bd0e849e13dcc1d6386076d4f`.

| Public route | World draws/s | Simulation seconds per wall second | Callback p95 | Worst callback gap | Raw gaps over 50 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Adventure | 24.71 | 0.982 | 66.67 ms | 183.29 ms | 90 |
| Swarm round one | 22.25 | 0.952 | 83.33 ms | 233.31 ms | 99 |

The public Adventure Settings route changed the frame cap from 30 to 60, then resumed flight.
The next 12.09 seconds produced 359 world draws at 29.69 draws/s, with 0.979 sim/wall.
These build checks used naturally advancing scenes. The draw count, callback gaps and individual
repairs are measured, and the full-build speedup and demo floor remain open.

In a separate advancing Adventure flight with the effective cap held at 60, the native-scale
intervals drew at 32.36 and 33.68 draws/s. The two intervals at 75% scale drew at 35.48 and 38.39
draws/s. The buffer changed from 1466×779 to 1099×584. Callback gaps still reached 116.60 ms at
the smaller size. The comparison isolates the scale setting within one evolving flight. See
`.devshots/main-thread-profile/demo-warm-render-scale/eval-result.json`.

The focused batch passed 139 cases across settings, admission, draw guards and hull batching.
The Kraken worker fixture now sends the authored Ink Ring recovery, which vents the mantle.
It verifies the exact recovery over the worker bridge, the front core opening, and both cues
clearing when the fight retires. All 18 related worker and renderer checks passed.
