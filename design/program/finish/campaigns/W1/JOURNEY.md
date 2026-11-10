<!-- LIFETIME: CAMPAIGN — owner review required before implementation -->
# W1 — The Journey

**Status: DRAFT for owner approval. Nothing in `src/` changes until the owner approves this doc.**
Campaign W1, Lane 5 WORLD, 2026-11-06. Inventories this builds on:
[inventory/SECTORS.md](inventory/SECTORS.md) ·
[inventory/ENCOUNTERS.md](inventory/ENCOUNTERS.md) ·
[inventory/CONTACTS_SYSTEMS.md](inventory/CONTACTS_SYSTEMS.md).

---

## 1. What the game's story already is (no new lore — this is the canon)

The story is written. `docs/worldbuilding/story/THE-STORYLINE.md` is a complete novel: a courier
(the player, canon name Wren — the ship is the Tessera) works the frontier while Contract 47-A —
a 12.4-tonne "mass variance" someone stole to the kilogram, authorized under `REF 44-C` with a
redacted co-author — turns out to be the paper trail of a system that eats its own people. The
books: Cold Start → Honest Work → First Blood → Bigger Boat → Pick a Side → the Reunion → the
Empire Seed → the Deep Reach. Six interludes sit between them. Five doors end it (A Clean Uniform,
B Same Silence, C Only Honest, D The Ledger Continues, E The Next Run), each with post-ending
continuity loops.

The spine implements this. `src/story/campaign47a/` (8 beats, storySpine single writer, failure =
scar that replaces the ask and re-weights the next offer) + `src/story/endings/` (pure, explainable
eligibility reading the life ledger) + embodied book contracts (`embodiedMissions.js` — every beat
has authored briefs, two physical completion methods, a headline verb) + comms lines
(`embodiedDialogue.js`) + the six interludes wired through `encounterDirector.requestAuthoredEncounter`
(`interludes.js`) + beat comms + a mission board that posts the next book job.

**The problem is not missing story. The problem is that none of it is framed as a journey.** The
beats exist but the player meets them as board jobs one at a time; the world's 370 encounters, 10
sectors, 26 bar contacts and 1,400+ voice files are not arranged along the arc; and 14 of the 16
contact memory counters have no writer (verified below). The report card's grade (Story: Bronze+,
"deep simulation, quiet surface") is exactly this.

## 2. Verified baseline (2026-11-06, this checkout)

| Claim | Verified number | Evidence |
|---|---|---|
| Spine beats | 8 (B0 Cold Start → B7 Deep Reach), 3 branch doors at B4, failure-scar system, climax per branch | `campaignData.js`, `embodiedMissions.js`, `storySpine.js` |
| Endings | 5 + sandbox, explainable eligibility, 5 post-ending continuity loops | `endings/endingDefs.js`, `eligibility.js` |
| Sectors | 10 core + 11 frontier; 4 core sectors have staged causal chains (Helios, Tethys, Vesta, +Dione), 6 have casts-only or nothing | `inventory/SECTORS.md` §2 |
| Encounters | 367 content files: 138 opener templates (17 shapes), 176 one-template vignettes, 25 authored scenes, 7 unique wrecks, 10 depth (player-echo), 5 k1, 6 interludes | `inventory/ENCOUNTERS.md` §1 |
| Contact counters that move | **15 of 16** have live writers (the system's own observed-event listeners — Suhl clauses, Senna names, Zell installs, Orrin case, survivor pods, vonn freight, trade/travel deeds — plus the Witness Run seam emitter `missions.js:5566`), all through the one writer `systems/stationContacts.js`. Only `march.reconciliation` (G16) is frozen: def + read-side lines ship, writer never built | `stationContacts.js:240-293, :344`; `missions.js:5566` |
| Voice | 1,569 WAVs on disk; the 1,399 `line_*` files are a 1:1 QA acceptance corpus for the bark corpus, **deliberately excluded from the retail bundle** — runtime voice is synthesized. The report card's "439 unused" does not reproduce under any counting method | `inventory/CONTACTS_SYSTEMS.md` §2; `test/m6-packaging-parity.test.mjs` |
| Heists | "three heists, one door" verified: three distinct settlement **policies** (Capsule Run theft / Third Shift lawful fork / Counterweight gate-watch) over ONE launcher/catcher/fence facility set, all posted at `station_tethys` only; plus 2 post-ending mega-heists on one hatch+throw template | `inventory/CONTACTS_SYSTEMS.md` §3; `heistMission.js`, `heistFacilities.js` |
| Interludes | 6 authored, gated on beat cursor, stale-follow so they can't become unreachable | `interludes.js` |
| Roads to the finale | every path Helios→Ashfall passes Charon (3 honest jumps) or the tech-gated Veil wormhole (`sectors.js:1235`) | `inventory/SECTORS.md` §1 |

## 3. The Journey: four acts

Act titles quote canon (THE-STORYLINE.md). Each act: **goal, verb unlocked, signature set piece,
cliffhanger** — and the act seam interlude that already exists.

| Act | Canon name | Spine beats | Sectors | Verbs unlocked | Signature set piece | Cliffhanger |
|---|---|---|---|---|---|---|
| I | **The Pit** | B0 Cold Start, B1 Honest Work | Helios Prime, Tethys Junction | mine → weigh/haul | **The Skim** — a black-line vessel lifts the 12.4 t sample mid-flight; escorts die on the killfeed; the wrecks persist as the receipt | The variance object rides in your hold; the manifest re-categorized itself mid-transit. *THEY KNEW THE MASS.* |
| II | **The Cinder Board** | B2 First Blood, B3 Bigger Boat | Tethys → Charon Expanse → Ceres Belt → Vesta Forge | hunt (bounty) → tow (long tow) | **Elroy** — the register writ: UNKNOWN resolves CIVILIAN — REGISTERED; kill or reel inside sixty; the wreck stays as contraband medicine. (The Nest and the Foreman boss carry the act.) | The Kepler Gate Audit welds shut; a comms popup forwards through four relays: "Your recent work has been noted." Elroy's outcome (custody vs force) re-prices everything after. |
| III | **Three Doors, One Administrator** | B4 Pick a Side, B5 Proving Ground | Tethys/Ceres (traders), Coalition→Charon (patrol), Helios→Io (free) + branch chains | branch verb: deliver / clear / run | **The door operation** — Spine Break (escort under fire, tickers counting containers) / The Weighing (break the too-perfect pack's pattern) / Barn Raising (six modules, one 240 s weld window) | The board offers the doubled contract — HOSTILE (REGISTERED CIVILIAN), fee ×2. The truth now has a price and the system knows you'll pay it. |
| IV | **The Deep Reach** | B6 Empire Seed, B7 Deep Reach | Ceres (seed) → the rim (Pallas/Sker/Veil optional) → Ashfall Reach | deploy (empire seed) → jam / knock / tow (climax) | **The Deep Reach climax** — run the blockade, siege the tower, or tow the evidence; the Iron Maw boss and the Roaming Burn live on the approach | The Ashfall desk has your callsign, dated six weeks before Cold Start. Five doors. *THE COUNT NEVER ENDS.* |

**The shape of the map is the shape of the story.** The sector graph already descends from the
Helios–Tethys hub pair into two branches (west: Ceres→Pallas→Sker; east: Vesta→Charon→Ashfall),
and in the core graph every route to Ashfall passes either the honest road (Charon) or the secret
road (the tech-gated Veil wormhole, reachable only through the rim). Acts I–III walk the core; Act IV is
*leaving the charted map* — Sker and Veil are uncharted until bought or surveyed, and the wormhole
is the frontier's shortcut into the ending sector. The journey's last free choice is which road
you take to the edge: the honest three jumps through Charon, or the rim (Pallas Drift's den
archipelago, Sker Haven's gate camps, the Resonance Obelisk, then the wormhole). That choice is
already built; the Journey only makes it legible.

## 4. Where each existing piece goes

### 4.1 Critical path (already implemented; the Journey frames it)

| Piece | File | Role in the Journey |
|---|---|---|
| 8 beats + objectives/rewards/unlocks | `data/missions.js` STORY_BEATS | the act beats; each beat's objective line is the "what do I do next" answer |
| Book contracts B1–B4 (authored briefs, 2 methods each) | `campaign47a/embodiedMissions.js` | the playable spine; already posts one at a time via `buildBookContractOffer` |
| Failure → scar → heavier re-offer | `storySpine.js` SCAR/OPEN_BRIEF + `adjustBoardOffer` | VISION "failure should make better stories" — already implemented; the Journey surfaces it |
| Three doors + branch chains + climax | `embodiedMissions.js` B4/B5/B7 | Act III/IV; Elroy's custody/force outcome re-prices B3 routes, B4 stakes, B6 programs |
| Interludes ×6 | `interludes.js` | the act seams (after B0, B1, B2, B3, B4, B5); fire as quiet scenes via encounterDirector |
| Endings A–E + sandbox + continuity loops | `endings/*` | Act IV's doors; A/B as board contracts, C/D/E as world actions at the Ashfall desk |
| Beat comms | `embodiedDialogue.js` BEAT_COMMS | each beat's opening line (Kessler/Rook/Slate/Vale/Callum/Kurtz), ≤12 words |

### 4.2 World content arranged along the acts

| Family | Count | Where it goes |
|---|---|---|
| Opener templates (17 shapes) | 138 | ambient board filler, all acts — they already roll by sector/day via the encounterDirector's seeded day plan. No arrangement change; W2 rates and upgrades the best. |
| Lived vignettes (one template) | 176 | ambient world voice, all sectors via `livedWorldDirector`. W1 adds none (lane rule). W2 converts the family into a few generators or cuts it. |
| Authored scenes (The Wedge, kilns, blind welder, drift auction, tool ledger…) | 25 | hang off acts as discoverable side stories: Charon/Ceres/Vesta scenes cluster around Act II's working sectors; the Ashfall-adjacent ones around Act IV. |
| Unique wrecks (rumor→bearing→fixed site) | 7 | the bar's rumor economy — Act II/III side content; Doss's archive trail (ending D) feeds on them (`doss.sources`). |
| Depth thread H1–H8 (the wreck that knows you, echo of player…) | 10 | the player-echo thread — W1 places its beats so the last one lands near the Ashfall approach ("the mass is always the same"). |
| k1 thread (understory salvager, archive reading room, pitborn yard…) | 5 | Ceres understory side content, Act II–III; feeds the compost/understory step of B2. |
| Interludes | 6 | act seams (§4.1). |
| Sector causal chains (Helios claim day, Tethys quiet handoff, Vesta feedstock day, Ceres 11-event) | 4 | the "resident faction visibly at work" layer (W3 deepens); Act I lives inside Helios's claim day and Tethys's quiet handoff. |
| Witness Run set piece (Dorin/Kell) | 1 archetype | the only contact counters that move today; Act II–III side ops at the customs line. |

### 4.3 The 26 contacts across the acts

Story contacts (beat comms): Kessler (Act I–II), Rook (Act II), Slate (Act II), Vale (Act III),
Callum (Act III — the Reunion lives in the B5 sealed routes), Kurtz (Act IV).

Bar depth-program contacts G1–G16 (`embodiedDialogue.js`, gates minBeat/minRep/minUniqueWrecks
already implemented) map onto the acts by station and gate:

| Act | Contacts encountered (station) |
|---|---|
| I | Halev Doss (Helios, B1+), Latch-Child (Smuggler station, B1+), Maera Vols (Helios yard — the hull ghost) |
| II | Coldburn Rey (Io/Reach, B2+), Sker Vane + Tinker Zell (Sker, B2+), Lira Vonn (Drift, B3+), Mara and the Children (Drift/Beltout, B3+), Dr. Iren Suhl (Veil, B3+), Kessler/Mira/Rook (Tethys) |
| III | Warrant Orrin (Coalition, B4+), Filecleaver Dorin + Wraith Kell (Customs, B4+ — the Witness Run), Yune (Nyx March, B6+) |
| IV | Dustwife Senna (Sedna, B6+), The Question (Sedna, B6+), Provost March (Helios, B6+ — the reconciliation desk that makes the first berth matter again) |

**The gap (corrected):** 15 of 16 counters already move — the deed-memory bands and 12-word
reaction lines are wired through the sole writer (`systems/stationContacts.js`, one bus event +
its own observed-event listeners). What is actually frozen: **`march.reconciliation` (G16,
Provost March)** — the reconciliation desk has no writer. The remaining character gap is depth,
not plumbing: the counters move but only through ambient deed listeners; few of the 16 have
*arc* writers that react to the spine's branches and the Elroy outcome. W4's job is therefore
arc work + unfreezing March (one emitter), not counter plumbing.

### 4.4 Voice, heists, mission plumbing

See [inventory/CONTACTS_SYSTEMS.md](inventory/CONTACTS_SYSTEMS.md) §2 (voice census), §3 (heists
and the door problem), §4 (board→run→payout flow, gates, and the exact seams a pacing director
hooks). Summary of what the Journey changes there:

- **Voice:** no WAV-wiring campaign is needed — the per-line corpus is QA-only by design and
  runtime voice is synthesized. The audio gap lives in Lane 6 (X4 score/sound), not in story
  wiring. The finale already closes with `castLastCall(contactCounters)` — one memory-banded
  line per depth contact.
- **Heists (implementation correction):** all three settlement policies (Capsule Run, Third
  Shift, Counterweight Watch) are physically authored at Tethys — the launcher/catcher/fence
  facilities, Berth Three beside the catcher, and the Tethys Transfer Yard counterweight cradle
  are sector-local world bodies (`heistFacilities.js`). Re-posting the board rows at branch
  stations would make rows point at scenes in another sector — a lie. W1 therefore does **not**
  re-post; the rows stay on the Tethys board where the scenes live. The real door-spread —
  authored facility placement variants per branch station — is W2 build work (one facility kit,
  three placements), and the board recommendation now surfaces the rows it already has.
- **Recommendation:** the board's recommended-job engine (`missionBoardOps.js`) is pointed at the
  spine's next book step so the ordinary route always shows the journey's next job first.

## 5. What is cut

Nothing authored is deleted by this doc. What stops growing:

1. **No new lore.** THE-STORYLINE.md + REGISTERS.md are the voice standard; any new string must
   sit inside them (the beat standard's rule).
2. **No new vignettes from the one template.** The 176-file family is frozen; W2 replaces or cuts.
3. **No second quest system.** The spine/ledger/facts single-writer architecture is the road; the
   pacing director reads it and publishes, never writes.
4. **No new sectors, no new contacts.** The frontier ring (11 sectors) stays discovery bait for
   the ending approach; it does not get act structure.

## 6. The few pieces to build (implementation phase, after owner approval)

| # | Piece | Size | Files | Notes |
|---|---|---|---|---|
| 1 | **Pacing director read-model** — one publisher of "act, beat, next step, next job" from `missions/story/spine` state | S | new `src/systems/journeyPacing.js` (read-only overlay) + wiring in the objective HUD + board recommendation | Reads `state.story.beatIndex`, spine situation, `buildMissionBoardContract`; emits the existing `story:` presentation events. Never writes spine state. |
| 2 | **"What do I do next" visibility** — the P2-14 story-objective tracker already persists the current beat objective (`onboarding.js:17`); add the act label above it and a pointer to the board's recommended book job; point the recommendation engine at the spine's next step | S | `missionBoardOps.js` recommendation sort + `onboarding.js` tracker panel | Mostly wiring; the "always an answer on screen" verify rides this. |
| 3 | **Interlude reliability** — fire each interlude when eligible on the ordinary route | S | `missions.js`/`missionStoryOps` request site (seam exists: `encounterDirector.requestAuthoredEncounter`) | The gate logic in `interludes.js` is complete; the Journey walk verifies it fires. |
| 4 | **Act framing strings** — 4 act titles + beat framing on the objective/Journal (act label above beat title) | XS | data strings; presentation wiring | Quotes canon titles; no new lore. |
| 5 | **Heist door spread** — RE-SCOPED during implementation: the scenes are Tethys-physical, so W1 ships only the recommendation surface (piece 2) and records the constraint; authored facility-placement variants per branch station are W2 build work | — | — | See §4.4 correction. |
| 6 | **Unfreeze Provost March** — one emitter for `march.reconciliation` (yard reconciliation receipts) | S | one `stationContact:counterDelta` emit site or a stationContacts listener | The only frozen counter; read-side bands ship today. W4 owns the deeper arc work. |

Out of W1 scope (owned elsewhere, hooks named here): pilot-level gates (Lane 4 P3 — the pacing
director reads whatever progression owner exists), sector look/palette/music (Lane 6 W3 requests
through NOW.md), encounter rubric/upgrades (W2 next), contact counter wiring beyond act 1 (W4).

## 7. Verify (W1's finish line, from MASTER_PLAN)

1. **Fresh save, ordinary route, act 1 walked in the real game** (Browser pane VISIBLE): B0 mine
   → skim → dock; B1 alloy run → Scale 4 → furnace detail; beats in order, no dead ends.
2. **"What do I do next?" check at ten random moments** during the walk — the answer must be
   visible on screen (objective line or board recommendation) within 15 s every time.
3. The six interludes' first two (after B0, B1) fire on the ordinary route.
4. No regression: `npm run check:baseline` subset relevant to story/missions; determinism
   references untouched (W1 writes no sim behavior).

## 8. Open questions for the owner

1. **Act count:** 4 acts as proposed (Beat 5 "Proving Ground" folds into Act III; the Reunion
   beat-comms stay there). Alternative: 3 acts with Proving Ground as Act III's second half.
2. **Wren:** the storyline names the protagonist and the ship (Tessera). Today the game never
   says the name aloud. Surfacing "Wren" and the Tessera in Journal/objective framing is canon,
   not new lore — but it changes the player-facing voice. Surfaced or kept implicit?
3. **Heist doors:** re-scoped — the three policies are Tethys-physical (§4.4). W2 builds the
   facility-placement variants if the owner wants per-branch heist doors. The two post-ending
   mega-heists stay endgame-only.
4. **Ending approach:** is the rim road (Pallas→Sker→Veil wormhole) promoted in Act IV framing
   (as the "secret road" the bar rumors hint at), or left to be found?

---

*Everything in this doc exists in the checkout today. The Journey doc arranges; it does not
author. — Lane 5*
