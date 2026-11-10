# Contacts, voice, heists & mission plumbing (W1)

Inventory for campaign W1 "the Journey". Every non-obvious claim cites its file. Read-only survey
taken 2026-11-06 at HEAD 0fcb41cb7fa1 (shared checkout, read-only except this file).

## 1. Contacts table (15 rows) + which counters move today (with writer paths)

The canonical depth cast lives in `src/story/campaign47a/embodiedDialogue.js` (`DEPTH_PROGRAM_CONTACTS`,
G1–G16) merged into `CONTACT_CARDS` (which also carries 10 ordinary named cards: kessler, mira, rook,
elroy, slate, callum, vale, kurtz, sable_iask, redcut_sorrel). The bar renders them through
`authoredBarContactsForStation` in `src/ui/station/barContacts.js` (depth contacts are spliced into the
2–4 generated patrons of `generateContacts`, so they share the bar with procedural locals). The
"15 contacts" framing = G1–G15; G16 (W3) adds a 16th, so `CONTACT_COUNTER_DEFS` in
`src/data/stationContacts.js` has **16 counters** for 16 depth contacts, 1:1.

All counter mutation flows through ONE writer: the `stationContacts` system (`src/systems/stationContacts.js`),
via its `_applyCounterDelta` (line 348) fed by (a) its own event listeners and (b) canonical
`stationContact:counterDelta` intents (only emitter: `src/systems/missions.js:5566`, the witness-run seam).

| # | Contact id | Name | Where met | Counter (min/max/label, init 0) | What moves it (writer path) | Voice wired | Portrait |
|---|---|---|---|---|---|---|---|
| G1 | contact_yune | Clerk Yune | station_nyx_march (gate: beat≥6, Quiet rep≥25) | `yune.trust` 0/3 'Yune trust' | Clean Helios freight arrivals — `_noteYuneCleanArrival` on `freight:arrival` w/ tally disposition 'counted' (`src/systems/stationContacts.js:614-624`) | Yes | Yes (portrait_yune.jpg on disk) |
| G2 | contact_coldburn_rey | "Coldburn" Rey | station_reach (beat≥2) | `coldburn.grudge` 0/3 | `captain:remembered` (captain:coldburn-rey, outcome robbed/rescued) → `_rememberCastDeed` (`stationContacts.js:279-283`; emitter `src/systems/captainMemory.js`) | Yes | Yes |
| G3 | contact_iren_suhl | Dr. Iren Suhl | station_veil (beat≥3) | `suhl.clauses` 0/9 'Decoded clauses' | `machine:appealAccepted` → `_noteSuhlClause` (`stationContacts.js:631-634`; emitter `src/systems/precursorMachines.js`) | Yes | Yes |
| G4 | contact_orrin | Warrant Orrin | station_coalition (beat≥4) | `orrin.case` 0/5 'Orrin evidence case' | `orrinWitness:submitted` → `_rememberCastDeed` (`stationContacts.js:270`; emitter `src/systems/story.js`) | Yes | Yes |
| G5 | contact_sker_vane | Boss Sker Vane | station_sker (beat≥2) | `vane.favor` −3/3 | Selling contraband/illegal commodity at station_sker → `_rememberCastDeed` on `economy:tradeCompleted` (`stationContacts.js:271-278`) | Yes | Yes |
| G6 | contact_dustwife_senna | "Dustwife" Senna | station_sedna (beat≥6, 3 unique wrecks visited) | `senna.names` 0/8 | `uniqueWreck:resolved` → `_noteSennaName` (`stationContacts.js:640-643`; emitter `src/systems/uniqueWrecks.js`) | Yes | Yes |
| G7 | contact_latch_child | Latch-Child | station_smuggler (beat≥1) | `latch.child` 0/999 'Latch inventory memory' | Selling cmdty_scrap_metal → `_rememberCastDeed` on `economy:tradeCompleted` (`stationContacts.js:273`) | Yes | Yes |
| G8 | contact_question | The Question | station_sedna (beat≥6; one choice/visit) | `question.answers` 0/3 | Talk choice backed by held item (assay sample / personal ledger / nav data) → `_recordTalk` (`stationContacts.js:429-435`) | Yes | Yes |
| G9 | contact_filecleaver_dorin | "Filecleaver" Dorin | station_customs (beat≥4) | `dorin.trust` −1/1 | Witness Run terminal settlement: publish +1 / shelter −1 → `stationContact:counterDelta` from `src/systems/missions.js:5534-5573` | Yes (+ counter-reactive seam slot, `src/data/barks.js:1421-1441`) | Yes |
| G10 | contact_lira_vonn | Lira Vonn, "The Margin" | station_drift (beat≥3) | `vonn.interviews` 0/999 | First 'interview' bar choice → `_recordTalk` → `_rememberCastDeed` (`stationContacts.js:426-428`) | Yes | Yes |
| G11 | contact_tinker_zell | Tinker Zell | station_sker (beat≥2) | `zell.work` 0/20 'Illegal installs' | Contraband/illegal `module:purchased` → `_noteZellInstall` (`stationContacts.js:650-654`; emitter `src/systems/ships.js`) | Yes | Yes |
| G12 | contact_mara_children | Mara and the Children | station_drift + station_beltout (beat≥3) | `mara.debt` −3/3 | Survivor pod delivered/rescued at a medical berth → `_notePodReceipt` (`stationContacts.js:576`) | Yes | Yes |
| G13 | contact_wraith_kell | "Wraith" Kell | station_customs (beat≥5) | `kell.cover` 0/6 | Witness Run seam (shelter +1, publish/failure −1), same missions.js path as G9 | Yes (+ seam slot) | Yes |
| G14 | contact_halev_doss | Prof. Halev Doss | station_helios (beat≥1) | `doss.sources` 0/20 'Primary sources archived' | Projection of physical receipts (vesta cache, discovery plates, last-shift archive) → `_reconcileDossArchive` (`stationContacts.js:759-799`) | Yes | Yes |
| G15 | contact_maera_vols | Captain Maera Vols (hull ghost) | station_helios / poi_helios_yard | `vols.business` 0/3 | Story flags volsEchoUnlocked/volsBlackBoxRecovered/volsLetterCarried → `_reconcileVolsBusiness` (`stationContacts.js:336-341`) | Yes | Yes |
| G16 | contact_ledger_march | Provost March (W3) | station_helios (beat≥6, 3 unique wrecks) | `march.reconciliation` 0/5 'Yard sums reconciled' | **NO WRITER ANYWHERE.** Grepped src/, test/, scripts/ — only the def, the read-side memory line (`src/data/contactDeedMemory.js:36`) and the depth card exist | Yes | **No** (no key in `src/data/portraits.js` NAMED_CONTACT_PORTRAITS, no file on disk) |

**The report card's "12 of 15 contact counters never move" does not reproduce today.** 15 of 16
counters have live writers; only `march.reconciliation` is frozen (and it is a W3 addition whose
writer was never built — its own read-side line and depth card already ship). Grep set:
`CONTACT_COUNTER_DEFS` consumers (`src/data/contactDeedMemory.js`, `src/data/manifestGame.js`,
`src/systems/stationContactLoadBoundary.js`, `src/systems/stationContacts.js`,
`src/story/campaign47a/embodiedDialogue.js`, `src/story/endings/lifeLedger.js`,
`src/ui/station/barContacts.js`) plus all roster-id references. Secondary memory beyond counters:
each contact record also remembers `met`, `talkCount`, `standing` (0–3 'New/Recognized/Established/Trusted'),
last choice, per-choice flags, the one vonnFreightLoss case, and one rescueMemory claim
(`normalizeStationContactRecord`, `src/data/stationContacts.js:86-121`). Bar read-side:
`contactDeedMemory` bands (unproven ○ / remembered ◐ / established ● / strained −, `src/data/contactDeedMemory.js`).

## 2. Voice census (method + numbers + unused banks)

Method: `find assets -iname '*.wav'` = **1,569** files (1415 under `assets/audio/voice`, 154 elsewhere).
For wiring I checked (a) literal `.wav` basenames grepped out of `src/`, (b) constructed-name sites
(`bed_${id}`, `line_${n}_${registerId}.wav`, `clip_NN.wav`), and (c) the packaging test that decides
what ships.

- **1,399 `line_NNNN_<register>.wav`** (`assets/audio/voice/`) — the delivered bark corpus, one per
  bark line, generated by `generate-bark-voice.mjs --all` and named by positional corpus index
  (`deliveredBarkWavRelPath`, `src/audio/barkVoice.js:382-401`). Corpus count is pinned at 1,399
  (`countBarkCorpus`, asserted in `test/distress-bark.test.mjs:185`), and disk has exactly 1,399
  `line_*.wav` — a 1:1 match. **They are acceptance/packaging artifacts, not runtime-fetched files**:
  `test/m6-packaging-parity.test.mjs:80-100` asserts the retail copy plan EXCLUDES exactly the
  delivered corpus + blind fixtures. At runtime bark voice is synthesized per line
  (`renderBarkUtterancePcm` via `src/audio/barkPcmCache.js`, played from
  `src/audio/audioSystem.js:7191-7276`).
- **16 `bark_<faction/register>.wav`** — wired at runtime through `src/audio/sampleLibrary.js`
  (register-signature samples, tier 2).
- **140 non-voice WAVs** (arrival, ui, music, impact, mining, massline, engine, explosion, wpn,
  doctrine, combat, world, station, comms) — all accounted for: literal names in src, plus 10
  `bed_*` sector beds constructed in `src/audio/themeMatrix.js:154-166` and 4 `theme_*` via
  `authoredSampleId` in `src/data/audioRecipes.js:4001-4054`.
- **14 `voice/blind/clip_NN.wav`** — blind-listen test fixtures (`BLIND_REGISTER_CLIPS`,
  `src/audio/barkVoice.js:561-580`), test-only, excluded from retail.

**Bottom line on the "439 per-line WAVs unused" claim: it does not reproduce.** Under the only three
defensible methods you get 0, 1,399, or 0 — never 439: (1) runtime fetch: 0 of the 1,399 line WAVs are
fetched (all voice is synth) but all 1,399 are corpus-parallel artifacts; (2) corpus parity: all
1,399 map 1:1 to authored bark lines; (3) packaging: all 1,399 are deliberately excluded from the
retail bundle. There is no 439-sized orphan subset.

Voice *systems* (all text-first, synth-voiced):
- `src/data/barks.js` — 14 factions × 8 core situations (+ 'distress' event situation) radio corpus,
  deterministic selector; 1,399 lines. No unused faction banks — every BARK_FACTIONS entry has cells.
- `src/audio/barkVoice.js` — register synthesis (pitch/formants/radio band), captions included.
- `CONTACT_VOICE_REGISTERS` (`src/data/barks.js:1492+`) — **all 16 depth contacts** have authored
  dialogue banks (6 lines + 3 first-contact choice pairs each), rendered as bar dialogue text
  (`src/ui/station/barContacts.js:665-690`), with two counter-reactive witness-seam slots (Dorin/Kell).
- `src/story/mechanicVoice.js` — berth/dock hull-scar reader, text-only (explicitly "not this voice"
  for the bark corpus); no WAVs of its own.
- `src/data/contactHail.js` — in-flight traffic hails (scan/warn/heave-to actions), text + actions;
  not a WAV consumer.
- `src/ui/voiceArbiter.js` — the "one voice at a time" priority queue every spoken channel routes
  through (story > alert > bark > news > info).
- `src/data/borrowedVoice.js` is a misnomer for this purpose: it is the Charon retained-signal site
  (alien-ecology radio mystery), not a voice bank.

Unused banks: none in the meaningful sense. The only "unused" audio is structural — the 1,399 shipped
line WAVs that the synth pipeline supersedes at runtime (a bundle-size question, not a content gap).

## 3. Heists (what exists, the door problem)

Authored heist content = **three board jobs + two post-ending mega-heists**, all cited from
`src/data/heistMission.js`, `src/data/heistFacilities.js`, `src/data/encounters/mega-heist.js`,
`src/data/missions.js:2369-2420`, runtime in `src/missions/heistMissionRuntime.js` +
`src/systems/heistFacilities.js`.

**The Tethys three** (all posted on ONE station board — see door problem below):
1. **Capsule Run** (`heist_intercept`, `PQ019C_HEIST_TUNING`) — the actual theft. Tethys Surface
   Launcher throws a sealed capsule (mass 180, hull 160, 4 separable shipment units,
   `heistFacilities.js:82-109`) at 100 WU/s on a fixed arc to the Concord Lawful Catcher; intercept
   it in flight, carry it to the Quiet Fence Receiver: 1,800 cr, risk tier 3, minRep −40 (Quiet check
   nothing). Theft reports; witness annulus 450 WU (mirrored to `lawSecurity`'s constant); escape =
   1,800 WU from responders held 60 ticks; responder lease cap 2, leash 2,600 WU; launch window 30 s,
   run window 6,000 ticks. Reduced-stake recovery row (900 cr) is authored OFF
   (`recoveryEnabled: false`, `heistMission.js:216`).
2. **The Third Shift** (`breakaway_recovery`) — the lawful mirror. The launcher throws the SP-07
   flywheel assembly (16 WU, 180 mass, 480 hull, 0.6 rad off-line, spinning 0.5 rad/s) and Concord
   pays 960 cr (+15% quality bonus) to bring it through the **physical capture fork** (halfWidth 27,
   depth 72, entry <100 WU/s, settle <8 WU/s and <0.45 rad/s for 21 ticks, bounded brake force —
   `heistFacilities.js:143-176`). The Quiet fence the SAME object for a flat 1,200 cr
   (`fenced_success` variant, `heistMission.js:424-436`). Contested by 2 light raiders + one optional
   tether-control specialist (`BREAKAWAY_PRESSURE`). No theft report — the contract is the permission.
3. **The Counterweight** (`counterweight_watch`) — the gate-watch. A real sliding door collider
   (`COUNTERWEIGHT_SCENE.door`) across the transfer-yard corridor opens only while a qualifying mass
   (40–900, settle <8 WU/s, 90 ticks) rests on the cradle; the yard tug walks 2 sealed crates; pay
   420 cr/leg + 260 bonus. Raiders may contest the carry.

**Facilities (~17 ids), all in `src/data/heistFacilities.js`.** The three world facilities:
`heist_launcher` (Tethys Surface Launcher beacon), `lawful_catcher` (Concord catcher beacon),
`fence_receiver` (Quiet cache). Derived/physical ids: `breakaway_fork_lawful_catcher` (capture fork),
`berth_three` / `berth_three_yard` / `berth_three_shuttle` (carrier berth props), `counterweight_yard`
(scene), `monitor_hollow` / `monitor_ridge` / `monitor_shoal` (hot-return monitors); payload stableIds:
`cargo_capsule`, `shipment_unit`, `payload_sp07`, `counterweight_ballast`, `transfer_crate_alpha`,
`transfer_crate_beta`. Plus `PQ019_CAPSULE`/`BREAKAWAY_SP07` bodies and POI/anchor projections.

**How a heist runs physically**: the launcher routine throws on a 240 s cadence when unbooked
(`PQ019_ROUTINE`); everything is mass on a trajectory (no scripting); casing is real — scan/follow/watch
resolve 4 durable facts (`PQ019_OBSERVE.facts`: launcher_schedule, catcher_receiver, fence_receiver,
crew_route → `state.heistFacilities.observed`), and 3-of-4 unlocks a third method line on the board row
(`HEIST_CASE_FILE`, `heistMission.js:45-89`). After 2 losses the launcher ships under escort
(`escortAfterLosses: 2`). A retry physically changes the room (`RETRY_WATCH_PRESSURE` picket).

**Mega-heists (post-ending, PQ-170.02)**: `mega_heist_tessera_core` (Ashfall archive barge, 5,600 cr,
faction_vael offer) and `mega_heist_choir_reliquary` (Veil procession, 6,100 cr, faction_free offer) —
both are set-piece encounters with the SAME actor shape: one tetherable `vault_hatch` + one tetherable
`throw_mass`, two methods (`yank_the_hatch` on reel/latch, `smash_the_door` on whip/throw).
`MEGA_HEISTS.length !== 2` fails validation (`src/data/missions.js:2490`).

**"Three heists, one door" — verified, and the door is the board, not a building.** All three authored
heist jobs carry `stationId: 'station_tethys'` (`PQ019C_HEIST_STATION_ID`) and are posted only by
`_syncHeistOffer`/`_syncBreakawayOffer`/`_syncCounterweightOffer` in `src/systems/missionBoardOps.js`
(ensureBoard's sync family, line ~67-78) — one station, one sector (`sector_tethys_junction`), one
launcher/catcher/fence facility set. The three are genuinely different *policies* over one arbiter
(heistMission.js is explicit: "A second POLICY over the same launcher, arbiter and receiver machinery —
not a second mission engine"). What's missing for variety: no second facility set (every job touches
the same three buildings), no second sector until post-ending, and both mega-heists share the
hatch+throw actor template, so a "new heist" today means new facilities or new method hooks — the
mission-policy layer (settlement tables, `HEIST_MISSION_POLICIES`) is already variant-ready.

## 4. Mission/story flow map (offer→run→payout; beat firing; gates; pacing hooks)

**(a) Board offer → accepted → run → payout/receipt.**
- Boards are built per station per epoch (600 s default) in `missionBoardOps.ensureBoard`
  (`src/systems/missionBoardOps.js:63+`): a procedural `OFFER_MIX` roll plus ~18 sync families that
  re-post authored rows (story/book contracts, set-piece chains, heists ×3, yard contracts, clean
  cylinder, warm cargo, quiet passage, authored set pieces, mega-heists, capital boss, adventure speed
  contracts, shortages, starter jobs, rank contracts, captain standing orders, Coldburn bid).
- Player accepts from the board/bar → `ui:acceptMission` → `missions.acceptMission`
  (`src/systems/missions.js:1741`), which emits `mission:accepted` (audio stinger, objective HUD lane).
- Run: the mission owner (missions system) listens to physical events; set-piece chains settle through
  `advanceSetPieceMission` with stage/retry semantics; heists through `heistMissionRuntime`.
- Payout: `_completeMission` grants credits via `economy:grantCredits` (economy is the sole credits
  writer — `src/systems/missions.js:5803`), rep via `mission:completed{factionId,repMult}` consumed by
  the factions system, and logs the receipt; payday copy is itemized per contract
  (`_missionPaydayNote`, missions.js:5491). Failure/expire paths are
  `_failMission`/`_expireMission` with zero terminal receipts by design.
- Post-completion hooks that already exist: follow-up contract offers
  (`mission:setPieceTransition` → `_onExternalBoardOffer`), witness-run contact seam (counter deltas),
  and the campaign sidecar (`_ensureCampaignSidecar`, observe-only).

**(b) Where story beats fire and what presents them.**
- The spine is an 8-beat FSM in `state.story.beatIndex` (`STORY_BEATS`, `src/data/missions.js:2632-2662`:
  cold_start → honest_work → first_blood → bigger_boat → pick_a_side → proving_ground → empire_seed →
  deep_reach). Advancement lives in `src/systems/missionStoryOps.js`: `_storyTrigger` (discrete
  first-X events, `BEAT_TRIGGER`), `_advanceEmbodiedStoryMission` (B1–B4 book contracts; each authored
  contract has a `contractId` step; ordered lists complete via `recordBeatStep`/`isBeatStepsComplete`),
  `_advanceStoryChain` (B5 faction chain count), `_completeContract47aB7Operation` (B7), and
  `_advanceStory` (line 2232) which grants credits/RP/rep/unlocks, sets `beat_<n>_done`, emits
  `story:beatAdvanced`, and speaks the next direction.
- Presentation channels (no cutscenes): direction toast via `_sayStoryLine` (voiceArbiter floor),
  persistent `comms:popup` (e.g. SLATE/LANE TRAFFIC/MERIDIAN TICKER beat consequences,
  missionStoryOps.js:1705-1741), bulkhead/airlock graffiti (`BEAT_CONTENT`, `src/data/narrative.js:364+`),
  HUD "lies" (`hudLie`, e.g. CARGO STABLE LOAD), the Mission Log/captain's-log panel, and the bar.
- `src/systems/story.js` is the narrative overlay owner: comms, graffiti, phases, endgame offer,
  ending eligibility snapshots, ambient post-ending lines, written-finale playback (below).

**(c) Every gate that exists today.**
- Beat gates: `minBeat` on every depth contact (`depthContactAvailable`,
  `src/story/campaign47a/embodiedDialogue.js:110-124`) and on W3 card G16.
- Rep gates: G1 needs Quiet rep ≥ 25 (`gate.minRep`); endgame A/B need faction rep ≥ 50
  (`ENDGAME_REP_MIN`, `src/story/endings/eligibility.js`).
- Work gates: G6/G16 need 3 unique wrecks visited (`gate.minUniqueWrecks`, reads
  `player.flags.uniqueWrecksVisited`); ending A needs 3 lawful contracts OR 100k net-worth + world
  stake; B needs smuggled value / 3 route contracts / trusted+3 trades.
- Board standing gates: risk-tier minRep ladder (`missionStandingGateForMinRep`,
  `src/data/missions.js:191`); heists: −40 (Quiet), −10 (Concord Third Shift), −20 (MTS counterweight).
- Story-flag gates: `story.flags` for board sync (e.g. `_boardNeedsStoryBranchIntro`, branch intro at
  beat 4 via `STORY_BRANCH_INTROS`), vols counters read story flags, choir chair at Eris, Quinn's stool.
- Credits/net-worth gates: B7 legacy route needs 100k net worth AND branch rep ≥ 50
  (`_checkStoryGates`, missionStoryOps.js:2203-2221); live route reaches the ending through the
  authored Deep Reach operation instead.
- Sector gates: endings require being in Ashfall Reach (`facts.inAshfall`); C requires a full hold
  (≥95% volume) and zero active missions; D requires physically holding `cmdty_personal_ledger`.
- Rank gate: `RANK_CONTRACT_BY_FACTION` rows via `_syncRankContractOffer`.

**(d) What a pacing director could hook without new systems** (the four best, all existing seams):
1. **The board sync family** (`missionBoardOps.ensureBoard`, line 63) — an authored offer that posts
   to a chosen station under chosen flags/beat conditions is one `_syncXOffer` method + one
   `buildXOffer` data function; the heist trio, yard contracts, and captain standing orders are the
   template. Epoch/retention logic (authored progress survives refresh) already works.
2. **Beat steps + `stationContact:counterDelta`** — a new beat step is a contract with a `contractId`
   in `CAMPAIGN_BEATS.steps` (W-BOOKS machinery, `missionStoryOps._advanceEmbodiedStoryMission`), and
   any system can move a contact counter with one bus emit; bounds/normalization/dedupe are free
   (`_applyCounterDelta` + `_rememberCastDeed` receipt keys). This is how a journey would make the
   frozen `march.reconciliation` and new memories move without touching the sole-writer contract.
3. **Depth-contact gates + bar stamping** — `depthCard` options (minBeat/minRep/minUniqueWrecks/
   stationHints/poiHint) place and gate a face purely in data
   (`src/story/campaign47a/embodiedDialogue.js:20-59`); bar rumor/deed lines attach via the
   `stamp*` helpers in `src/ui/station/barContacts.js` (derelict rumors, Bay 7, ace routes, calendar
   moods) — a journey beat can speak through the bar with zero UI work.
4. **The encounter planner + lived vignettes** — `planEncounters(seed, sectorId, dayIndex, zones)`
   (`src/systems/encounterDirector.js:4072+`, day = `floor(simTime / DAY_SECONDS)`; sector-day replans
   at `_planSector`, line 902) schedule from data; authored guarantee items survive replans, and
   `livedWorldDirector`/`pickLivedVignette` (once-ever rotation, ambient lane with 1200 s cooldowns)
   fires curated scenes when the player is in the right kind of place. A vignette is a catalog entry,
   not a system. (There is no separate "day plan" module; the day index IS the plan seed input.)
   Also free: station deed gossip (`DEED_OUTCOME_LINES`, `stationContacts._noteDeed`) turns any
   outcome receipt into dock news.

## 5. Finale presentation (desk flow, what each ending door looks like to the player)

Trigger chain: the B7/Deep Reach completion (or legacy net-worth gate) sets `readyByHistory`; the
player must physically reach Ashfall Reach — `state.story.flags.ashfall_visited ||
deep_reach_ashfall_docked || kurtz_desk_opened` — then `story._maybeOfferEndgame`
(`src/systems/story.js:786-837`) fires **simultaneously, no cutscene**: the THEY_ALWAYS_KNEW bulkhead
graffiti, a persistent comms line "CONTRACT 47-A: FINAL DISPOSITION AVAILABLE. REVIEW AT YOUR
DISCRETION." (CONCORD ADMIN), and an `endgame:eligibility` snapshot (player-visible unmet rows, not a
modal). It then posts the physical offers: A/B as Ashfall board rows
(`postEndgameDispositionOffers`, `src/systems/missionBoardOps.js:966-999`, filtered live by
`getBoardEligibleEndingIds` so obsolete rows leave the board), C/D as flight actions, E as a bar contact.

The desk: Kurtz ("the Ashfall Witness", 'Eleven years counting the same mass') sits in the
station_ashcache bar (`src/ui/station/barContacts.js:440-452`); his choices (openLedger / takeLedger /
approach) emit `ui:kurtzInteract` → `story._onKurtzInteract` (`src/systems/story.js:1720+`), which sets
`kurtz_desk_opened`, builds the inspectable `kurtzLedgerRows` (short facts), and marks the kurtz
evidence toward `readyByHistory` (`kellPaperTrail + archiveFile + kurtzLedger`,
story.js:1429-1432). Gate = `evaluateSharedGate` (`src/story/endings/eligibility.js:9-17`): Deep Reach
done OR ledger + three career evidence categories, plus the desk visit.

What each door is, from `src/story/endings/endingDefs.js`:
- **A — THE CLEAN UNIFORM** (Concord Auxiliary Commission, board row): needs Concord rep ≥ 50 and
  either 3 retained patrol/bounty/escort completions or 100k net-worth + world stake. Accepting:
  rep +700 Concord (+100 MTS), heat cleared, `record_expunged`. Post-ending duty: complete 3 more
  combat contracts (AUXILIARY WATCH).
- **B — THE SAME SILENCE** (Quiet Senior Routing Position, board row): needs a recorded routing
  history. Accepting: identity erased (`identity_erased`, public identity masked; warrants remain).
  Post-ending duty: close 3 distinct sell routes (QUIET MANIFEST).
- **C — THE ONLY HONEST OPTION** (wormhole jump, flight action): needs full cargo load + no active
  missions + in Ashfall. Jump without destination; the system files a return, world loops
  (`loopBack: true`). Post-ending duty: re-enter 4 distinct regions (RETURN CIRCUIT).
- **D — THE LEDGER CONTINUES** (stay, flight action): needs the physical `cmdty_personal_ledger` in
  the hold. Keep the witness desk; the flag `stayed_at_ashfall` grounds nothing — flight continues.
  Post-ending duty: file 3 distinct sector/contact scans (WITNESS ARCHIVE).
- **E — THE NEXT RUN** (courier, bar contact): a "Settlement Courier" appears in the Ashfall bar when
  `isChoiceECourierReady` and A/B/C/D were declined (`src/ui/station/barContacts.js:860-875`);
  settles 47-A for 1,200 cr, queues `contract_47b_pending`. Post-ending duty: 2 more contracts.
- **THE OPEN FRONTIER** (sandbox, Mission Log continuation) when nothing is eligible/chose — no
  disposition rewards, one offer per save.

The written finale itself: `createWrittenFinale` (`src/story/endings/finaleRuntime.js`) first seals a
bounded **basis snapshot** (`src/story/endings/lifeLedger.js:190` — contactCounters, credits, debt,
netWorth, heat, crime coverage, kills, smuggled value, survivor pods, named debts, career evidence)
BEFORE any reward lands, then plays authored beats from `FINALE_CONTENT`
(`src/story/endings/finaleContent.js`) through the ordinary channels — timed `comms:popup`
transmissions, bulkhead graffiti, "evidence slot" moments, and one HUD lie. The cast reads state: each
ending's final beat appends `castLastCall(facts.contactCounters)` — one line per depth contact whose
band (strained/remembered/established) is computed from the counters sealed at decision time
(`src/data/contactDeedMemory.js:51-56`, wired at `finaleContent.js:270`). Then epilogue paragraphs +
post-ending ambient comms + home-wall graffiti, and a post-ending continuity directive
(`src/story/endings/resolve.js` — signal/target/progress contract consumed by the ordinary event bus).
