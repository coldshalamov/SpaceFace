# Alien-ecology program — actualization tracks (post-Phase-31 directions)

Status: brainstorm inventory, 2026-09-28. Ten axes that take the implemented
fiction (contamination C / revelation R, the machine layer, the evidence ledger)
into mechanics the player touches every flight — not more content, more *surface
area*. Each item names the real seam it builds on so a follow-on agent can open
the file and start. IDs continue the program series (AE-300+).

## T1 — Contamination as navigable terrain (chart layer)

C already exists as a physical quantity; it is not yet a *map* quantity.

- AE-300 — starmap sector cards render a C-band glyph once `ae.mapKnowledge` has
  any row for the sector (data exists; `src/ui/` starmap screen is the sink).
- AE-301 — gate-route coloring: routes whose destination reads C4+ tint on the
  route planner (`src/systems/missions.js` route previews + starmap path draw).
- AE-302 — autopilot hazard preference: route-follower weights legs by known C,
  adding a "sterile corridor" bias option in settings.
- AE-303 — localmap anomaly layer toggle: POIs carrying `runtimeOwner:
  'alienEcology'|'machineLayer'` filterable as one class.
- AE-304 — survey-data sale: a fresh `economy:tradeCompleted` sink sells recorded
  `recordContaminationKnowledge` rows to the faction with
  `CONTAMINATION_FACTION_POLICY.interest` — knowledge as cargo.

## T2 — The growth gets aboard (ship-interior consequences)

Exposure is a meter; it should be a smell in the cockpit.

- AE-305 — biofilm creep: an infested cargo lot gains usedMass slowly while
  `ae.exposure > 0.5` (cargo tick owner; `commodityIsBiohazard` gate).
- AE-306 — `mod_quarantine_hold_s` module: biohazard lots stop accruing exposure
  while fitted (new mods key + `fittedFlag` read in the exposure model).
- AE-307 — airlock purge verb at station services: fixed-fee exposure reset at a
  surrender-price premium where `containmentSeal` would apply.
- AE-308 — hull risk: exposure ≥0.85 adds a small hull-fatigue drain on boost —
  the body pays for the route choices.
- AE-309 — seam scars: purged/failed quarantines stamp a permanent flag on the
  active hull shown in outfitting (ship data field + one outfitting line).

## T3 — A market for the uncanny (economy layer)

The harvest economy exists; the *financial* layer doesn't.

- AE-310 — spore futures: biohazard lot price curves by sector C at sale time
  (economy pricing reads `pointContaminationAt`).
- AE-311 — confiscation auctions: sealed-by-customs biohazard lots return at
  flagged stations as timed one-off listings (`ae.factionConsequences` feeds it).
- AE-312 — research contracts board: a station screen buys `ae.evidence` tiers —
  tier-1 rows sell, tier-3 rows are priceless and stay (missions data + screen).
- AE-313 — specimen transport missions: `cmdty_live_specimen` deliveries with a
  decay timer and a custody chain (missions.js templates + cargo expiry).
- AE-314 — contamination insurance: a per-dock premium scaled by sector C —
  hulls flying into C5 space pay real credits or fly uninsured.

## T4 — Ecology as ordnance (combat & encounter layer)

Suppression pockets and fauna drives are already sim objects; weaponize them.

- AE-315 — `mod_suppression_bomb_m`: deployable that mints a timed dead pocket
  (new deploy kind + suppression query overload).
- AE-316 — bloom-defense setpiece trigger: protect a pylon pulse through a
  wave — N03's machinery driven as a defended objective.
- AE-317 — shepherd-corridor escort missions: convoy legs through a live
  shepherd pocket (the moving pocket is already queryable).
- AE-318 — herd-the-swarm: lure-stimulus items that panic fauna onto a vector —
  existing impulse channels (`sectorsim:impulse`) carrying a lure vector.
- AE-319 — quarantine-breach events: sealed station content spills into sector
  combat after a refused custody handoff (`factionConsequences.refused` ≥ 3).

## T5 — Stations notice (place layer)

Stations are the only places the fiction hasn't entered.

- AE-320 — quarantine docs at ingress: docking UI adds a biohazard declaration
  step where a biohazard lot is in hold (`commodityIsBiohazard` read at dock).
- AE-321 — one converting station: a listed station drifts C over save epochs —
  its services degrade and its broadcast changes (station data + a slow flag).
- AE-322 — bar vignettes: O-table rows render as rumor paragraphs in the bar
  screen keyed by the sector's C band (bark text already authored).
- AE-323 — bio-lock denial: outfitting/refit refuses a biofilm-positive hull at
  a clean station — the denial text is the fiction, not just a red button.
- AE-324 — dock-side scanner brief: the station departure screen lists the C
  band of the sector you're undocking into (mapKnowledge read).

## T6 — Machine language as a skill (protocol/diplomacy layer)

The ladder exists; it's binary. Make grammar a player skill.

- AE-325 — directive composer: at a console, assemble directive fragments
  (VACATE/HOLD/WITNESS verbs) and see the clerk's parse (appeals_clerk seam).
- AE-326 — machine standing axis: a reputation separate from `machineProtocol`
  — deeds accrue (`ae.machineAccess` extended into a ledger).
- AE-327 — appeal hearings: the exception chamber runs a timed, physical
  adjudication — hold position, answer with movements (setpiece engine).
- AE-328 — courier hijack: intercept a courier mid-route, spoof its token,
  change a route authority for a session (kinematics already give legs).
- AE-329 — a second jury: `sleeping_jury` at a new site wakes on a different
  verdict class — the P-table gets a second season.

## T7 — The organisms are a food web (fauna layer)

Species exist; they don't yet eat each other.

- AE-330 — lifecycle stages: species carry larval/adult/bloom phases — drive
  FSM gains a growth axis (fauna spec + drive states).
- AE-331 — trophic edges: a predator species reads small fauna as targets —
  `carrierSpecies` gain `preysOn` and the drive adds a hunt branch.
- AE-332 — migration events: once per sector-epoch, a species band relocates —
  the map learns routes, not just sites.
- AE-333 — station vivarium: live specimens can be displayed for a standing
  credit trickle (a second use for `cmdty_live_specimen`).
- AE-334 — apex hunts: awakened C5 fauna generate bounty offers on the mission
  board (revelation 3 + an awake record gates the offer).

## T8 — The body keeps score (first-person exposure)

Exposure clears too cleanly; make it a cost curve the player feels.

- AE-335 — scanner artifacts: exposure ≥0.6 injects phantom returns near real
  fauna (phantom-contact layer already exists for spore-wake).
- AE-336 — kin state: exposure ≥0.9 makes fauna read you as kin — drives skip
  flee/attack for a timed window (N12's machinery generalized).
- AE-337 — medical purge: a station service clears exposure at a scar cost —
  purge is a trade, not a fix.
- AE-338 — exposure HUD creep: at high exposure the flight HUD's fringe gains a
  filament overlay (render-side, gated on ae.exposure).
- AE-339 — exposure ledger: claims/ledger screen records max exposure, purges,
  and kin-state minutes as career stats.

## T9 — The galaxy remembers (persistence layer)

Sites persist per save; the galaxy's story should persist between visits.

- AE-340 — epoch clock: each sector-visit stamps lastVisitS; sites recalc beats
  across absences so a severed nursery reads scarred on return.
- AE-341 — NPC counter-ops: SCN purge teams spawn as hostile operators at
  high-C alien sites — the faction does its own surgery.
- AE-342 — news reaction: severing/blooming a site emits a news row into the
  existing news pipeline (newsTemplates channel is already a manifest kind).
- AE-343 — rumor spread: neighboring sectors' bar talk reflects your last
  three site actions (bark deck keyed by recent ae events).
- AE-344 — campaign C drift: sectors track a slow baseline drift; a save's
  galaxy ages across long play (epoch counter on ae).

## T10 — The mystery you can hold (research UX layer)

The evidence ledger is data; it wants a face.

- AE-345 — field notebook screen: `ae.evidence` rendered as a dossier — tier,
  source, the one-line text (new station/deck screen; read-only data sink).
- AE-346 — taxonomy tree: revelation tiers shown as a research tree — what you
  proved, what the next tier needs (taxonomy flags + evidence tiers).
- AE-347 — chart annotations: recorded C readings write pins onto localmap
  (mapKnowledge rows → localmap overlay).
- AE-348 — the institute: a contact persona on the comms ledger that grades
  filings — a graded-by-AI research loop (comms + evidence events).
- AE-349 — the filing review: an endgame screen that re-renders what you
  proved across a save — the P-table as a book that closes.
