# G10 recon — the first ten minutes against today's code

Packet: `design/program/fleet/packets/RECON-G10.md` (Lane 2, read-only research — no code edits).
Spec: the Director's amendment in the EC-G10 brief
(`git show origin/experience-commissions/EC-G10-the-first-hour-is-already-the-game:design/program/experience-commissions/commissions/shared/EC-G10-the-first-hour-is-already-the-game.md`),
Book 0 "Cold Start" (`design/game/16_THE_STORY_SHOWN.md`), and
`design/game/19_WHAT_PLAYERS_EXPECT.md`. Handoff checked: `.dev/pr-expansion/HANDOFF.md`.

Method note: this is source tracing only — Node/grep research per the packet. No game, browser,
or Electron run was performed, so every "the player sees" claim below is derived from the ordinary
route's code path (New Game → `newGameBoot` → registered systems), not from rendered proof.
Nothing is credited merely because a flag, event, or test-only path exists.

---

## 0. The amended ten beats and the title

The Director's sequence (EC-G10 amendment):

1. Spawn with the 47-A sample rock marked and one premise caption.
2. Twenty seconds of thrust and brake.
3. Latch, reel, cut.
4. Swing the rock through the derelict.
5. Raid: fling the raider into a rock.
6. Claimed salvage: take it or leave it; if taken, outrun the search.
7. Mine the sample.
8. The Skim as a visible scene — the black-line ship takes the tow, escorts die on screen.
9. Kessler's line, with a face.
10. Dock at Helios into Lamps-Up; Orla's lamp is the first town job; the alloy run to Tethys is
    the recommended contract.

Moves out of the opening: shooting drills, `missingThree.js`, and the five powers
(`powerSituations.js` — Pull, Shove, Pin, Bomb, Rig) go to minutes 15–40.
Title: Adventure and Swarm side by side; New Game uses defaults with Custom behind one button;
first trip is Tethys, not Ceres.

## 1. What a fresh New Game actually runs today (route trace)

- Title `src/ui/screens/mainMenu.js`: a single verb ladder —
  `['continue','swarm','newGame','load','crucible','settings','quit']`
  (`titleVerbOrder()`, mainMenu.js:357-359). Swarm is one word in the ladder with gloss "One press
  to round one — the horde arena" (mainMenu.js:349,428). There is no "Adventure" word — New Game
  *is* the adventure entry.
- New Game → `src/ui/screens/newGame.js`: the full custom form every time — pilot name
  (default 'Wren', newGame.js:433), three starters (Hitch/`ship_kestrel` default,
  newGame.js:40,445-454), difficulty dial, seed + "New seed", Back/Launch. Launching untouched
  emits the exact default payload (newGame.js:38-40), but the screen itself is the custom form —
  there is no defaults-direct one-press start.
- Boot `src/core/newGameBoot.js:57`: every new game calls
  `spawn47aOpeningScene({ state, helpers, liveColdStartSafe: true })`. That plants the physical
  47-A field at spawn: `evidence_spindle_47a` at (92,0) — a real 960-mass tetherable payload
  whose manifest lies at 480 (`47aLiveScene.js:67-121`, falseMassKg/manifestMassKg at :102-103) —
  the `carrier_wreck_bourse` hulk at (340,220) (:155-176), a civilian pod at (-180,160) (:284-298),
  a `kessler_handoff_beacon` at (282,-198) (:300+), and a dormant cast: scavenger
  interceptor/harasser/thief held ~1.8–2 k wu off-field (`markLiveColdStartDormant`,
  activationBeat 'scavenger_arrival', :204-258) plus a recovery tug (:261-282).
- `main.js:100,154` loads `src/data/scenarios/47a.scenario.json` for every boot;
  `src/systems/scenarioRuntime.js` drives the dormant cast through contract beats
  (scavenger_arrival 75–165 s etc.). Arming requires all of: the player has *tethered the spindle*
  (`noteSafeOpeningTether`, scenarioRuntime.js:265-274), story beatIndex ≥ 1, player >1200 wu from
  Helios (:297-313), inside the beat window (:186-200). Nothing on the ordinary route ever points
  at the spindle — the whole scenario cast is a dormant easter egg during the tutorial.
- The B0 contract auto-installs, tracked, at new game: `_installContract47aColdStart`
  (`missionStoryOps.js:2530-2573`) — 'Contract 47-A: Mass Variance Sample', `salvage_retrieval`
  for `cmdty_47a_assay_sample` (massAccept 12.4 t). It deliberately does NOT take nav while the
  tutorial owns the opening waypoint (:2568-2571).
- Onboarding `src/systems/onboarding.js` starts on `game:started` for fresh games, waits out the
  first-run splash, then walks `BEATS` (:310-393) in this order —

  **tether → raid → claimed → thrust → brake → marker → focus → burst → disengage → seam →
  dock → choice** —

  with a 4 s silence gate between beats, the rescue verbs interleaved (`RESCUE_GATE_ROUTE`
  :435-439: `swing` gates `raid`, `shove` gates `disengage`, `grab` gates `seam`), and the
  missing-three verbs plus power situations (Pull/Shove/Pin/Bomb/Rig,
  `src/onboarding/missingThree.js`, `src/onboarding/powerSituations.js`) riding the same gaps.
- Accepting any real work at the `choice` beat ends the tutorial (`_finish()`); only then does
  mission nav release and the **'47-A Recovery Site'** waypoint appear
  (`missions.js:2529-2549`). The player then undocks, flies to the marked rock, mines the assay
  sample (`mining:yield`, embodiedMissions.js:122), waits 8 s for the Skim text
  (`_stepContract47aSkim`, missionStoryOps.js), flies back, docks, and B0 completes — B1 posts.

So today's first ten minutes are a 12-beat drill rail with the story's verbs scattered through
it; the 47-A field physically surrounds the player but is never named, pointed, or claimed.

## 2. Beat-by-beat findings

### Beat 1 — spawn with the 47-A sample rock marked + one premise caption → **partial**

- Premise caption **exists**: `COLD_OPEN_PREMISE` — "Contract 47-A: the manifest says one mass —
  your instruments say another." (onboarding.js:443), fired as tracker caption 'premise' at beat
  start (:1959-1964; captions live 12 s beside the objective, :451-452).
- Sample marked **partial**: missions binds the nearest mineable asteroid as the sample source
  and can label a '47-A Recovery Site' waypoint (missions.js:2529-2549), but onboarding owns nav
  during the tutorial (missionStoryOps.js:2568-2571), so the mark is invisible at spawn. The
  physical evidence spindle sits 92 wu from the player (47aLiveScene.js:130) but nothing points
  at it. What *is* marked at spawn is the tutorial's own spawned tether derelict.
- Blockers: two parallel systems in one field — the tutorial's props vs. the dormant scenario
  cast — with the marker on the wrong one.
- Smallest build (existing owners): at `_installContract47aColdStart`, let the B0 waypoint share
  or precede the opening objective (or have onboarding's first beat mark the bound sample rock —
  `_resolveContract47aSampleSource` already returns it). One pointer swap, no new system.

### Beat 2 — twenty seconds of thrust and brake → **partial (exists, wrong place, wrong shape)**

- Exists as drill beats 4–5 of 12 (onboarding.js:338-347): 'Thrust until speed passes forty',
  'Brake below ten' — two gated drills arriving *after* tether/raid/claimed, not a free
  20-second stretch of flight near the top.
- Smallest build: reorder `BEATS` (the table is authored data at :310-393) so thrust/brake open
  after the mark; optionally soften to a single timed free-flight beat. Onboarding owns it.

### Beat 3 — latch, reel, cut → **exists**

- Beat `tether` (onboarding.js:311-321): 'Target the marked derelict' → latch → 'Winch in. Hold
  tether to reel' (taught with the live key chord, :409-415) → 'Cut and coast.' `_spawnDerelict`
  stages a real derelict with a 900-mass rope load. The signature verb leads — matches the
  amendment's intent; only the target is a tutorial prop rather than the spindle.

### Beat 4 — swing the rock through the derelict → **exists**

- Rescue verb `swing` (src/onboarding/rescueOpening.js + onboarding.js:2881,435-439) runs right
  after the first attach and gates `raid`: the staged rescue cast (loose rock, derelict, wall,
  scout, pod, beacon) is built for exactly this — swing the rock into the derelict. Fallback
  rung `swing_do_not_pull`. Completion is read from live positions/velocities, not a flag.
- Note: it's staged rescue-cast content, not the carrier wreck — fine for the verb, and
  arguably already the amendment's beat 4.

### Beat 5 — raid: fling the raider into a rock → **exists**

- Beat `raid` (onboarding.js:322-329): 'Latch the raider. Swing him into the rock.'
  `_enterRaidBeat`/`_spawnRaidCast` stage a real hostile `reaver_pirate` 'Claim Jumper' (hull
  150, mass 220, shield 0, unarmed/crippled), a throw-target asteroid downrange, a 'Nervous
  Hauler' for dressing, and an optional wing. Throw-kill vs. gun-kill are tracked separately —
  the gun path is deliberately the slower refusal.

### Beat 6 — claimed salvage: take or leave, outrun the search → **exists**

- Beat `claimed` (onboarding.js:330-337): 'Claimed salvage. Take it anyway, or leave it.'
  `_enterClaimedBeat`/`_spawnClaimedCast` stage three salvage pickups plus a lawful
  patrol/cutter witness; taking emits a real law incident via `lawSecurity.reportIncident` and
  the player outruns an actual WANTED search ring — 'You're marked. Outrun the search ring.'
  Leaving is a valid choice (120 s claim window times out and the rail proceeds).

### Beat 7 — mine the sample → **partial (verb taught early; the 47-A sample lands after the first dock)**

- Tutorial `seam` beat (onboarding.js:371-378): 'Pulse the scanner' → 'Beam the bright seams' on
  a tutorial rock (`_spawnMiningRock`, yieldU 3) — generic ore, not the assay sample.
- The actual `cmdty_47a_assay_sample` is mined later at the Recovery Site under the B0 contract
  (embodiedMissions.js:118-128 — mine → skim → dock as `ordered_and` steps). On today's route
  that is: finish all 12 beats → dock → accept work → undock → fly out → mine.
- Blocker: the sample waypoint is suppressed until `tutorial:finished`, so the design's
  "mine before the dock" ordering is structurally inverted.
- Smallest build: make the bound sample source *be* the seam beat's rock — spawn/mark
  `_resolveContract47aSampleSource`'s asteroid as the mining target and let its yield carry
  `CONTRACT_47A_SAMPLE_ID`. Onboarding + missions already own both halves.

### Beat 8 — the Skim as a visible scene → **missing (exists as text + data only)**

- `missionStoryOps.js` `_stepContract47aSkim`: 8 s after `sampleRecovered`, emits kill-feed rows
  + a strain popup + a toast, spawns battlefield wrecks ~140–210 wu from the player, sets
  `contract_47a_skimmed` with skim mass 12.4 t. `_resolveContract47aSkimForDock` resolves it
  inline if the player docks first.
- No black-line vessel entity ever spawns; the escorts never exist as actors before their
  "deaths"; the wrecks appear where the player may not be looking. Per the packet's own warning,
  text about unseen ships does not count as the scene.
- Smallest build: `missionStoryOps` already owns the timing, the skim-mass bookkeeping, and the
  wreck spawn. Add actors through the same owner — spawn one black-line ship + two escort
  hulls in the recovery field at skim time (spawnEntity is already available via helpers),
  fly the take in view, kill the escorts through real damage so the feed is true. Scenario
  runtime's dormant `official_recovery_tug` actor (47aLiveScene.js:261-282) is the natural
  existing hull to reuse or mirror — but it must be visible staging, not just an activation.

### Beat 9 — Kessler's line, with a face → **missing on the ordinary route**

- The line exists: `comms.47a.b0.primary` — 'Sample the variance. Run the lane home. Dock
  Helios.' (embodiedDialogue.js:83). But `story.js:387` fires `primaryCommsForBeat(toIndex)` only
  on `story:beatAdvanced` — and the run *starts* at beat 0, so toIndex 0 never fires. The
  authored line never plays in the opening. What the player gets instead is the tutorial's
  premise caption — right words' spirit, wrong channel, no speaker.
- The face exists only as assets/data, none of it on this route: `comms:popup` renders sender
  name + text only (ui/comms.js:442-445); contact cards default `portrait:false,
  hudPortrait:false, visorMotif:false` (embodiedDialogue.js:17); `contact_kessler` is a bar
  contact at `station_tethys` (:62), reachable only once B1 sends the player there.
  `assets/portraits/portrait_kessler.jpg` exists, and `src/ui/screens/codex.js:1118-1124` already
  resolves canonical portraits — the art and a portrait-resolving precedent both exist.
- Smallest build: (a) emit the authored B0 line at cold-start install — one `_fireComms` /
  `comms:popup` through `story.js` or `missionStoryOps` at install time, sender KESSLER; (b) for
  the face, the honest smallest surface is a portrait-capable comms card — comms.js is the
  owner; alternatively stage Kessler as a hailable presence at Helios in B0 so the existing
  bar/contact portrait path carries the face. The second half is the only piece in this whole
  packet that has no existing rendered surface to reuse in-flight.

### Beat 10 — dock Helios → Lamps-Up; Orla's lamp first town job; alloy run to Tethys → **partial**

- Dock at Helios **exists**: beat `dock` (onboarding.js:379-383) → `choice` at the same berth
  (:384-392), ending the tutorial on any accepted work.
- Lamps-Up as a seen scene **partial**: committed code owns the Lantern Ward worksite at Helios
  — `src/systems/lanternWardWork.js` + `src/data/lanternWard*.js`, an attended `npcJobsRuntime`
  job around lantern hardware. The authored "windows come up in sequence, Orla Venn's first,
  once per lamps-up" scene exists ONLY in untracked foreign WIP: `src/systems/plants/pl230VennsWindow.js`
  (PL-230; 'Orla Venn's window — first lit, last dark', scan label at :173). The whole
  `src/systems/plants/` directory is uncommitted and not registered — do not build on it without
  checking with that lane; it is exactly the intended owner when it lands.
- Orla's lamp as first town job **missing** in committed code: no Orla entity, hail, or job
  exists — the nearest lamp job is Nessa's 'FIT CONTACTS' repair briefing
  (`lanternWardGuidance.js:27`: bring one ELECTRONICS unit, match speed alongside Nessa, hail
  her). A lamp-adjacent town job exists and is offered by proximity; it is just not Orla's.
- Alloy run to Tethys recommended **partial/mismatched**: the B1 book *does* post
  'Weigh-In — sealed alloy delivery' Helios→Tethys, 6u alloys
  (`embodiedMissions.js:142-158`, storyTag `campaign47a:b1:alloy_run`) — but only after B0
  completes, i.e., not the first recommended contract. Today's first recommendation is the
  `choice` beat's authored run: 'First trade: 8u Fuel Cells to Ceres'
  (`FIRST_TRADE_CONTRACT_DEST_STATION_ID = 'station_ceres'`, economyContractTemplates.js;
  onboarding.js:384 comment "the authored Ceres run plus three side-by-side offers"). Design
  says Tethys.
- Smallest build: retarget the first-trade constants to `station_tethys` /
  `sector_tethys_junction` (data change, one owner) — which also aligns the first trip with the
  B1 alloy run's destination; Orla's job waits on the plants lane or a lanternWardWork reskin.

## 3. Blockers and ordering problems (cross-beat)

1. **Two openings overlap.** The tutorial rail and the dormant 47-A scenario cast occupy the same
   spawn field; the tutorial owns nav/objective/voice and never names the spindle. The 12.4-tonne
   premise prop sits 92 wu away, claimable, unwatched.
2. **Ordering inversion.** Design order = sample → verbs → Skim → Kessler → dock. Today =
   verbs/drills → dock → work → sample → Skim-text → re-dock. The single structural fix is
   letting B0's nav/objective live during the rail and making the seam beat mine the bound
   sample.
3. **Drill mass in minutes 0–10.** `burst`, `marker`, `focus`, `disengage` (the shooting drill
   block, :348-370), the missing-three verbs, and the five power situations all run inside the
   first rail. The amendment wants them at 15–40 — the table order is the edit surface.
4. **Popup/silence pacing.** Splash gates beat 0; a 4 s silence gate sits between every beat;
   tracker captions run 12 s. None of this is a defect, but any reorder must keep the gate or
   the voice stacks.
5. **Skim has no actors.** Beat 8 is currently a feed event with spawned wrecks — the largest
   single gap against the amendment.
6. **Kessler unreachable.** B0 primary line never fires; the contact lives at Tethys.
7. **Foreign WIP on the critical path.** `src/systems/plants/` (incl. the Orla window) is
   uncommitted work by another lane — beat 10's Lamps-Up/Orla half should coordinate, not
   duplicate.

## 4. Handoff and open-branch notes

- `.dev/pr-expansion/HANDOFF.md` — reviewed; it describes the broader PR-expansion effort, not a
  competing owner for this slice.
- Brief source branch: `origin/experience-commissions/EC-G10-the-first-hour-is-already-the-game`.
- Working tree carries extensive foreign work: `src/systems/plants/` (untracked — the Orla/Lamps-Up
  WIP above), modified `src/render/*`, `src/systems/bandRadio.js`, `styles/ui.css`, new look/probe
  scripts, and `design/program/fleet/HANDOFF-LEAD-2026-11-12.md` modified. None of it touches the
  owners named above; `git diff` on the draft path was empty before writing.

## 5. Build order for a ~one-week demo (smallest effort → biggest impact first)

1. **Retarget the first trade to Tethys** — `FIRST_TRADE_CONTRACT_DEST_*` constants in
   `economyContractTemplates.js`. One data edit; kills the clearest spec contradiction.
2. **Fire Kessler's B0 line at cold-start install** — one comms emit through `story.js`/
   `missionStoryOps` at `_installContract47aColdStart`. Minutes of work; puts the campaign's
   first voice in the first minute.
3. **Reorder `BEATS` to the Director's sequence** — thrust/brake early; push `burst`, `marker`,
   `focus`, `disengage`, missing-three, and power situations behind the dock (15–40 slot). Table
   edit in `onboarding.js`; keep `RESCUE_GATE_ROUTE` consistent with the new order.
4. **Mark the 47-A sample at spawn** — let B0's waypoint/objective point at the bound sample
   rock (or spindle) from beat 0 instead of suppressing nav until `tutorial:finished`.
   Onboarding + missions own both halves.
5. **Make the seam beat mine the real sample** — the bound source becomes the tutorial rock;
   `mining:yield` then satisfies B0 inside the rail. Restores "mine before dock."
6. **Skim as a visible scene** — `missionStoryOps` keeps the clock; spawn the black-line vessel
   + escorts in view of the recovery site (or wake the dormant `official_recovery_tug` pattern),
   kill escorts via real damage so the feed tells the truth. Largest single lift; largest
   single payoff — this is the amendment's centerpiece.
7. **Kessler's face** — portrait-capable comms card (owner: `src/ui/comms.js`; art exists at
   `assets/portraits/portrait_kessler.jpg`; precedent: `codex.js` CANONICAL_PORTRAITS), or an
   in-world hailable Kessler at Helios so the existing contact-card path carries the face.
8. **Title: two doors + defaults New Game** — `mainMenu.js` ladder → Adventure/Swarm pair;
   `newGame.js` → one-press default launch with the current form demoted behind "Custom".
9. **Orla's lamp as first town job** — coordinate with the in-flight `plants/` lane
   (PL-230 already authors Orla's window); otherwise reskin the Lantern Ward attended job's
   front contact. Sequenced last because it depends on foreign WIP.

## 6. Guesses I made

- "Marked" read as a nav/objective pointer on the bound sample source, not merely a physical
  prop nearby.
- "Orla's lamp is the first town job" read as a hail-offered attended job at first Helios dock,
  matching the Lantern Ward pattern.
- The Skim's "escorts die on screen" read as real actor deaths in view, per the packet's own
  warning that kill-feed text is insufficient.
- "Twenty seconds of thrust and brake" read as a timed free-flight beat, not two gated drills.
