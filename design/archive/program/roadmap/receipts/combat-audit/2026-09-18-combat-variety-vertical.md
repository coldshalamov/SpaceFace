# Combat variety vertical — audit-then-rebuild receipt (2026-09-18)

Instrument: `scripts/lib/bench/crucibleBench.mjs --duel-audit` — scripted 1v1 and 2v2 duels per
roster archetype on fixed seeds (4242, 8008, 13502), on the real production runtime (rapier-dynamic,
SG-06 tactical AI, real weapons, real mines/attachments). 15 fight archetypes x {1v1, 2v2} x 3 seeds
= 90 duels per arm. Log files in this directory; `duel-audit-STOCK.json` / `duel-audit-POST.json`
carry the full per-pair evidence.

## Arms

- **STOCK** (`--stock-doctrines`): every hull fights with its stock enemy-def doctrine
  (`ai.identityStock` opt-out), i.e. the pre-identity baseline, on the same tree and instrument.
- **POST** (default): the identity layer active — `ENEMY_DOCTRINE_OVERRIDES` (combatDefs.js)
  stamped by `tacticalAI.stampManeuverIdentities`, wing grammar + twist clauses in `squad.js`,
  boss choreographies for the three CAPITAL_BOSSES missions.

## The diagnosis (baseline)

The stock roster collapses onto two machines: seven hulls run `interceptor_flyby`
(wasp, zealot, reaver, corsair, lawman, cutter, PD screen) and three run `ranged_disengager`
(lancer, ghost, jackal) with identical phase timings — by construction those hulls were the same
fight with different HP. The stock audit's differing-dimension histogram and same-fight pairs name
them: 12 pairs of cells were **fully identical** across every measured dimension and 68/210 pairs
sat inside the same-fight tolerance. Stock counterplay across the whole suite: attach + cut_line
(tether raider) and snare_field (anchor controller) only — the mine-layer never laid a mine (it
was flying the kiter machine).

## The rebuild

Six maneuver identities + boss choreography, all in owned files:

| identity | archetypes | machine (src/ai/combatDoctrine.js) | signature |
|---|---|---|---|
| swarm | wasp_swarmer, choir_zealot | `swarm_pack` | 200 WU ingress, telegraphed 20-44t strikes, tight extend; pass rhythm, not sieges |
| kiter | lancer_sniper, quiet_ghost | `ranged_disengager` (kept) | standoff orbit, weapon_charge windows, displace-on-reset |
| mine-layer | mine_layer_jackal | `mine_layer_wake` | flank → `wake_mines` telegraph → drop line (real mines via `ai/mineLayerVerb.js` + mines system) → disengage |
| shield-breaker | corsair_raider | `shield_breaker` | `shield_lance` telegraph → ion/plasma burst (action_burst) → peel while the target is scrambled |
| brawler | bruiser_brawler, mirrorjaw | `brawler_commit` (kept) | committed orbit at 140 WU |
| boarder | tether_control_raider | `tether_control_raider` (kept) | attach/reel/cut counterplay |
| — | field_anchor_controller | `field_anchor_controller` (kept) | snare-field area denial |
| — | warden_escort, pd_screen_escort | `escort_screen` (pd screen moved off the raider flyby) | ward screen + breach dart |
| boss x3 | CAPITAL_BOSSES missions | `capital_broadside` / `_tollman` / `_ala` | hull-fraction stages (66% / 33%), each act its own telegraph cue + cadence (pd_wall, toll_run, grave_pull, ashfall_enrage…) |

Wing grammar (`WING_COMPOSITION_GRAMMAR`, `TWIST_CLAUSES` in combatDefs.js; consumed by
`src/ai/squad.js`): every wing of 2+ resolves roles (press / flank / screen / kite /
area_denial / shield_breaker) and exactly ONE seeded twist clause (synchronized_strike,
seed_the_exit, drain_then_commit, repositioning_fire, protect_the_pack, feigned_break,
focus_the_soft) that modulates tactic weights or target allocation. Directive carries
`wingRole` + `twist` for inspection.

## Results (same classifier both arms; same-fight = <=2 of 12 dimensions differ)

Final A/B (refined classifier with phase_vocabulary + maneuver_mix dimensions; identical seeds,
identical tree, only the identity stamp differs between arms):

| metric | STOCK (pre-identity) | POST (identities) |
|---|---|---|
| differing-dimension histogram (0 / 1 / 2 / 3+ of 12) | 0:7  1:9  2:20  3+:174 (82.9%) | **0:2  1:5  2:9  3+:194 (92.4%)** |
| same-fight pairs | 36/210 (32 of them share a stock doctrine by construction) | **16/210**, of which 9 are same-identity roster mates (wasp==zealot, lancer==ghost — by design) and 7 cross-identity, each differing on exactly 2 marginal dimensions |
| fully-identical pairs (0 differing dimensions) | **7** — whole cells indistinguishable from each other | **2** (the two same-identity roster mates) |
| counterplay behaviors that fired | attach:45, cut_line:44, snare_field:59 (3 kinds) | attach:44, cut_line:44, snare_field:55, **mines:39** (4 kinds) |
| B3b hostile-in-frame, survival cell (helios/energy, 3 seeds) | — | **98.7% / 100% / 99.7%, all MET** (bar 0.80; owner's last number 75.7% RED) |
| B13 ambient knocks/min, survival cell s4242 | 4.0 (morning receipt) | 2.67 (bar 2; heading changes 0) |

The stock run's 7 fully-identical pairs are the audit's namesake: wasp, zealot, reaver, cutter,
lawman, corsair and PD-screen cells were literally the same fight cell-for-cell before the
identities. Post-identity, only the two roster mates that deliberately share the swarm identity
remain fully identical. The 7 remaining POST cross-identity pairs each differ on exactly two
marginal dimensions (e.g. fire_pressure + phase_vocabulary) — fights at the same bar, not the same
fight. Determinism note: two identical POST-arm launches produced byte-identical 90-run logs and
summaries — the instrument is seed-stable end to end.

## Known honest gaps

- Same-identity roster mates (wasp==zealot, lancer==ghost) read as the same fight **by design** —
  they share an identity and differ by stats; 6 identities cover 17 hulls.
- The duel classifier's set dimensions (telegraphs/statuses) degenerate to "equal" when short 1v1
  fights end before any telegraph; the phase_vocabulary + maneuver_mix dimensions were added to
  counter exactly this.
- Degenerate flee cells exist in BOTH arms (tether 2v2 s13502 walked ~10k WU; PD 2v2 s4242 ~5.3k):
  low-hull morale flee + 960 WU egress points stack when the pilot cannot finish the wing. Authored
  behavior, not an identity regression.
- The dreadnought 2v2 cell resolves in ~12s in BOTH arms (stock doctrine, pre-existing) — the
  capital dies to something other than pilot DPS in wing fights; needs its own investigation
  (out of this vertical's ownership: combat.js/missions.js stat owners).
- Wasp swarm cells deal ~0 damage to the duel pilot in 1v1 (they die in ~4.5s having flown one
  pass); the machine cycles and fires on the passive-target probe (15 strikes, 6 damage events over
  60s), so the fire chain works — the one-pass lifespan is the limiter, not a broken gate.
- B13's full pass still requires headed jitter measurement (headless can never set jitterMeasured).

## Tests

- `test/combat-doctrines.test.mjs` (doctrine catalog pin extended for the 5 new ids) — pass.
- `check:baseline` 15/15; `check:crucible:arc` 15/15; ai-maneuver/crucible-real-path/fun-measurer
  43/43; squad/doctrine/engagement suites 44/44.
- `test/combat-ecology-roles.test.mjs` has 2 PRE-EXISTING failures (ghost preferredRange data vs
  test pin; reads only src/data/enemies.js + makeEnemySpawnSpec — untouched by this vertical).
