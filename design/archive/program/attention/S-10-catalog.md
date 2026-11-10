# S-10 catalog — Ashfall Reach (`sector_ashfall_reach`)

Ledger register: raider territory, rust + sodium / raider poetry, blade culture. Sanctioned
detail: totem wrecks, challenge barks, graffiti.

## What the player literally perceives
- `src/data/sectors.js` — tier 4 uncharted raider sector, security 0.05, faction_vael,
  threat vael. One rep-gated blackmarket (Ruined Cache Station — "buys what shouldn't exist"),
  two rare-exotic fields, the moving Roaming Burn radiation storm (840 WU core on a
  deterministic clock, calms after the boss falls), debris hazards.
- POI stack: `poi_boss` (Iron Maw arena — plated + defeatNews), `poi_vault` (Deep-Mother Vault,
  hidden behind the boss — plated), `poi_vault_maw` (pre-collapse archive — plated + landmark
  lore C4), plus NINE anomaly POIs unplated: Breathing Dock, Gate Underlayer, Ranked Frames,
  Black Vault, Active Maintenance, Converted Yards, Towed Moonlet, Old Sterile Zone, The Line —
  each backed by an authored `authoredPlaces.js` zone `reason`.
- Band: `numbers_22` "ASHFALL. TWO. HOLD THE LINE OPEN." already exists. The Static is the
  raider-adjacent roast channel (danger-biased — loudest in low-security sectors).
- Voice: `faction_vael` is the clause-numbered accord register — its scan cell already
  references Ashfall ("Ashfall relay clause: the Deep-Mother's arena is registered ground").
  `faction_pitborn` is the yard/kin/scrap register — the raider blade-culture voice.
- Graffiti `tag_loc_100`-`tag_loc_110` + ads `ad_pulse_073`-`ad_pulse_080` carry vael/pitborn
  station texture (exact-count pack — can't extend).

## What is thin
- Nine anomaly POIs file empty discovery records — the sector's entire deep map is silent at
  the journal level. The three bosses/archives are plated; everything around them is not.
- "Challenge barks" register is sanctioned but unfilled: vael taunt/warn/demand-cargo cells
  are generic accord-speak with one Ashfall nod; pitborn has no blade-culture lines at all.
- The raider-poetry register (wreck totems, blade names, the burn as weather) exists in the
  vault/maw lore but not on the radio.

## Tone register
Raider poetry under alien contract law: knives counted like verses, the burn as a liturgy,
salvage priced in provenance. Vael speaks in clauses; Pitborn speaks in kin-and-scrap.

## Additive seams (clean files)
- `sectors.js` — `discoveryPlate` on the nine anomaly POIs (all mark-blocked types).
- `barks.js` — base-cell appends to `faction_vael` (taunt, warn, demand-cargo) and
  `faction_pitborn` (taunt, warn) — the challenge-bark surface.
- `contactHail.js` — `faction_vael` hostile + `faction_pitborn` hostile challenge hails.
- `flavor/040-band.js` — `the_static` raider chatter (toll/blade/vault lines).
- NOT used: `graffiti`/`ad_board` (exact counts), `landmark_lore` (exact 19), `rim_poi_lore`
  (no consumer), encounters/props (new machinery).
