# SPEC2/05 — ECONOMY SURFACING & THE 30-HOUR LADDER

**Owner lane:** systems agent. Read `spec2/00_MASTER_TASTE.md`. The economy sim is the crown jewel —
this spec SURFACES it and paces the climb; it does not rebuild pricing math.
**Files:** `src/ui/screens/{market,starmap,localmap}.js`, `src/systems/{economy,missions,mining}.js`
(hooks only), `src/data/{ships,modules,mining,commodities}.js` (tuning), `design/CONTENT_BIBLE.md`
(update tables in the same PR), new `scripts/check-price-memory.mjs`.

## 1. Price memory (Elite's market data — knowledge as loot)
- `state.player.marketMemory[stationId][commodityId] = { buy, sell, seenAt }` written on every dock
  and every market open. Serialized in saves. NO omniscience: only visited stations.
- **Nav chart overlay** (starmap): commodity selector dropdown → stations annotate with last-seen
  sell price + age tint (fresh < 10 min cyan, < 60 min white, older gray italic).
- **Market screen:** per-commodity "best known" line: "Best known sell: 212 cr — VESTA FORGE
  (14 min ago, 2 jumps)". Clicking it sets course (existing route planner).
- **Trade ledger** (market tab addition): last 10 trades with per-unit margin vs your buy price.
  Green/red by profit. This is the whole "am I a good trader" feedback loop.

## 2. Mining completions (C2 + C3 from BUILD_PLAN — the loop-lock)
- **Rich cores (C2):** 15% of asteroids (deterministic per asteroid id) expose a core on fracture:
  a 3.5 s shrinking ring minigame (drill screen already exists — reuse its surface). Hold RMB to
  charge; release inside the ring → 3–8× rare ore (tier+1 table); miss → core vaporizes with a
  sad fizzle (no punishment beyond loss). Ring window scales 22%→12% of radius by sector tier.
- **Tether-haul (C3):** chunks > 20 u (fracture already spawns them) can't be beamed — tether them
  (they're attachables) and haul to any refinery station: docking-range delivery pays
  `mass × basePrice × 0.8` minus 6% refinery fee. New contract type 'bulk_haul' on boards at belt
  stations (uses existing mission plumbing + payload combat profile). THE POINT: mining teaches the
  tether; the tether feeds mining.

## 3. The ladder (pace to fantasy — tune, don't invent)
Targets (median player, telemetry-verified): Kestrel start → first module 20 min → Wasp-class
(agile) ~90 min → first freighter ~4 h → corvette w/ turret ~8 h → sector-boss capital ~20 h.
- Audit `src/data/ships.js` prices against these using `check:balance` route-profit anchors;
  adjust PRICES (not incomes) to hit the curve.
- **Role kits (new modules, 6 total, data-only):** `mod_ram_plate` (collision dmg −60% self, +80%
  dealt, tier 1 — teaches mass-as-weapon early), `mod_winch_hd` (reel rate ×1.8, tether break
  +25%), `mod_charge_rack` (impulse-charge capacity 4→8), `mod_drill_amp` (vent-bonus window
  +6 heat, rich-core ring +4%), `mod_survey_suite` (scanner radius ×1.5, pings persist ×2),
  `mod_smuggler_hold` (20% cargo hidden from scans, illegal to carry). Slot/power costs per the
  existing fitting budgets; prices ladder 6k→38k.
- **Sinks stay honest:** repairs, refinery fees, charge ammo, survey data, tolls. No fuel mechanic
  (locked decision — travel friction comes from time/danger, not resource nagging).

## 4. Contract board polish (surfacing only)
Board rows gain three glyphs: risk (▲ count = danger tier), distance (jumps), payout/min estimate
(existing reward ÷ estimated time — show "≈"). Sort defaults to payout/min. One recommended row
keeps its glow. Bar rumors may inject one 'hot tip' contract per visit (+15% payout, 30 min expiry).

## 5. Acceptance assertions
1. `check-price-memory.mjs`: dock two stations, reload save, memory survives; overlay renders only
   visited stations; best-known line matches recorded data exactly.
2. Rich core: deterministic per seed (same asteroid → same core across runs); hit pays 3–8×; miss
   pays 0 and emits one fizzle cue. `check:mining:2` extended accordingly, stays green.
3. Bulk haul: tether a 25 u chunk to a refinery in the harness → credits = formula ± 1 cr;
   contract variant completes via existing mission events.
4. `npm run check:balance` green after price tuning; CONTENT_BIBLE tables updated in-PR.
5. All six modules purchasable, fit within existing power/CPU budgets, and each changes its stat
   measurably in the fitting preview (assert derived-stat deltas ≠ 0).
