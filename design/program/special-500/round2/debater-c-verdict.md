<!-- LIFETIME: CAMPAIGN -->
# Round 2 verdict — Debater C (Continuity)

Lens: world coherence, canon, persistence semantics, physics honesty, emotional register.
Every sector id, faction id, calendar term, and named character used across the three round-1
files was spot-checked against the live data this sitting. Verdict up front: **round 1 is the most
canon-fluent proposal set this program has produced.** Most entries do not merely avoid
contradiction — they are load-bearing extensions of canon that already exists.

## Critique highlights

**What verified real (spot-checks this sitting):**

- All ~24 sector ids used are live: 10 core in `src/data/frontierRegions/*/FROZEN_*` plus
  nyx_march, hyperion_cut, kepler_scar, orcus_shadow (west), rhea_cinder, haumea_rift,
  eris_margin, phoebe_echo (north), nereid_shoal, proteus_well, triton_wake (east),
  eunomia_gulf, sedna_dark, dione_lane (south), plus the Bolus.
- All 14 factions exist as one file per flag in `src/data/factions/` (scn, mts, dmc, reach,
  quiet, vael, free, choir, helix, understory, fulfillment, archive, pitborn, vergelayers).
  `remembersSacrilege` in choir.js is real (SP2-033's gag is literal), and SP2-033's backwards
  shatter line is a play on the real "The crystal sings — once."
- All seven festivals in SP3 match `worldCalendar.js` exactly: Founders' Day 0, Drift Wake 7,
  Ring Fair 13, The Quiet Night 21, Forge Due 26, The Pale Holiday 33, Tally Eve 38. SP3-145's
  jukebox ghost is the actual Pale Holiday barLine ("the jukebox plays a song nobody loaded")
  turned into an event; SP3-189 is the canon text "nobody scheduled and everyone keeps" verbatim.
- SP2's spine threads are canon, not invention: Captain Maera Vols is in `narrative.js` FIGURES;
  GANG_SHE_HELD and GANG_SEVEN_RUNS are the real graffiti lines; the Shaft 7 "9/11 returned,
  0.7T filed as moisture" plate is the real MOISTURE_LOSS_NINE; "FORTY-ONE HULLS / COUNT DOORS"
  is the real Quiet count; "FREQUENCY 13" is the real Reach weigh-slip sender; the appeal window
  "12 cycles, open fourteen years, the Pit does not know it has one" is amb_ala_silt's note
  verbatim (SP2-050 is the single best entry in the pool); Bay 7 / ticket Y3-C2 / R3-CARRIER is
  the real wrong-grid chain; Kessler at Scale 4, nineteen years, one berth is KESSLER_DAUGHTER_BERTH;
  Rook the bounty double-biller, Clerk Yune, Wraith Kell, Sker Vane, Dustwife Senna (her roll is
  IN the Drift Wake calendar text), Latch-Child ("origin lapsed" is FIGURES' own phrase), and The
  Question are all canon figures.
- Machine people: Morrow R-07, Vesper, Ruud, Solstice are real data files; SP2-116 uses
  Morrow's actual line "Go on. There is more sky." and the real `launches` memory counter.
- Roaming stories: lost_goat/Bramble/Fennel lines are verbatim canon, and SP2-097's payoff
  ("fine assessed at one credit and a formal apology") is the library_tapes trade line verbatim.
- `BORROWED_SUN_PHASES` (SP3-198), the Candle Fleet's dark 25th plinth (SP2-009),
  Corridor Pin 44-C (SP2-025), `poi_tutorial` (SP1-198), E-23 Bell pulse fields — all real.

**Cross-lens duplicates (named):**

- SP1-149 / SP3-024 — two "Ring Rain" entries, same core (a gas giant sheds its ring for a
  season) in two sectors. MERGE SP1-149 into SP3-024: keep one ring-shedding season in the
  program; fold "the sift" harvest culture and the capped free-ice rule into the Anvil event,
  which has the stronger verified seam (`weatherMeteors` slots, `PLANET_SITE.bands`).
- SP1-068 / SP1-123 / SP3-005 — three comet-tail entries. The comet is one canon object (the L6
  background comet): MERGE SP1-068 (industry rides the tail) into SP3-005 (the perihelion
  event), keep SP1-123 (Charon's race on the same window) as the one gameplay leg.
- SP1-155 / SP3-126 — both titled "The Long Fall" (moon broadside vs Anvil reentry). Hone the
  rename; both cores are worth keeping.
- SP1-148 / SP3-076 — avalanche family (mining shelf vs Hyperion overburden). Distinct enough
  to keep both, but the build dedupe pass should treat them as one mechanic with two skins.
- SP1-093 / SP3-046 / SP3-148 — three audio-silence anomalies. SP1-093 (the Silence, a region
  with etiquette) and SP3-148 (the Silence Room) are distinct places; SP3-046 is the third and
  weakest — it did not make my 500.

**Canon errors and collisions:**

- SP1-150 puts "the Anvil's skim barges" in sector_ashfall_reach. The Anvil is Tethys's planet
  (`planet_tethys_anvil`). HONE to Ashfall's own refinery skim runs.
- SP1-115 names "Sable Iask" as a specific named hunter; that name is in none of the aces I
  verified (Yara No-Cut, Toll Saint Venn, Mako of the Broken Ring, Rake Veyra, Boiler-King Orro,
  Iona False-Face, Jex Wake-Salt). HONE: verify against NAMED_CAPTAINS or recast onto a real
  lancer-type ace — Toll Saint Venn is already the ranging sniper.
- SP2-190 pays out the withheld 47-A payment. The spine is explicit that 47-A is "never closed"
  and payment "withheld forever" (REFS, ENDING_STATION_ACK E: "47-A stays closed"). HONE to the
  release-that-re-withholds (full directive in Hones) — the anomaly survives, the wound stays.
- "Drift Choir" (SP2-016, SP2-157) collides with the Ascendant Choir, whose home sector is
  Vesta Forge. There is one Choir. HONE to rename; the Eris hanging pods need no second one.
- SP3-129's lost hull "the Harriet Wren" — the protagonist is Wren. A random dead hauler wearing
  the player's name reads as a coincidence the game did not choose. Rename.
- "Choir" as simile is diluting the faction's word: SP3-092 "Drill Choir", SP3-108 "Dock Choir",
  SP3-143 "Choir Trawl" (SP3-095 "The Last Anvil" borrows Tethys's planet name instead). All
  honed to renames; every one is a better title without the borrowed word.
- Machine-canon verification debt: Bracket BX-9 (SP2-118), Rubric HM-11 (SP2-120, SP2-130),
  Pallet Jack (SP2-127), and Scissorwake (SP2-128) are not among the named machine-people files
  (morrow/vesper/quill/ruud). Each is honed to verify-or-bless, not killed — the writing is
  faction-true in all four, and Scissorwake's old-hulls rule is too good to lose.

**Persistence semantics:** the strongest dimension of the pool. SP1-003, SP1-070, SP1-099,
SP1-103, and nearly all of SP2 name the exact save-carried store (`state.story.flags`,
`depthProgramEncounters.completed`, character memory bags) and mark done-once correctly. Two
violations: SP2-175's payoff discounts "airtime," a resource this game does not have (hone to a
register payoff), and SP1-022 says "six hours" — the world has 600-second days and watches, not
hours (hone to calendar units). SP2-167's self-refitting hull is the one persistence-adjacent
effect with no hand behind it — honed to give the fitter hands.

**Physics honesty:** SP3 is exemplary — the Umbra Minute, the sling chime ("mass made audible"),
the specular walks, and the sling-band physics all extend the sim's own rules. Kills and honed
violations: SP3-156 KILLED (a desaturation patch with no mass, no signal, no story is a post
filter, not a place — the proposal's own build seam admits it). SP3-055's lightning that freezes
mid-fork is honed to the physically honest version (persistent ionized traces). SP3-117's
"gliding" paper plane is honed to ballistics. SP3-031's backwards shadow is NOT a violation: the
Pale Holiday's canon text says "signals run strange," so the anomaly is in-world sanctioned.

**Tone:** the pool's register is the world's register — working lives, debt, salvage culture,
machine religion, the Quiet. The debt thread alone (SP1-003, SP1-190, SP1-195, SP2-187) is worth
a tenth of the catalog. Invented lore that fits: SP2-115's pre-charter tow cooperative is a
gentle retcon the Concord's working-class bones support. The zany is rare, and where it appears
it is usually one payoff away from honest (see hones).

## Hones

SP1-022 | HONE | Express the amnesty window in world time — sector days or watches per worldCalendar.js — not "six hours"; the world has no hours.
SP1-028 | HONE | Verify Vael's canon remit in src/data/factions/vael.js before casting them as checkpoint wardens; if io_reach checkpoint law is Concord's, recast the drill as Concord and give Vael its true role elsewhere.
SP1-098 | HONE | Strip the scar-matching prophecy; keep the echo hull one second late wearing a dead pilot's damage — dread without magic.
SP1-105 | HONE | Constrain the rewrite to one pre-seeded sector event and make the "new memory" a retraction-with-footnote — the original line stays legible somewhere, because this world keeps receipts.
SP1-115 | HONE | Verify "Sable Iask" against the NAMED_CAPTAINS roster in src/data/encounters.js; if absent, key the fleck to a real lancer-type ace (Toll Saint Venn is already the ranging sniper).
SP1-150 | HONE | The Anvil is Tethys's planet (planet_tethys_anvil) — drop the name and recast as Ashfall's own refinery skim runs against the sector's real star and redoubt vocabulary.
SP1-155 | HONE | Rename — SP3-126 already owns "The Long Fall" for the Anvil reentry; call this "The Broadside" and keep the moon-bombardment core.
SP2-008 | HONE | Pin down which desk the new clerk inherits — Clerk Yune is the Quiet's sealed-evidence broker (Wraith Kell is the customs embed), so the "replacement" should inherit the Quiet's evidence desk, not a Concord one.
SP2-016 | HONE | Rename the "Drift Choir" — the Ascendant Choir is one faction, home Vesta Forge; call the Eris tether dead "the hanging line" and keep every beat.
SP2-118 | HONE | Verify Bracket BX-9 exists in the machine-people registry (morrow/vesper/quill/ruud are the named four); if not, either introduce Bracket as deliberate new canon in one place or recast the zero-log onto real patrol infrastructure.
SP2-120 | HONE | Same verification as SP2-118 for Rubric HM-11 — three entries ride on this machine; confirm the id or bless Rubric explicitly as one new canon character used consistently.
SP2-127 | HONE | Verify the Pallet Jack cast id (the proposal cites "src/data/palletJack.js pattern"); if that file is a pattern and not a character, name the thief from the existing unregistered-hull vocabulary instead.
SP2-128 | HONE | Verify Scissorwake exists in the oneOffCast roamers; the old-hulls mercy rule is strong enough to keep under whichever roamer is real — wire the flag to that one.
SP2-130 | HONE | Rubric again — hold SP2-130 to whatever SP2-120's verification settles; the accession-number joke survives either way.
SP2-157 | HONE | Drop the "Drift Choir" name per SP2-016; "the line's last pod" at Eris needs no second choir.
SP2-167 | HONE | The skin refits itself between visits — give the fitter hands: fourth scan reveals tool marks and a work log, someone is fitting it; "NEARLY. KEEP GROWING." stays.
SP2-175 | HONE | There is no airtime resource to discount — replace the 20% payoff with a register payoff: the mast's preference means your hails resolve on the first ping, and other pilots notice.
SP2-190 | HONE | The withheld 47-A payment is structural ("never closed", "withheld forever" per REFS). Keep the release only if it re-withholds in the same popup: "PAYMENT RELEASED. RE-FILED. BALANCE: WITHHELD. THE DESK APOLOGIZES FOR THE HOPE."
SP3-055 | HONE | No bolt freezes mid-fork — the physics truth is the persistent ionized glassy trace; drop the held statue, keep the traces.
SP3-092 | HONE | Rename "Drill Choir" — "choir" belongs to the Ascendant Choir; "The Drill Chord" keeps the rising-fifth joke without borrowing the faction's name.
SP3-095 | HONE | Rename "The Last Anvil" — the Anvil is Tethys's named planet; "The Nine-Second Hammer" is the landmark this actually is.
SP3-108 | HONE | Rename "Dock Choir" for the same reason — docking chatter needs no borrowed liturgy; "The Approach" reads truer.
SP3-109 | HONE | Bay 7 is canon ground (the shelved R3-CARRIER grid, ticket Y3-C2) — either move the weekly cargo to a numbered bay, or lean in and make bay 7's emptiness the joke the regulars explain.
SP3-117 | HONE | Nothing glides in vacuum — restate as ballistics: a folded plate thrown from the pod bay on a computed arc, burning in the apron's heat wash; the thrower is the mystery.
SP3-129 | HONE | "the Harriet Wren" collides with the protagonist's name (Wren) — rename the lost hull from an ordinary name pool; the chronicler's line needs no coincidence.
SP3-143 | HONE | Rename "Choir Trawl" — a hauling convoy's work song is "The Hauling Chorus"; the Ascendant Choir keeps its word.
SP3-199 | HONE | "The campaign left it tuned" is a meta voice — attribute the painted 500s in-world (a survey mark, the Tally, one person's decade project) and the joke becomes a story.

## New proposals

### SPX-C-01 — The Berth That Moves Out
- Kind: easter-egg
- Where: sector_helios_prime, station_helios berths
- Trigger: after the player docks at the same berth 5+ times (persistent counter), on the next dock the adjacent berth is empty, swept, and chalked
- The player sees: the neighboring berth was vacated overnight. A dockmaster slate: "TENANT TRANSFERRED. NO REASON FILED. NO REASON REQUESTED." One glove left on the cleat. (Grows from amb_berth_avoid — the superstition the Tessera already earns, turned around.)
- Payoff: the berth stays empty for the rest of the save; once, much later, a departing hull flashes its floods once at your berth before it burns. Never explained, never repeated.
- Build seam: berth-visit counter in state.story.flags + dock-vignette dressing variant (902-scene precedent); the one flash is a lamp-bus pulse keyed to a day-window
- Effort: data+glue
- Fills: crew-superstition thread; no pool entry covers amb_berth_avoid's POV flipped onto the player as neighbor.

### SPX-C-02 — The One-Digit Writ
- Kind: easter-egg
- Where: any sector
- Trigger: first bounty the player earns over 200 cr (stat gate); once
- The player sees: the board posts TAG 7713 — one digit off the Tessera's own tag, 7714 (trap_bounty_tag's joke made structural). Hunters in the sector scan you twice, hover, and move on with a disappointed air.
- Payoff: meeting the real 7713 (a seeded quarry from QUARRY_NAMES) is a real encounter — they know why you're staring. Two hulls, one digit, one drink at the nearest bar.
- Build seam: bounty-id formatting hook reading the player's tag + one seeded encounter keyed to the flag; QUARRY_NAMES in src/data/bountyHunters.js
- Effort: data+glue
- Fills: the 7713/7714 trap line currently has no payoff anywhere in the pool.

### SPX-C-03 — Division Six's Quiet Neighbor
- Kind: comms-event
- Where: sector_veil_nebula, near Research Station Veil, ion_storm surges only
- Trigger: during surge phase, hold inside 400 WU of the research station for 30 s
- The player sees: under the storm's noise, one narrow band carries a pattern that is not weather and not any code the catalog knows. The station's wire, unbidden: "ALL BANDS NOMINAL. THERE IS NO EXTRA BAND." The denial is the tell. Dr. Iren Suhl's name appears on no page the player can read — yet.
- Payoff: flag `extra_band_heard`; codex page "The Band That Isn't"; if the player plays the pattern back at the station once, one reply arrives, sealed, signed with two initials: "I. S. — Stop. Please. — also, thank you for hearing it correctly."
- Build seam: surge-phase audio recipe + comms:popup row (new commsWhispers.js data file over the same seam) + codex overlay; the reply is one mail row keyed to the playback flag
- Effort: data+glue
- replaces: SP3-156 (the one honest kill needed a replacement with teeth: the late_xenolinguistics_line / Division 6 / signal-containment thread is otherwise untouched by all 600 entries, and it is sitting in canon waiting).

### SPX-C-04 — Dorin's Dead Drop
- Kind: oneoff-mission
- Where: sector_tethys_junction, border_checkpoint margins
- Trigger: after the player has paid 3+ law fines (stat gate), a blank-channel listing offers "clean paper, dirty provenance, one drop, one visit"
- The player sees: the drop holds pages cut from a Concord seal-log — which fines were pre-written, which inspections were scheduled before the ships were. Filecleaver Dorin's marginalia argues with the stamps in a neat, furious hand. The hunters' exchange pays for the pages too, and its scanner sweep is on a clock you can read.
- Payoff: deliver the pages to the Archive (records restored, standing +4) or sell to the exchange (credits, and within the week one pre-written fine arrives for you, personally — the ledger is honest about what it does). Codex page "Pre-Written".
- Build seam: numbered encounter with a two-outcome handoff; seal-log prose as codex overlay; the fine event keyed to outcome flag
- Effort: data+glue
- Fills: FIGURES' Filecleaver Dorin (bounty-posted whistleblower) is otherwise unused.

### SPX-C-05 — The Pigeon Day
- Kind: visual-setpiece
- Where: any station sector, market day
- Trigger: the pigeon_coop roaming story rides a convoy through the player's sector (the roaming runtime binding already exists); proximity to the receiving berth
- The player sees: the coop carrier docks, the loft's new keeper signs, twelve racers are released for the ceremonial first flight — and the birds, who remember the OLD loft, cross the entire sector in a tight line and land on the old one, which is a welded-shut derelict. The keeper watches, then writes "twelve for twelve" in the log anyway.
- Payoff: codex page "Twelve For Twelve"; the old loft gains one lamp that burns thereafter (the keeper feeds the birds there on market days).
- Build seam: roaming-story binding + one lamp via lampChannels on a worldOneOffs prop; codex overlay
- Effort: data+glue
- Fills: thirty roaming stories exist; only lost_goat was used by round 1.

### SPX-C-06 — Hollow Station's Backlog
- Kind: encounter
- Where: sector_pallas_drift, derelict_field (Hollow Station approach)
- Trigger: proximity to the suspended DMC claim office wreck; gates minSectorTier 2; cooldownS 3600
- The player sees: the claim office still queues paper into a chute that goes nowhere — 22 cycles of filings (amb_drift_claims' backlog) flutter out a broken seam and drift in slow paper-snow. Two live crews are racing to physically re-file the same rock's claim at the one working stamp. Both offer you carriage. The paper is real, the race is real, the rock is one rock.
- Payoff: carry either crew's filing (their rep) or file BOTH and let the stamp's order decide (the office's own law, honored bitterly); the winning claim's beacon lights and the losing crew becomes a recurring rival contact.
- Build seam: numbered selfRegistered encounter; claim paper as light debris props; claimableBodies beacon on the outcome; rival contact via story.flags
- Effort: data+glue
- Fills: Hollow Station is named canon (amb_drift_claims) with no site presence anywhere in the pool.

### SPX-C-07 — Origin Unspecified
- Kind: easter-egg
- Where: any sector
- Trigger: the player buys any canister whose provenance reads "origin unspecified" (the amb_sec6_air vocabulary) and is later scanned clean
- The player sees: the scan finds nothing — but the receipt the scanner prints carries one extra line it never prints: "PROVENANCE: HONORED." Somewhere, a relay the player cannot see files the sale as complete.
- Payoff: flag `origin_honored`; the next Quiet fence greets the player by the canister's contents, not their name. Codex page "The Tell" — 'origin unspecified' is the tell, and now the player has passed it.
- Build seam: provenance field read on scan receipt + one comms line; fence greeting variant in the fence contact copy path
- Effort: data
- Fills: amb_sec6_air's Quiet air booth has no downstream anywhere in the pool.

### SPX-C-08 — The Reinstatement
- Kind: oneoff-mission
- Where: sector_ceres_belt, station_ceres claim desk
- Trigger: after pers_voss_suspended has fired (beat 5+); dock once
- The player sees: Voss's suspension is lifted and the original claim reinstated — canon is explicit that the second crew "will not be notified." The claim office hands the notice to whoever is standing there, and you are standing there. The second crew are not villains; they filed in time, in the only window they had, on a filing system that ate both.
- Payoff: deliver the reinstatement to the second crew yourself: Voss rep +4, the second crew's rep +2, one codex line ("The system ate both. One hull carried the paper."). Refusing is honored: the office files your refusal, and the second crew learns from the wire, colder.
- Build seam: one-off keyed to the pers_voss_suspended seen-flag; delivery via numbered encounter; codex overlay
- Effort: data+glue
- Fills: pers_voss_suspended's cruelest sentence is currently a dangling thread; SP2-051 opens Voss's page but nobody carries the paper to the other crew.

## Ballot

SP1-001 | KEEP | Reach counts in hulls and tonnage — their ledger made physical
SP1-002 | KEEP | wreck court is in canon vocabulary; SP2-129 is its recess, not a clone
SP1-003 | KEEP | priorOutcome persistence is exactly the right seam
SP1-004 | KEEP | jettison-as-bid is physics-honest
SP1-005 | KEEP | protection racket with a persisted flag
SP1-006 | KEEP | pirate radio in the house voice
SP1-007 | KEEP | Reach bookkeeping as dread
SP1-008 | KEEP | burial column; attacking it costing rep is faction-true
SP1-009 | KEEP
SP1-010 | KEEP | fences are the Quiet's trade
SP1-011 | KEEP
SP1-012 | KEEP | "Reach arithmetic" is the faction's own voice
SP1-013 | KEEP
SP1-014 | KEEP
SP1-015 | KEEP | weight-variance is the campaign's own theme (Kessler)
SP1-016 | KEEP
SP1-017 | KEEP | poi_helios_tally is real
SP1-018 | KEEP
SP1-019 | KEEP
SP1-020 | KEEP
SP1-021 | KEEP | registry reform is pure REF 44-C register
SP1-022 | HONE | see Hones: world-time units, not hours
SP1-023 | KEEP
SP1-024 | KEEP
SP1-025 | KEEP | the Quiet copy, the Reach burns — both in character
SP1-026 | KEEP
SP1-027 | KEEP
SP1-028 | HONE | see Hones: Vael remit check
SP1-029 | KEEP
SP1-030 | KEEP
SP1-031 | KEEP | ceresShipbreak is real
SP1-032 | KEEP
SP1-033 | KEEP
SP1-034 | KEEP
SP1-035 | KEEP
SP1-036 | KEEP
SP1-037 | KEEP
SP1-038 | KEEP
SP1-039 | KEEP
SP1-040 | KEEP
SP1-041 | KEEP
SP1-042 | KEEP
SP1-043 | KEEP | drafting is real wake physics
SP1-044 | KEEP
SP1-045 | KEEP
SP1-046 | KEEP | "Labels mean it's mine. Right?" — delivery-law comedy
SP1-047 | KEEP
SP1-048 | KEEP
SP1-049 | KEEP
SP1-050 | KEEP
SP1-051 | KEEP
SP1-052 | KEEP
SP1-053 | KEEP
SP1-054 | KEEP
SP1-055 | KEEP
SP1-056 | KEEP | visible PAID/SKIP is honest social state
SP1-057 | KEEP
SP1-058 | KEEP
SP1-059 | KEEP
SP1-060 | KEEP | the cairn is the pool's best elegy
SP1-061 | KEEP
SP1-062 | KEEP
SP1-063 | KEEP
SP1-064 | KEEP
SP1-065 | KEEP | belt strike is the debt theme at industrial scale
SP1-066 | KEEP
SP1-067 | KEEP
SP1-068 | MERGE->SP3-005 | one comet, one canon event — the road and the stones share the perihelion window
SP1-069 | KEEP
SP1-070 | KEEP
SP1-071 | KEEP | "pods travel warm" is a rule worth having
SP1-072 | KEEP
SP1-073 | KEEP
SP1-074 | KEEP
SP1-075 | KEEP
SP1-076 | KEEP
SP1-077 | KEEP
SP1-078 | KEEP | "thaw in order of fare paid" is the whole law out here
SP1-079 | KEEP
SP1-080 | KEEP | the keeper is the pool's kindest entry
SP1-081 | KEEP
SP1-082 | KEEP
SP1-083 | KEEP | "there is no reef. There is something."
SP1-084 | KEEP
SP1-085 | KEEP
SP1-086 | KEEP
SP1-087 | KEEP | deadline as landscape, deterministic drift
SP1-088 | KEEP
SP1-089 | KEEP | shadow-as-word is honest light physics
SP1-090 | KEEP
SP1-091 | KEEP
SP1-092 | KEEP
SP1-093 | KEEP
SP1-094 | KEEP
SP1-095 | KEEP
SP1-096 | KEEP | "restraint has a budget too"
SP1-097 | KEEP
SP1-098 | HONE | see Hones: strip the scar prophecy
SP1-099 | KEEP | simTime-indexed character state, persisted — model persistence
SP1-100 | KEEP
SP1-101 | KEEP | the world treating a ghost as real is the best mystery
SP1-102 | KEEP
SP1-103 | KEEP
SP1-104 | KEEP
SP1-105 | HONE | see Hones: retraction-with-footnote
SP1-106 | KEEP
SP1-107 | KEEP
SP1-108 | KEEP
SP1-109 | KEEP
SP1-110 | KEEP
SP1-111 | KEEP
SP1-112 | KEEP
SP1-113 | KEEP
SP1-114 | KEEP
SP1-115 | HONE | see Hones: Sable Iask roster check
SP1-116 | KEEP
SP1-117 | KEEP
SP1-118 | KEEP
SP1-119 | KEEP
SP1-120 | KEEP
SP1-121 | KEEP
SP1-122 | KEEP
SP1-123 | KEEP
SP1-124 | KEEP
SP1-125 | KEEP
SP1-126 | KEEP
SP1-127 | KEEP
SP1-128 | KEEP
SP1-129 | KEEP
SP1-130 | KEEP
SP1-131 | KEEP
SP1-132 | KEEP
SP1-133 | KEEP
SP1-134 | KEEP | "Delete that." — the Quiet's calm is canon
SP1-135 | KEEP
SP1-136 | KEEP
SP1-137 | KEEP
SP1-138 | KEEP
SP1-139 | KEEP | coexists fine with the Quiet faction, as Quiet Night already does
SP1-140 | KEEP
SP1-141 | KEEP | honest computed accuracy is the house style
SP1-142 | KEEP
SP1-143 | KEEP
SP1-144 | KEEP | the Choir citing your real receipts — gorgeous
SP1-145 | KEEP
SP1-146 | KEEP
SP1-147 | KEEP
SP1-148 | KEEP
SP1-149 | MERGE->SP3-024 | one ring-shedding season in the program — fold "the sift" into the Anvil event
SP1-150 | HONE | see Hones: the Anvil is Tethys's planet
SP1-151 | KEEP
SP1-152 | KEEP
SP1-153 | KEEP
SP1-154 | KEEP
SP1-155 | HONE | see Hones: rename, SP3-126 owns The Long Fall
SP1-156 | KEEP
SP1-157 | KEEP
SP1-158 | KEEP
SP1-159 | KEEP
SP1-160 | KEEP
SP1-161 | KEEP | "one more time than the news reported"
SP1-162 | KEEP
SP1-163 | KEEP
SP1-164 | KEEP | append-on-death graveyard ring — persistence done right
SP1-165 | KEEP
SP1-166 | KEEP
SP1-167 | KEEP
SP1-168 | KEEP
SP1-169 | KEEP
SP1-170 | HONE | see Hones: verify Helix's remit before the clinic ring
SP1-171 | KEEP
SP1-172 | KEEP
SP1-173 | KEEP
SP1-174 | KEEP
SP1-175 | KEEP
SP1-176 | KEEP
SP1-177 | KEEP
SP1-178 | KEEP
SP1-179 | KEEP
SP1-180 | KEEP
SP1-181 | KEEP
SP1-182 | KEEP
SP1-183 | KEEP | the last tow at her own speed
SP1-184 | KEEP
SP1-185 | KEEP
SP1-186 | KEEP
SP1-187 | KEEP
SP1-188 | KEEP
SP1-189 | KEEP | offerings accumulate — the world remembers
SP1-190 | KEEP
SP1-191 | KEEP
SP1-192 | KEEP
SP1-193 | KEEP
SP1-194 | KEEP
SP1-195 | KEEP | the kid at the toll lane — debt made human
SP1-196 | KEEP
SP1-197 | KEEP | chalk is world memory in the world's handwriting
SP1-198 | KEEP | poi_tutorial is real; the homecoming is earned
SP1-199 | KEEP
SP1-200 | KEEP | "ACCOUNTS CURRENT" — the Quiet's one unbidden hail
SP2-001 | KEEP | Maera Vols is canon FIGURES
SP2-002 | KEEP | Slate's line closes the thread either way
SP2-003 | KEEP | the seventh run the graffiti doesn't talk about
SP2-004 | KEEP | "HULL STATUS: HELD TOGETHER" is the hull's real story
SP2-005 | KEEP | Kael's six months are canon (friend.debt)
SP2-006 | KEEP | the count-of-doors variant of the real Quiet count
SP2-007 | KEEP | GANG_SHE_HELD verbatim
SP2-008 | HONE | see Hones: which desk does Yune's replacement inherit
SP2-009 | KEEP | the dark 25th plinth is real poi_memorial canon
SP2-010 | KEEP | MOISTURE_LOSS_NINE verbatim
SP2-011 | KEEP | ticket Y3-C2 and R3-CARRIER are canon
SP2-012 | KEEP | silence as the correct answer to The Question — the pool's peak
SP2-013 | KEEP
SP2-014 | KEEP | stale-in-600s bearing is deterministic drift math
SP2-015 | KEEP
SP2-016 | HONE | see Hones: rename the Drift Choir
SP2-017 | KEEP
SP2-018 | KEEP | "INTENT: PENDING" — Hale's follow-up lands it
SP2-019 | KEEP
SP2-020 | KEEP | the seal one character off is the Quiet to the digit
SP2-021 | KEEP
SP2-022 | KEEP
SP2-023 | KEEP
SP2-024 | KEEP
SP2-025 | KEEP | Corridor Pin 44-C is a real POI
SP2-026 | KEEP | Vesper's "decided to be flattered" is machine continuity done right
SP2-027 | KEEP | Rook the double-biller is canon FIGURES
SP2-028 | KEEP
SP2-029 | KEEP
SP2-030 | KEEP
SP2-031 | KEEP | "ORIGIN LAPSED" is Latch-Child's canon registry phrase
SP2-032 | KEEP
SP2-033 | KEEP | remembersSacrilege is a real custom flag; the backwards shatter line sings
SP2-034 | KEEP
SP2-035 | KEEP | the W signature is Wren; post-ending gate is honest
SP2-036 | KEEP
SP2-037 | KEEP | "WE REGRET THE ACCURACY" — Vonn in one line
SP2-038 | KEEP | Bramble/Fennel lines are verbatim canon
SP2-039 | KEEP | "THE DIFFERENCE IS ALWAYS YOU"
SP2-040 | KEEP
SP2-041 | KEEP
SP2-042 | KEEP | spam that teaches the silt economy — the house voice
SP2-043 | KEEP
SP2-044 | KEEP | "READINESS IS THE SERVICE. — H."
SP2-045 | KEEP
SP2-046 | KEEP | Sker Vane is canon FIGURES; "Refusal twice is memorable"
SP2-047 | KEEP
SP2-048 | KEEP
SP2-049 | KEEP
SP2-050 | KEEP | appeal #1 bends the horror; amb_ala_silt verbatim ground
SP2-051 | KEEP | pers_voss_suspended is real beat-5 canon
SP2-052 | KEEP | Mira's write access is canon (amb_bourse_seals note)
SP2-053 | KEEP | Quinn "never not management" is canon
SP2-054 | KEEP
SP2-055 | KEEP
SP2-056 | KEEP | "DEPOSITS FORFEITED TO THE COUNT. FLY HER WELL."
SP2-057 | KEEP
SP2-058 | KEEP
SP2-059 | KEEP
SP2-060 | KEEP
SP2-061 | KEEP
SP2-062 | KEEP | Wraith Kell paying quietly is canon character
SP2-063 | KEEP
SP2-064 | KEEP
SP2-065 | KEEP | "You will taste the Thursday" — the censer is Choir-true
SP2-066 | KEEP
SP2-067 | KEEP
SP2-068 | KEEP
SP2-069 | KEEP
SP2-070 | KEEP
SP2-071 | KEEP
SP2-072 | KEEP | Senna is canon keeper of names
SP2-073 | KEEP
SP2-074 | KEEP | Coldburn Rey is canon FIGURES; "First round is tuition"
SP2-075 | KEEP
SP2-076 | KEEP
SP2-077 | KEEP | station_coalition is real
SP2-078 | KEEP
SP2-079 | KEEP | "the beer on it is replaced daily"
SP2-080 | KEEP
SP2-081 | KEEP
SP2-082 | KEEP | "You are being drunk to. Do not wave."
SP2-083 | KEEP | Vael clause culture is canon; 44-C-coincident is a good joke
SP2-084 | KEEP
SP2-085 | KEEP | "that is its whole personality"
SP2-086 | KEEP
SP2-087 | KEEP
SP2-088 | KEEP
SP2-089 | KEEP
SP2-090 | KEEP
SP2-091 | KEEP | the read-back at the ending screen is moralMemory made liturgy
SP2-092 | KEEP | "THE CUSTOMER IS TRYING"
SP2-093 | KEEP | "THAT IS A LIFE"
SP2-094 | KEEP
SP2-095 | KEEP
SP2-096 | KEEP | "Everything dead wants to be soil. Take 10%."
SP2-097 | KEEP | one credit and a formal apology — the roaming story's own payoff
SP2-098 | KEEP
SP2-099 | KEEP | FREQUENCY 13 is the real Reach weigh-slip sender
SP2-100 | KEEP
SP2-101 | KEEP | "[ALL OF IT]"
SP2-102 | KEEP
SP2-103 | KEEP | "BIT THREE CHILDREN'S TEETH"
SP2-104 | KEEP
SP2-105 | KEEP
SP2-106 | KEEP
SP2-107 | KEEP | "It is not a service. It is a porch."
SP2-108 | KEEP
SP2-109 | KEEP | Prof. Halev Doss is canon FIGURES
SP2-110 | KEEP | "Family is inventory. It is a compliment."
SP2-111 | KEEP | "That is all debt means here"
SP2-112 | KEEP | "WHAT IS THE MASS OF A DECISION?"
SP2-113 | KEEP
SP2-114 | KEEP
SP2-115 | KEEP | tow-cooperative pre-history is a gentle, fitting retcon
SP2-116 | KEEP | Morrow's real line and real launches counter
SP2-117 | KEEP
SP2-118 | HONE | see Hones: verify Bracket BX-9
SP2-119 | KEEP
SP2-120 | HONE | see Hones: verify Rubric HM-11
SP2-121 | KEEP | Solstice is a real data file
SP2-122 | KEEP | quill copy-stamp is real vocabulary
SP2-123 | KEEP | Ruud is real; "Stamps like that"
SP2-124 | KEEP
SP2-125 | KEEP
SP2-126 | KEEP
SP2-127 | HONE | see Hones: verify the Pallet Jack id
SP2-128 | HONE | see Hones: verify Scissorwake; keep the rule
SP2-129 | KEEP | the sole-juror recess is the wreck court's best hour
SP2-130 | HONE | see Hones: holds to SP2-120's verification
SP2-131 | KEEP
SP2-132 | KEEP | "MARRY US COMMERCIALLY"
SP2-133 | KEEP | "THAT WAS ALWAYS FAR ENOUGH"
SP2-134 | KEEP
SP2-135 | KEEP
SP2-136 | KEEP | HELIOS_ROPE_CACHE pattern is real
SP2-137 | KEEP | "HE WANTED THE BELT."
SP2-138 | KEEP
SP2-139 | KEEP | "SO THIS IS WHERE YOU ENDED UP"
SP2-140 | KEEP
SP2-141 | KEEP
SP2-142 | KEEP
SP2-143 | KEEP | same handwriting on both sides — the long game
SP2-144 | KEEP | Latch-Child returns your real loss record
SP2-145 | KEEP | "We chart the world as it is"
SP2-146 | KEEP
SP2-147 | KEEP | "The garden disagreed"
SP2-148 | KEEP
SP2-149 | KEEP | "THE DARK DID NOT WIN. WE STOPPED FOR LUNCH. RE—"
SP2-150 | KEEP
SP2-151 | KEEP
SP2-152 | KEEP
SP2-153 | KEEP
SP2-154 | KEEP
SP2-155 | KEEP
SP2-156 | KEEP
SP2-157 | HONE | see Hones: drop the Drift Choir name
SP2-158 | KEEP
SP2-159 | KEEP
SP2-160 | KEEP | "forty-one, forty-two" — the count is correct
SP2-161 | KEEP | "charts do not record what holds things together"
SP2-162 | KEEP
SP2-163 | KEEP
SP2-164 | KEEP | "KITCHEN HAS ALWAYS BEEN OPEN"
SP2-165 | KEEP
SP2-166 | KEEP | "DO NOT WAKE UNTIL THE BELT IS SAFE"
SP2-167 | HONE | see Hones: give the fitter hands
SP2-168 | KEEP
SP2-169 | KEEP
SP2-170 | KEEP
SP2-171 | KEEP
SP2-172 | KEEP | "The wall hears the maydays"
SP2-173 | KEEP | Panel Nine closes the Bay 7 chain physically
SP2-174 | KEEP | "The burn gets fed" — accurate statistics
SP2-175 | HONE | see Hones: airtime is not a resource
SP2-176 | KEEP
SP2-177 | KEEP | Kessler's nineteen years are canon graffiti
SP2-178 | KEEP
SP2-179 | KEEP
SP2-180 | KEEP
SP2-181 | KEEP | Mara and the Children are canon; witness-not-escort is their voice
SP2-182 | KEEP
SP2-183 | KEEP
SP2-184 | KEEP
SP2-185 | KEEP
SP2-186 | KEEP
SP2-187 | KEEP
SP2-188 | KEEP
SP2-189 | KEEP | "THE MASS KNEW YOU WERE COMING"
SP2-190 | HONE | see Hones: release that re-withholds
SP2-191 | KEEP | ENDING_STATION_ACK E verbatim; the blank page is the test
SP2-192 | KEEP | story_b8_helix_audit is real; "The file was a photograph"
SP2-193 | KEEP | all five endings map to real ENDING_STATION_ACK tokens
SP2-194 | KEEP | "THE DIFFERENCE IS THE ONE THAT STAYS"
SP2-195 | KEEP
SP2-196 | KEEP | "sung once, at the player, in the good way"
SP2-197 | KEEP | seven runs plus yours is the graffiti corpus continued
SP2-198 | KEEP | "THE QUESTION WAS COURTESY"
SP2-199 | KEEP | "THE ADMINISTRATIVE DEFINITION OF HOPE"
SP2-200 | KEEP | "the mass will know you again"
SP3-001 | KEEP
SP3-002 | KEEP
SP3-003 | KEEP | Borrowed Sun folding is real phase vocabulary
SP3-004 | KEEP
SP3-005 | KEEP | the canon L6 comet; absorbs SP1-068's comet road
SP3-006 | KEEP
SP3-007 | KEEP
SP3-008 | KEEP
SP3-009 | KEEP | "in vacuum there is no beam, only the pool on the rocks" — honest
SP3-010 | KEEP
SP3-011 | KEEP
SP3-012 | KEEP
SP3-013 | KEEP
SP3-014 | KEEP | 22-degree parhelia is real optics
SP3-015 | KEEP
SP3-016 | KEEP
SP3-017 | KEEP
SP3-018 | KEEP | makes the 600-second day legible everywhere
SP3-019 | KEEP
SP3-020 | KEEP
SP3-021 | KEEP
SP3-022 | KEEP
SP3-023 | KEEP
SP3-024 | KEEP | merge target for SP1-149; verified Anvil bands + weatherMeteors seam
SP3-025 | KEEP | mass made audible — the most lawlike sound in the sector
SP3-026 | KEEP
SP3-027 | KEEP | NPCs on the player's own physics
SP3-028 | KEEP
SP3-029 | KEEP
SP3-030 | KEEP | embers ARE the wreck marker
SP3-031 | KEEP | Pale Holiday canon ("signals run strange") sanctions it
SP3-032 | KEEP
SP3-033 | KEEP
SP3-034 | KEEP
SP3-035 | KEEP
SP3-036 | KEEP
SP3-037 | KEEP
SP3-038 | KEEP
SP3-039 | KEEP
SP3-040 | KEEP
SP3-041 | KEEP
SP3-042 | KEEP
SP3-043 | KEEP
SP3-044 | KEEP
SP3-045 | KEEP
SP3-046 | KEEP
SP3-047 | KEEP
SP3-048 | KEEP
SP3-049 | KEEP
SP3-050 | KEEP
SP3-051 | KEEP
SP3-052 | KEEP
SP3-053 | KEEP
SP3-054 | KEEP
SP3-055 | HONE | see Hones: traces, not a held bolt
SP3-056 | KEEP
SP3-057 | KEEP
SP3-058 | KEEP
SP3-059 | KEEP
SP3-060 | KEEP
SP3-061 | KEEP
SP3-062 | KEEP
SP3-063 | KEEP
SP3-064 | KEEP
SP3-065 | KEEP
SP3-066 | KEEP
SP3-067 | KEEP
SP3-068 | KEEP | "a dead ship becoming more dead, on its own schedule"
SP3-069 | KEEP
SP3-070 | KEEP
SP3-071 | KEEP
SP3-072 | KEEP
SP3-073 | KEEP
SP3-074 | KEEP
SP3-075 | KEEP
SP3-076 | KEEP
SP3-077 | KEEP
SP3-078 | KEEP
SP3-079 | KEEP
SP3-080 | KEEP | "LOST IN THE WIND. REPLANTED SPRING."
SP3-081 | KEEP
SP3-082 | KEEP
SP3-083 | KEEP
SP3-084 | KEEP
SP3-085 | KEEP
SP3-086 | KEEP
SP3-087 | KEEP
SP3-088 | KEEP
SP3-089 | KEEP | the light stays — a place, not a set-dress
SP3-090 | KEEP
SP3-091 | KEEP
SP3-092 | HONE | see Hones: rename Drill Choir
SP3-093 | KEEP
SP3-094 | KEEP
SP3-095 | HONE | see Hones: rename The Last Anvil
SP3-096 | KEEP
SP3-097 | KEEP
SP3-098 | KEEP
SP3-099 | KEEP
SP3-100 | KEEP
SP3-101 | KEEP
SP3-102 | KEEP
SP3-103 | KEEP | Drift Wake procession; Senna's roll is calendar canon
SP3-104 | KEEP
SP3-105 | KEEP
SP3-106 | KEEP
SP3-107 | KEEP
SP3-108 | HONE | see Hones: rename Dock Choir
SP3-109 | HONE | see Hones: Bay 7 is canon ground
SP3-110 | KEEP
SP3-111 | KEEP
SP3-112 | KEEP | namesForTheDead made audible — grounded in Senna's roll
SP3-113 | KEEP
SP3-114 | KEEP
SP3-115 | KEEP
SP3-116 | KEEP
SP3-117 | HONE | see Hones: ballistics, not gliding
SP3-118 | KEEP
SP3-119 | KEEP | "one of them is lying about being alive"
SP3-120 | KEEP
SP3-121 | KEEP
SP3-122 | KEEP
SP3-123 | KEEP
SP3-124 | KEEP
SP3-125 | KEEP
SP3-126 | KEEP
SP3-127 | KEEP
SP3-128 | KEEP
SP3-129 | HONE | see Hones: rename the Harriet Wren
SP3-130 | KEEP | "A death with manners"
SP3-131 | KEEP | "not quite SOS, just 'here'"
SP3-132 | KEEP
SP3-133 | KEEP
SP3-134 | KEEP
SP3-135 | KEEP
SP3-136 | KEEP | your death gets the wrecks' grammar
SP3-137 | KEEP
SP3-138 | KEEP
SP3-139 | KEEP
SP3-140 | KEEP
SP3-141 | KEEP
SP3-142 | KEEP
SP3-143 | HONE | see Hones: rename Choir Trawl
SP3-144 | KEEP
SP3-145 | KEEP | the canon Pale Holiday jukebox line, promoted to an event
SP3-146 | KEEP
SP3-147 | KEEP
SP3-148 | KEEP
SP3-149 | KEEP
SP3-150 | KEEP
SP3-151 | KEEP
SP3-152 | KEEP
SP3-153 | KEEP
SP3-154 | KEEP
SP3-155 | KEEP
SP3-156 | KILL | a desaturation patch with no mass, signal, or story is a post filter, not a place — its own seam admits it
SP3-157 | KEEP
SP3-158 | KEEP
SP3-159 | KEEP
SP3-160 | KEEP
SP3-161 | KEEP
SP3-162 | KEEP
SP3-163 | KEEP | weather as archaeology — the storm's old footprint
SP3-164 | KEEP
SP3-165 | KEEP
SP3-166 | KEEP
SP3-167 | KEEP
SP3-168 | KEEP | digits counting real weather phases — the forecast is the sim's own
SP3-169 | KEEP
SP3-170 | KEEP
SP3-171 | KEEP
SP3-172 | KEEP
SP3-173 | KEEP
SP3-174 | KEEP
SP3-175 | KEEP | per-station offsets already exist; this one is just noticed
SP3-176 | KEEP
SP3-177 | KEEP
SP3-178 | KEEP
SP3-179 | KEEP
SP3-180 | KEEP
SP3-181 | KEEP
SP3-182 | KEEP
SP3-183 | KEEP | "no echo at all, which regulars find ominous"
SP3-184 | KEEP | Tally Eve's canon fine-posting made public
SP3-185 | KEEP
SP3-186 | KEEP
SP3-187 | KEEP
SP3-188 | KEEP
SP3-189 | KEEP | "nobody scheduled and everyone keeps" — festival text verbatim
SP3-190 | KEEP
SP3-191 | KEEP
SP3-192 | KEEP
SP3-193 | KEEP
SP3-194 | KEEP
SP3-195 | KEEP
SP3-196 | KEEP
SP3-197 | KEEP
SP3-198 | KEEP | BORROWED_SUN_PHASES is real
SP3-199 | HONE | see Hones: attribute the 500s in-world
SP3-200 | KEEP

## MY-500

SP2-050, SP2-012, SP2-004, SP2-160, SP2-011, SP2-010, SP2-009, SP2-006, SP2-007, SP2-003, SP2-001, SP2-005, SP2-194, SP2-190, SP2-027, SP2-031, SP2-029, SP2-035, SP2-137, SP2-166, SP2-197, SP2-199, SP2-200, SP1-080, SP1-183, SP1-060, SP1-078, SP1-099, SP1-161, SP1-189, SP2-116, SP2-117, SP2-121, SP2-065, SP2-099, SP2-100, SP2-091, SP2-072, SP2-046, SP2-082, SP1-144, SP1-015, SP2-181, SP2-192, SP2-184, SP2-196, SP2-093, SP2-097, SP2-107, SP2-112, SP1-046, SP1-195, SP1-002, SP3-163, SP3-189, SP3-002, SP3-025, SP3-081, SP3-188, SPX-C-03, SP1-001, SP1-003, SP1-004, SP1-005, SP1-006, SP1-007, SP1-008, SP1-009, SP1-010, SP1-012, SP1-013, SP1-014, SP1-016, SP1-017, SP1-018, SP1-019, SP1-021, SP1-022, SP1-024, SP1-025, SP1-026, SP1-027, SP1-028, SP1-029, SP1-030, SP1-031, SP1-032, SP1-033, SP1-035, SP1-036, SP1-037, SP1-038, SP1-039, SP1-040, SP1-041, SP1-042, SP1-043, SP1-045, SP1-047, SP1-050, SP1-051, SP1-054, SP1-055, SP1-056, SP1-057, SP1-059, SP1-061, SP1-062, SP1-063, SP1-064, SP1-065, SP1-067, SP1-069, SP1-070, SP1-071, SP1-072, SP1-073, SP1-074, SP1-075, SP1-076, SP1-077, SP1-079, SP1-082, SP1-083, SP1-084, SP1-085, SP1-086, SP1-087, SP1-089, SP1-090, SP1-091, SP1-092, SP1-093, SP1-094, SP1-096, SP1-097, SP1-098, SP1-100, SP1-101, SP1-102, SP1-103, SP1-104, SP1-106, SP1-107, SP1-108, SP1-109, SP1-110, SP1-112, SP1-113, SP1-114, SP1-115, SP1-116, SP1-118, SP1-119, SP1-120, SP1-121, SP1-122, SP1-124, SP1-128, SP1-129, SP1-131, SP1-132, SP1-134, SP1-135, SP1-137, SP1-138, SP1-139, SP1-140, SP1-141, SP1-142, SP1-145, SP1-146, SP1-150, SP1-151, SP1-152, SP1-153, SP1-154, SP1-155, SP1-157, SP1-158, SP1-160, SP1-162, SP1-163, SP1-164, SP1-165, SP1-166, SP1-167, SP1-168, SP1-169, SP1-170, SP1-171, SP1-173, SP1-174, SP1-176, SP1-178, SP1-179, SP1-181, SP1-182, SP1-186, SP1-190, SP1-191, SP1-192, SP1-193, SP1-194, SP1-196, SP1-197, SP1-198, SP1-200, SP2-002, SP2-008, SP2-013, SP2-014, SP2-016, SP2-017, SP2-018, SP2-019, SP2-020, SP2-022, SP2-023, SP2-024, SP2-025, SP2-026, SP2-030, SP2-032, SP2-033, SP2-036, SP2-037, SP2-038, SP2-039, SP2-040, SP2-042, SP2-043, SP2-044, SP2-047, SP2-051, SP2-052, SP2-054, SP2-056, SP2-057, SP2-060, SP2-061, SP2-062, SP2-063, SP2-066, SP2-067, SP2-068, SP2-069, SP2-070, SP2-071, SP2-073, SP2-074, SP2-075, SP2-078, SP2-079, SP2-080, SP2-081, SP2-083, SP2-085, SP2-086, SP2-088, SP2-090, SP2-092, SP2-095, SP2-096, SP2-102, SP2-103, SP2-104, SP2-105, SP2-106, SP2-108, SP2-109, SP2-110, SP2-111, SP2-115, SP2-118, SP2-119, SP2-120, SP2-122, SP2-124, SP2-125, SP2-126, SP2-127, SP2-128, SP2-129, SP2-130, SP2-131, SP2-133, SP2-134, SP2-135, SP2-136, SP2-138, SP2-139, SP2-140, SP2-141, SP2-142, SP2-143, SP2-144, SP2-146, SP2-147, SP2-148, SP2-149, SP2-151, SP2-154, SP2-156, SP2-157, SP2-158, SP2-159, SP2-161, SP2-163, SP2-164, SP2-165, SP2-168, SP2-170, SP2-171, SP2-172, SP2-173, SP2-174, SP2-175, SP2-176, SP2-177, SP2-178, SP2-180, SP2-183, SP2-185, SP2-187, SP2-188, SP2-189, SP2-191, SP2-193, SP2-195, SP2-198, SP3-001, SP3-003, SP3-004, SP3-005, SP3-006, SP3-007, SP3-009, SP3-010, SP3-011, SP3-012, SP3-013, SP3-014, SP3-015, SP3-017, SP3-018, SP3-019, SP3-021, SP3-022, SP3-023, SP3-024, SP3-026, SP3-027, SP3-028, SP3-029, SP3-030, SP3-031, SP3-032, SP3-033, SP3-034, SP3-035, SP3-036, SP3-037, SP3-038, SP3-040, SP3-041, SP3-042, SP3-043, SP3-044, SP3-045, SP3-047, SP3-048, SP3-049, SP3-050, SP3-051, SP3-052, SP3-053, SP3-054, SP3-056, SP3-057, SP3-058, SP3-059, SP3-060, SP3-061, SP3-062, SP3-063, SP3-065, SP3-066, SP3-068, SP3-069, SP3-070, SP3-071, SP3-072, SP3-074, SP3-075, SP3-076, SP3-077, SP3-078, SP3-079, SP3-080, SP3-082, SP3-083, SP3-084, SP3-085, SP3-086, SP3-088, SP3-089, SP3-092, SP3-093, SP3-094, SP3-095, SP3-096, SP3-097, SP3-099, SP3-100, SP3-102, SP3-103, SP3-104, SP3-106, SP3-107, SP3-108, SP3-109, SP3-110, SP3-112, SP3-113, SP3-114, SP3-115, SP3-118, SP3-119, SP3-120, SP3-121, SP3-122, SP3-123, SP3-124, SP3-125, SP3-126, SP3-127, SP3-128, SP3-129, SP3-130, SP3-131, SP3-132, SP3-133, SP3-134, SP3-135, SP3-136, SP3-138, SP3-140, SP3-141, SP3-142, SP3-143, SP3-144, SP3-145, SP3-146, SP3-148, SP3-149, SP3-150, SP3-151, SP3-152, SP3-155, SP3-157, SP3-158, SP3-160, SP3-161, SP3-162, SP3-164, SP3-165, SP3-167, SP3-168, SP3-169, SP3-170, SP3-171, SP3-173, SP3-174, SP3-175, SP3-176, SP3-179, SP3-180, SP3-181, SP3-182, SP3-183, SP3-184, SP3-185, SP3-186, SP3-187, SP3-190, SP3-191, SP3-193, SP3-195, SP3-197, SP3-198, SP3-199, SP3-200, SPX-C-01, SPX-C-02, SPX-C-04, SPX-C-05, SPX-C-06, SPX-C-07, SPX-C-08
