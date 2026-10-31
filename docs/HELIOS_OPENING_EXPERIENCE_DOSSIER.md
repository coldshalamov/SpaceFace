# Helios opening: next-radius experience map

**Date:** 2026-10-31  
**Purpose:** identify the next player-facing integration decision after the three Helios starter-work branches, using the existing mission route rather than inventing a new campaign handoff. This is a source map, not a release or visual-acceptance declaration.

## Read this first

Helios starter work and Campaign 47-A are adjacent, concurrent tracks—not a dependency chain. The opening installs and tracks 47-A on every new run; the current active hull separately determines which local three-ticket book Kessler can post. Settling the local book advances only its own per-hull counter and ordinary mission settlement. It neither unlocks nor settles 47-A. Kessler's current terminal local-work reply already says that “47-A keeps its own account,” but it stops short of telling the player what that already-active account currently asks them to do.

**Recommended next integration:** after the last local starter ticket settles, let Kessler's read-only reply hand the player back to the *current* 47-A/story objective and its existing Mission Log/HUD route—using the existing state and waypoint projection, not a new flag, new mission, reward, or eligibility edge. Be stage-specific and honest: at B0, keep the player on the sample → skim → Helios return; only after B0 has actually advanced does the next authored book send them from Helios to Tethys. Do not imply that three local jobs caused this move.

## What is live in the candidate source

The New Game screen offers Hitch, Pelican, and Wasp as selectable starters, with Hitch the default (`src/data/newGameDefaults.js:59-115`, `src/ui/screens/newGame.js:1-40`, `src/core/newGameBoot.js:58-80`). The board injects only the next ticket for the active hull, at Helios; tickets require their named fit, and the player must accept + track them (`src/data/starterJobs.js:6-53`, `src/systems/missionBoardOps.js:1286-1333`). The three books are alternatives selected by hull, not three mandatory campaign chapters. Their rows share the Helios station/sector destination; step identity and settlement counts are keyed by starter job.

| Active hull / local chain | What the player is asked to do | Motive actually stated | What settlement changes |
|---|---|---|---|
| **Hitch** — Drill Amp; 2u iron each; 420 / 640 / 840 cr. “Cut iron for the berth repairs,” replacement stock at the claim rim, then an outer-seam yard order (`starterJobs.js:8-15`; worksite briefs in `starterWorkday.js:9-15`). | Cut eligible Helios iron; step 1–2 sites are around the inner/claim seam, step 3 is the authored outer seam. | Berth repairs, replacement rails, and the yard need stock. Kessler's line is blunt: “The berth crews need iron, not a story about iron” (`starterWorkdayConversation.js:5-8`). | Ordinary mining/cargo and mission settlement, credits, then the local step counter. No inspected owner ties these ticket settlements to a repaired berth, installed rail, or yard-state change. Treat the supply need as contract motive, not as a delivered world repair. |
| **Pelican** — Heavy-Duty Winch; 40 / 65 / 90 mass lane buoys; 520 / 760 / 960 cr (`starterJobs.js:17-25`; physical specs in `starterWorkday.js:16-25, 106-116`). | Recover 44-C beside the first lane pin; catch the drifting claim-rim buoy; then bring back the heavy outer-yard approach buoy and keep clear of the hulk. Navigation follows the admitted moving body, switches to the Helios berth only while that exact buoy is held by the live attachment, and switches back if released (`HELIOS_BUOY_RECOVERY_ROUTE.md`). | “Those loose lane buoys are somebody’s next bad approach” (`starterWorkdayConversation.js:5-8`). | Normal tow/delivery settlement and local counter. **All three exact paid Pelican receipts now feed the same existing short crawler/gantry receiving operation in the local candidate** (`starterBuoyAftermath.js:1-53`, `stationSideEventDirector.js:219-246`). It selects the newest eligible receipt, deduplicates within the session, and Continue can project only the remaining original 180-second window. This is a temporary receiving vignette, not proof that the whole lane was durably repaired. It is implemented in this review candidate, without rendered visual acceptance. |
| **Wasp** — Ram Plate; Nim Gatecut / Joss Wire / Vex Tollcut; 480 / 720 / 920 cr (`starterJobs.js:27-35`). | Ram the exact named runner, with the plate; guns do not satisfy this writ. The candidate route reader follows the live named mark and exact durable mission slot, or explains missing contact/return-to-Helios (`starterWaspRoute.js:1-40`; mission brief in `missionBoardOps.js:1307-1318`). | “The gate runners have names. The writ names the one we need” (`starterWorkdayConversation.js:5-8`). Third ticket says she has heard about the player; the first two ticket briefs only say the named runner is “running the gate.” No inspected text establishes the runners’ individual motives, relationships, or why the gate needs them removed. | Target/mission settlement, ordinary bounty pay/standing and local counter. No special gate state, campaign faction choice, or unique named-runner aftermath was found. Do not convert the names alone into asserted character arcs.

The candidate Kessler work conversation is deliberately presentation-only: it checks the active hull, existing settlement counter, current fit, and actual posted offer; an open ticket is not a settlement, and changing hulls does not settle it (`starterWorkdayConversation.js:19-52`). The settlement owner writes the starter step number only on mission completion and routes the normal reward (`src/systems/missions.js`, settlement block around the `starterJobStep` update). This is the correct separation to preserve.

## The actual 47-A route and player stakes

1. **Cold Start is already open.** `MissionStoryOps.newGame()` resets story to beat 0, initializes the campaign sidecar, installs 47-A, and tracks it (candidate `src/systems/missionStoryOps.js:2593-2618`; installer at `2327-2369`). It is an installed story mission, not a player Accept action. The contract says 12.4t on accept, mass reconciled to log on delivery, Vale authorization / REF 44-C, and payment pending (`src/data/narrative.js:555-571`). The mission is zero-credit by itself; B0's separate beat reward is 400cr, 4 research, and +5 SCN standing (`src/data/missions.js`, `STORY_BEATS[0]`; grant in `missionStoryOps.js:_advanceStory`). Do not describe that story grant as 47-A payment.
2. **Sample, theft, return.** B0's only inspected recovery trigger is a player mining yield at the marked source; the sample is locked into persistent cargo and the story then asks the player to dock Helios (`missionObjectiveOps.js:76-98`). Eight sim-seconds after recovery, the authored black-Line skim takes exactly 12.4t; two escorts and a cargo drone are reported lost, while their wrecks remain as salvage. If the player docks first, the same skim resolves inline before the dock step (`missionStoryOps.js:1882-1945`). This is the concrete reveal/stake: the player gauges the stolen mass as 12.4t, yet the manifest reconciles to zero and the office withholds payment; it is not a generic starter-job reward.
3. **Only after B0 advances does the next book leave Helios.** The next beat is “Honest Work”; its actual authored order is sealed alloys, Scale 4 variance weigh, then the Ceres furnace detail (`src/story/campaign47a/embodiedMissions.js:131-185`, `src/story/campaign47a/campaignData.js:129-163`). The 6-unit “SEALED ALLOYS — 47-A RESERVE” contract is posted from Helios, receives at Tethys Junction, belongs to MTS, and is accepted/tracked on normal undock from a station (`missionStoryOps.js:2522-2548`; undock hook `src/systems/missions.js:1592-1596`). The contract does not require a local starter ticket.
4. **The paper pattern becomes physical.** At Tethys, the existing Scale 4 worksite asks the player to weigh their own fresh jettisoned pod, compare its stamp to the plate, and keep their freight. The plate reports 94% of true mass and logs the variance as within tolerance (`src/data/kessler.js:1-21`; `src/systems/kesslerScaleWorksite.js:1-70`). The next book contract is a DMC furnace detail at Ceres: clear four repair-mite sites, then tow or fling three ore pods to the open CR-FEED ring; intact deliveries pay, destroyed lots count as losses, and clearing with all cargo lost still advances without cargo pay (`embodiedMissions.js:154-181`). This makes the player's evidence of a silent manifest correction part of a repeatable institutional pattern. It does **not** establish that the named Wasp runners caused it or that Kessler personally authored 47-A.

### Current narrative friction, not yet a fix

- **Local promise vs consequence:** Hitch copy says berth repairs/replacement rails, and Pelican copy says these buoys prevent bad approaches. The source owners establish physical mining/tow settlement and mission pay, but no authored durable repair/rail/lane-state change for those three-ticket chains. Any of the three paid Pelican receipts can trigger the same existing short receiving scene. Keep “paid work for a needed repair” distinct from “the repair is now visibly complete.”
- **Character continuity:** Kessler is a Cargo Registrar whose canonical line says “Weight matches prior haul” while 47-A remains under review (`src/ui/station/barContacts.js:338-345`). The local-work dialogue has a useful explicit separation line but no next-action handback after the last local step. No authored motive says Kessler offers local jobs to move 47-A forward.
- **Starting hull/tooling question—verify, do not call it a deadlock:** Wasp's hull has no mining slot and its selected fit has no Mining Laser (`newGameDefaults.js:93-110`, `src/data/ships.js:98-105`), but the live ship builder's `buildMiningBeam` returns the default Mk.I player beam even when no mining module fits (`src/systems/ships.js:1799-1827`). The exact-source probe was:

  ```sh
  node --input-type=module - <<'NODE'
  import { makeShipEntitySpec } from './src/systems/ships.js';
  import { NEW_GAME_STARTERS } from './src/data/newGameDefaults.js';
  const starter = NEW_GAME_STARTERS.find((row) => row.id === 'starter_wasp');
  console.log(makeShipEntitySpec(starter.shipId, {
    isPlayer: true,
    fittings: starter.fittedModules,
    player: {},
  }).data.miningBeam);
  NODE
  # { tierId: 'beam_mk1', dps: 18, range: 240, directToCargo: false }
  ```

  `mining.js` consumes `player.data.miningBeam`, and B0 accepts a player `mining:yield` at its source without a Wasp-specific fit gate (`src/systems/mining.js:400-407, 494-499, 1350-1356`; `missionObjectiveOps.js:76-98`). This argues against the apparent slot-based deadlock, but it is not ordinary-control/event proof. **Smallest unresolved experiment:** start a Wasp New Game, mine the exact 47-A fix with the ordinary Mine input, observe the real `mining:yield` and sample recovery, then wait for the 8-second skim and dock Helios; separately confirm one ship swap/refit recompute leaves a usable player beam (recompute calls the same builder at `ships.js:2474, 2489-2492`). Do not redesign mining or declare this route blocked unless that test fails.
- **Starting-vessel identity to verify:** fixed cold-open comms say Kael hands over “Tessera” / VHL-4471-T and call it “the 7741 ship” (`src/data/narrative.js:38-74`), while the live New Game selection can instantiate Hitch, Pelican, or Wasp (`src/ui/screens/newGame.js:1-40`, `src/core/newGameBoot.js:58-80`). A fixed vessel name/registration does not by itself contradict a selectable hull class. Check the actual vessel name and registration presented by New Game, the ship UI and the cold open before classifying this as a continuity defect; a Kessler reply should not invent an answer.
- **Objective-card contradiction (narrow reader fix):** In the Mission Log's actual single-command policy, earlier beats are folded into CURRENT ACTION; the separate Campaign rail only persists for final/post-ending continuity. After B1's alloy delivery, with no tracked or active contract or trade route owning that command, the beat-1 reader therefore showed “Take a haul” instead of the authored Scale 4 action. It now asks the existing read-only `kesslerScaleWaypoint` projection, which requires canonical `stepProgress['1'].completed` to contain `alloy_run` and not `scale_4` / `infested`, then reuses its Scale 4 label and instructions. Its existing map word opens the Tethys pad locally when already in that sector, and otherwise focuses Tethys on the star map without a local coordinate or an automatically plotted route. The button decoder now requires a finite, explicit coordinate pair (while accepting explicit zeroes), preventing an absent remote fix from becoming `(0,0)`. The UI adds no mission, reward, pin, beat or sidecar writer. Focused tests exercise the real Mission Log click handler through a synthetic DOM and the shared map authority, plus Tethys/Helios routing, tracked/trade/tutorial precedence, coordinate edge cases and preservation of campaign progress and the pilot pin; the map authority still owns its normal transient UI intent. Rendered visual acceptance remains open.

## Concrete next integration: a truthful Kessler handback

After Kessler confirms the third local ticket settled and the local book has no later step, extend the *reply only* to name the already-live story task and direct the player to its existing route/mission card. Reuse the current tracked 47-A/story projection for objective text and target/sector, rather than rebuilding objective logic in the conversation. At minimum:

- If B0 is open, say it is still open and point to the live sample/skim/Helios-return stage; never say that local work completed it.
- If B0 advanced and B1 is current, name the actual “Weigh-In — sealed alloy delivery” / current Scale 4 or furnace step as state dictates; the Helios departure from B0 to Tethys is the campaign's existing sequence, not a starter-job unlock.
- If no current 47-A/story action is available (finished/legacy/malformed state), fall back to Kessler's existing generic board line. Do not fabricate a mission, accept it from dialogue, award credits, advance a story beat, repair world objects, or add a saved progression key.

**Acceptance gaps:** verify a normal-docked Kessler conversation after each chain's third settled ticket; assert exact live objective + destination agree with Mission Log/HUD, story counters/mission ownership/payouts are unchanged by talking, and an active or wrong-hull local ticket remains un-settled. Exercise B0 still active versus B1/Beyond so “next” is not a stale string. Run the Wasp B0 ordinary-control event experiment above; do not treat the code probe as gameplay proof. Check the actual presented vessel name/registration against the cold open; a different selected hull class alone is not proof of contradiction. Keep rendered play, readability, and full Save/Continue as explicit acceptance gates; focused component reports do not prove those outcomes.

## Existing placed/present assets (identity/path audit only)

- Helios Station is an SCN station in `sector_helios_prime`; authored `place_station_trade_hub` at `(1280,-420)`. Helios' starter claim is a 42-rock field with three authored iron-bearing boulders exactly at the first/second Hitch ticket centers and a third at the rim; a separate outer metallic field exists (`src/data/sectors.js:55-103`; `src/data/sectorAnchors.js:26-52`). Existing corridor props include tutorial `place_lane_beacon`, lane pin, tally post, claim mark and locker. The second and third Hitch sites are positions/field guidance, not newly authored scene packages.
- Pelican's mission creates the buoy as an ordinary dynamic payload and attaches existing `places/place_lane_beacon.glb` presentation identity (`src/missions/starterWorkday.js:106-116`); the place GLB and nav-buoy render package already exist under `assets/ships/release/`. No new buoy model or body type is needed.
- Tethys has existing Scale 4 pad/readout worksite placements (`place_freight_platform`, `place_inspection_platform`, `place_tally_post`, `place_container_rack`; `src/systems/kesslerScaleWorksite.js:17-45`), and the Helios/Tethys map-card and station images are present. New Game hull poster paths for Hitch/Pelican/Wasp are wired in `src/ui/hullPosters.js:19-22`, with corresponding files under `assets/ui/renders/hulls/`.

These references establish inventory and code wiring only. No visual asset inspection or rendered player-route capture was performed here; no quality claim follows. Local agents retain model/asset production. The existing opening report and Helios route notes remain the evidence for their scoped fixes; this dossier neither replaces them nor closes the original larger twenty-concept scope (`docs/OPENING_INTEGRATION_2026-10-31.md`, “Continuing goals, not completion declarations”).

## Status and source caveat

The sparse candidate contains the Kessler starter-work conversation, Helios route readers, the all-three-ticket Pelican receiving extension, and the prior route notes. The receiving extension is implemented and its focused integration checks passed, but it has no rendered visual acceptance. `HELIOS_BUOY_RECEIVING.md` now documents all three returns; GitHub publication and exact commit identity are tracked in PR724 and the accompanying delivery receipt. The supplied current-master ref `d95d9187848f58f82c4b0f89d8493ab632ebeb59` was checked directly for the relevant starter-job / mission-board / 47-A route source. The core `starterJobs.js`, board injection, and B0/B1 embodied route are present there; the candidate-only `starterWorkdayConversation.js` and `starterWaspRoute.js` are not present at that master ref. Therefore this dossier describes the candidate's implementation boundary, not a merged/master-shipped experience. The materialized checkout has no usable Git `HEAD`; the master check was a read-only exact-ref file fetch. The Finish Lane 3 README/board is also absent from this snapshot, so no Lane 3 completion state is inferred.

## Follow-through: character handback implemented in the candidate

The recommended Kessler handback above is now implemented for a single provable
active B0 recovery, B1 alloy delivery or B1 furnace-detail record after the local
book settles. It preserves player-owned pins and does not advance or accept story
work. The shared Mission Log objective now puts B0 recovery before return; it reads
the actual sampleRecovered field rather than quoting a potentially stale waypoint.
For the B1 furnace detail, the shared objective now names both independent work legs:
clear the four marked repair-mite sites and account for the three marked ore pods,
showing CR-FEED receipts and losses separately. It only recognizes the authored
version-1 Ceres work order, uses mission-owned counters without calling the mutating
worksite focus, and leaves current target/phase selection with the live waypoint owner.
Kessler now quotes the same corrected objective for that exact authored record; legacy
or malformed records still fall back instead of inventing a route.

The recap makes no claim that received pods equal payment or that accepting the
contract settles it. The authored owner records three pod outcomes: received pods
earn proportional cargo pay, destroyed pods count as losses, and three accounted
pods plus four clear sites advance even when all cargo is lost. The player-facing
line reports those independent facts without forcing an order between the two legs.
Kessler does not invent an active contract during Scale 4's between-contract
state; the Mission Log now guides that step directly through its existing waypoint
projection, without an invented unlock.

The focused author/counter/settlement, B0/handback and starter-workday reader suites
pass 45/45 across four test files; the new seam test uses the real CR-FEED intake event,
missions listener, loss recorder, and worksite settlement owner. This does not close
the ordinary-control Wasp sample experiment, rendered dialogue readability, full
Continue, or default-route visual acceptance.

## Ceres completed-work inspection

After the authored B1 furnace detail settles, the existing station-side event director
can stage one short, budget-free repair-drone inspection at the visible Ceres Refinery.
It reuses the existing hull-crawl crawler/stitch VFX and gantry-slide consumer where
authored arm nodes are available;
it creates no cargo or entity and writes no durable repair, mission, payout, or progression
state. The scene is keyed to the exact completed Ceres mission receipt and the single
version-1 retired furnace ledger, requiring three unique slots with exclusive received/lost
outcomes and complete accounting. Full 3/3, partial 1–2/3, and all-lost 0/3 settlements all
qualify—the last may have zero cargo pay. The existing settlement toast remains the readable
count/pay record; this transient visual is an inspection, not unloading and not a claim that
context metadata is visible. A queued unseen inspection can retry after a sector exit while
the original 180-second sim-time window remains; Continue reprojects only the remaining
window, following the director's transient-scene convention.

`test/ceres-furnace-aftermath.test.mjs` runs the actual authored mission, CR-FEED intake and
loss settlement, mission cleanup/retirement, receipt reader, station director, and the existing
gantry/VFX consumer seam for full, partial, and all-lost results. It also covers invalid/stale
receipts and ledgers, Ceres anchor/sector and ordinary visibility/mode gates, dedupe, exit retry,
and Continue reprojection. The articulation test supplies a representative gantry
node; it does not establish the current Ceres GLB node inventory or rendered result.
This is source/native-component evidence, not rendered route or visual acceptance.

## Scale 4 integration verification (earlier checkpoint)

The integrated set now passes 240 opening tests, six production imports and 12
unchanged Mission Log regression cases. The unchanged repository UI import/check
script was fetched from candidate parent 0620bc78 and passed 55 checks with zero
failures; it is verification context, not a shipping modification. Synthetic-DOM
mount/click coverage is not a screenshot or normal-flight weighing proof.

Only the shared helper import, coordinate decoder and beat-1 action block changed
in Mission Log. The target block was verified unchanged at upstream b68493ff;
newer CSS-ready/deferred stylesheet changes outside this patch must be retained
when integrating. The candidate snapshot must not replace the newer whole file.

## Current Ceres increment verification

257 integrated opening tests, 34 unchanged Mission Log/publisher/domain regression
cases, six production imports and 55 UI import/check assertions pass. The local
read-only preload check passes (44 main plus 1,509 source-closure entries), with no
index rewrite. The older Helios fixture now supplies the real Ceres imports; no
production guard was retained merely to accommodate an extracted-source test.
Normal flight, rendered Ceres articulation, full Continue and release acceptance
remain open; the native scene does not imply durable repair or cargo restoration.

**Asset boundary:** the release refinery GLB SHA-256 is
`c5600c29dfeedc1a00feabb3104ecdd4259ac5a7d83f47fb9a94092319ceeada`; its render
package SHA-256 is `b6adca2a05a282355f2eb73f9048a5103d1dc6376098d19d106293fcc25d3aa1`.
Both contain `MOTION_REFINERY_CROWN` / `MOTION_REFINERY_SCAN`, but neither contains
a named gantry. The actual mechanism follows boundary → authored root → part root →
package root, beyond the direct-child scan used by `infrastructureMotion`; recursive
`/arm/` matching would also catch `Armor/Lights_Warm` and is not safe. The earned
scene is currently the bounds-projected hull-side repair/scan VFX (`stationOperationVfx`
40–60), not a physical drone, unloading, or gantry movement. The test's representative
gantry node and source seam do not establish the release GLB's mechanism or rendered result.

## Next authored mission: B2 Registry Writ and Elroy

The next authored objective after B1's Ceres furnace settlement is not a direct Ceres →
Elroy jump. Canonical beat 2, **First Blood**, first sends the pilot to the **Tethys board**
for Cinder marks. Rook's authored instruction is Cinder → Compost → the Nest → the register
(`src/story/campaign47a/embodiedDialogue.js`; `src/story/campaign47a/campaignData.js`). The
Cinder writ is an ordinary three-Wasp clear plus a real marked-wreck tow to Rook in Charon;
the Compost step requires player-fed visible growth; the Nest requires its retained encounter
outcome. Once those ordered steps are recorded, the story waypoint returns to **Tethys** for
the **Registry Writ**. Normal undock from that board accepts the next authored contract and
normal Charon sector entry spawns its target (`missionStoryOps.js:_activateBookContractOnDeparture`,
`missions.js:dock:undocked`, `missionStoryOps.js:_onSectorEnterSteps`,
`missionSpawningOps.js:_spawnTargetsFor`).

### Cinder: live Rook intake control feedback

The first required Charon return now gives the pilot actual **load** arrival feedback
through the existing tracked-flight objective: hull distance outside Rook's 100-WU ring,
hull world speed against the existing 8-WU/s limit, and a specific brake/bring-inside state.
This closes a control gap: target/contact closing speed is relative to the cockpit, and
navigation distance is cockpit-to-pad; a player and hull co-moving at 12 WU/s can show
zero closing speed while Rook correctly refuses the load.

`cinderRoute.js` projects only an unresolved canonical marked hull on the current
player-owned active attachment, with matching endpoint occupant generations and wreck
provenance. The successful held-load path uses direct entity/attachment lookups, not an
additional entity census. Numeric feedback is local to flight within 600 WU of the pad;
remote, docked or non-finite readings keep instructions rather than fictitious telemetry.
The outside gap and displayed speed round upward, while status uses the exact unrounded
`rookDeliveryCheck`. “Inside and slow enough — hold for Rook” does not claim settlement:
no sale, reward, negotiation, material retirement or campaign progress is written here.

The normal `missions.update` Cinder driver refreshes the tracked waypoint each simulation
update, and the existing `flightDestinationSurface` consumes its changing reason. Six
new behavior tests exercise authored board acceptance, real combat kills and aftermath
wrecks, native attachment creation, native mission update and visible-reader text, exact
arrival thresholds, co-moving cockpit/load, stale/NPC/broken attachments, invalid material,
locality, and native aftermath serialization/rematerialization followed by reattachment.
Both original Rook suites and the original Books 0–2 route suite pass unchanged (45 Node
tests total, with the Books suite also asserting its five complete route cases).
This is native source/reader evidence, not a rendered flight or full Continue acceptance.

### Compost: find real feed, then return to the living receiver

The live Book 2 continuation now connects material acquisition to the existing Rookside
Receiving Garden. It does not activate the external-only `921-scene-compost-run.js`
vignette or introduce another scene, source, cargo, reward, or save owner. After Cinder
files (three clearances plus a real Rook delivery, or the canonical all-lost/stripped
result after clearance), the existing
story waypoint reads the player's current opportunity rather than always pointing at
an empty-handed arrival at the garden.

A valid current player attachment carrying any material the garden owner actually accepts
points back to the receiving approach, including imported loads whose origin ledger is in
another sector. Current physical position, not historical provenance, establishes locality. Otherwise free usable ordinary cargo stays on that return route, with an actual
jettison quantity and the instruction to catch the pod with the Line and put it into the
living mat. Jettison alone is not credited as growth. Without carried material, the route
first locates a real eligible loose aftermath hull or player-jettisoned pod; after a
successful Cinder sale, either unsold survivor can be that source. Only when those options
are absent does it point to a real Charon iron face. The shared existing field reader sees
both live and dormant records; depleted, stale, foreign, unknown-resource and anchored
records are not invented supplies. A dormant face is a location, not a live control target.
The pilot remains free to use other valid material; these recommendations do not gate intake.

Material eligibility and actual remaining edible mass come from the registered
`understoryGardens` read wrapper and its existing `aftermathWrecks` / `lootShards` providers.
Cargo availability uses cargo's reservation reader, and the pod's actual physical mass—not
its edible mass—is checked against the existing fitted-ship tow-capacity reader. Loose
material is offered as an approach-and-acquire opportunity, not a guarantee that a latch
can pass through intervening terrain. Missing providers, an unsuitable fit, unavailable
beam/hold capacity, and exhausted fields produce an honest prerequisite/search state.
Arbitrary decorative or site bodies are not advertised as supplies merely because their
type appears edible. No source is reserved, spawned or consumed by a route read.

The return point follows the real receiving hull's current pose plus its existing west
outside-mouth offset. It never binds autopilot to the garden centre; an invalid live pose
provides no navigation promise. Held-load guidance reports the load's distance outside
the actual living mouth. Player local pins, trade routes and onboarding navigation survive
both normal refresh and the earned Nest handoff. The original garden owner still consumes
the physical material, grows the retained living mat and records first visible player
growth. Initial 52 biomass is not player feed: 17 ordinary iron units contribute 13.6t,
bringing biomass to 60.16 and stage 2. That opens the Nest; it does not pay the separate
240t Compost Run. Partial feeds, the cumulative run, destroyed-receiver regrowth from zero,
and prior growth receipts remain with their existing owners.

The intake's old generic raw-mass fallback also admitted other owners' protected bodies.
A native CR-FEED mission pod and a promoted asteroid with a live resource ledger reproduced
silent deletion and garden credit without their owners retiring anything. The garden now
uses one local refusal predicate for both read availability and the generic consume branch:
foreign persistence/runtime/world/resource/field/mission/site/custody identities and
protected flags are not meals. Existing aftermath and cargo delegation remains unchanged,
and genuinely unowned held material stays usable. Native Understory caches retain their
open owner-record/entity/generation validation and existing resolved-orphan ordinary-mass
path after owner normalization, without another cache-return reward. Bare cache tags,
conflicting ownership, copied/stale active identities and duplicate restored identities do
not bypass the guard. Compatibility boundary: the old save format has no independent cache
authenticity token, so a unique byte-identical forged orphan save cannot be distinguished
from a genuine orphan here. No new persistence schema or authenticity claim was added.

Native regrowth testing exposed two older owner defects on this same route. Reseeding
looked for a nonexistent `understoryConsumed` prey stamp after the real owner had already
consumed the load; it deleted the regrown body while leaving growth progress behind. The
existing digest now returns its successful commit count, which the one-prey reseed uses
without a second consume or a new saved flag. A refused commit leaves the original load
and destroyed lifecycle intact. Separately, a rebuilt or restored garden lost partial paid-run
credit when its transient run row was reconstructed at zero. That row now starts from the
finite nonnegative canonical `compostFedMass` body stamp, then adds only actual new feed.
The native 4 + 16 + 16 + 204 tonne sequence across destruction and owner restoration reaches
240t and emits exactly one 2,880-credit intent; further restoration and feeding do not repay.
Missing or malformed stamps invent no prior mass. No compensating rewards were introduced.

Implementation: `src/missions/compostRoute.js`, the Book 2 branch in `missions.js`, the
read-only wrapper and bounded intake/continuity corrections in `faction_understory.js`,
and a minimal extraction of the existing
field selector in `starterWorkday.js`. Native component tests exercise Cinder settlement,
actual finite-rock mining and cargo acquisition, real attachment/jettison/digestion,
canonical growth and the normal mission-update/HUD Nest handoff, as well as
owner serialization/rematerialization and retained receipt projection. These are source,
owner and visible-reader checks, not rendered flight, physical trajectory simulation or
full browser Continue acceptance. The released dead-hulk and existing infestation props
continue to own the garden's picture; no model or render path was changed.

### Elroy register route

The live Elroy contract is `type: bounty_hunt`, story tag `campaign47a:b2:elroy`, target
`npc_elroy` / `register_mark`, zone `zone_charon_ambush` (Ashfall Approach), and receiving
station `station_expanse` (`src/story/campaign47a/embodiedMissions.js`). This is separate from
the retained/parallel `rescue_under_fire` pod-rescue route; the B2 route classification and
story-spine comments explicitly keep the pod pull's lifecycle distinct from the authored
register writ (`missions.js:campaign47aRouteKind`, `missionStoryOps.js:_advanceEmbodiedStoryMission`,
`storySpine.js:maraLine`). The Elroy contract's order asks for a scan first; after the registry
identifies the civilian maintenance vessel, the player chooses fire or to reel Elroy inside
sixty. The alternative is a live custody/force choice, not a new mission or inferred motive.

**Concrete route mismatch and bounded correction:** the old B2 mission waypoint combined the
live target's position and identity with the mission's inherited `station_expanse` anchor.
The actual HUD resolves station first, so its arrow landed at the Expanse Refinery instead of
Elroy at Ashfall Approach (zone center ≈ `(-980, -540)` local, versus refinery ≈ `(880, -640)`;
the target zone radius is 720 WU). Mission Log had the same inherited-station problem, and its
map resolver would backfill `mission.destStationId` whenever the handoff retained `missionId`.
The B2 waypoint now projects a moving target only when the active spawned/restored slot-zero
entity has the authored Elroy id/role, exact mission ownership, finite coordinates, and no
conflicting sector provenance. Its target fix is stationless; with no verified contact, the
route honestly marks the Ashfall search area in Charon, or gives sector guidance when away.
Mission Log consumes that explicit target/search intent without handing the map resolver a
mission id that would silently select the refinery. The chart centers on the target/search fix;
this bounded handoff does not create a separate Elroy inspector selection. Board and return
station waypoints remain station-addressed. No scan, kill, custody, settlement, deadline, reward,
or generic bounty owner changed.

`test/contract-47a-b2-navigation.test.mjs` verifies the actual Tethys offer/departure and
Charon spawn path, the HUD station-first consumer before/after scanner identification and while
Elroy moves, the Mission Log map handoff and actual map target resolver, search fallbacks for
missing/dead/recycled/wrong-identity/non-finite contacts, Continue adoption under a new runtime
id, a terminal contract, and the separate Tethys Cinder/Registry board waypoints. Existing B0,
Scale 4, Wasp, and Pelican readers remain separate regression gates. This is native source/reader
evidence, not a rendered playthrough or visual acceptance.

B2 restoration review found that a cloned-data Continue fixture concealed a real durable-record
boundary: world records retain mission/slot identity but omit `storyTargetId`/`storyTargetRole`.
The existing mission-target identity writer now restores only missing Elroy dressing for the
canonical active Registry Writ slot-zero record, authenticated by its original mission owners,
identity key, deterministic world record id, and sector provenance before generic restamping.
Present conflicting story metadata remains untouched and fails waypoint validation. No record
schema or waypoint predicate was widened. The regression test now captures the real target,
rematerializes through `world._spawnFromDurableRecord`, adopts via `save:loaded`, and checks
moving HUD/map focus before and after scan plus duplicate restore and foreign/conflicting identities.
This remains source/consumer integration evidence, not physical Continue or rendered acceptance.

A canonical retained record with one stale owner tag can recover after the existing generic
writer repairs that tag and a later authenticated pass restores dressing. This is not a
foreign record: truly foreign keys/record ids/slots remain rejected across repeated callbacks.
