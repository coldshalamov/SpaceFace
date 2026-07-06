# SPEC3-F2 — Mining & Resources (specs 13–15)
**Thread:** F2 · **Reads:** `_context/02_SIM_ECONOMY_WORLD.md` §0.1/§3.5/§6, GDD §5 · **Status:** PLAN
**Thread pitch:** finish mining's arc from chore → craft → industry: mastery polish on the Mining 2.0
minigame, a refining/production chain that makes ore *mean* something, and a prospecting loop that
makes finding the rock as fun as cracking it.

Ground truth: `src/data/mining.js` holds 18 ORES / 6 ASTEROIDS / 4 BEAMS / 4 RECIPES / 4 FIELDS.
Mining 2.0 (seams 100%/35% yield, heat vent-bonus band 70–95 → +25% 2 s, fracture into chunks +
auto-vacuum magnet 420 wu, rich cores 15% with timed drill shot 3–8×, danger/noise meter via
`dangerModel.js`) is BUILT and green (`npm run check:mining:2`). Ore ladder: silicate 8 cr → iron 28
→ platinoid 150 → einsteinium 2k → emerald 5k → ruby 20k → diamond 100k → amazonite 500k.
Blueprints: 19 `bp_*` — 7 refine (no tech), 5 assemble, 3 augment, 4 ship. Refinery outposts convert
2 ore→1 alloys; claims can mount an On-Site Refinery (0.5/s). Drill minigame bench: `drill.js` (75KB).
The vent determinism gate in weapons.js is unrelated to mining heat — but the same discipline applies.

---

## SPEC3-13 — Mining mastery: from minigame to craft
**One-line pitch:** deepen the built Mining 2.0 loop with mastery expression — beam finesse, chunk
play, and asteroid *character* — so hour-40 mining feels like skilled work, not repetition.

### 1. Why
Mining 2.0 fixed the chore (seams/rhythm/vacuum). What it lacks is a ceiling: every asteroid plays
the same once you've learned the rhythm, and the tether (F3-17) — mining's designed dance partner —
isn't in the loop yet. DRG's lesson: mining stays hypnotic when *terrain* varies the choreography.

### 2. The design
- **Asteroid character (data, not code):** the 6 asteroid types get *behavior signatures*:
  spin rate class (slow/tumbling/erratic), seam count/pattern (belts, poles, spirals), shell
  hardness (off-seam multiplier 0.35 → 0.15 for armored cores), and fracture style (clean split /
  shrapnel burst / core-expose). Reading a rock before burning becomes the skill's first beat —
  and the scanner pulse (F2-15) is how you read it.
- **Beam finesse:** holding the beam *on-seam through rotation* pays a growing "tracking bonus"
  (+2%/s up to +20%) that resets off-seam. The vent-bonus rhythm (built) plus tracking makes expert
  mining measurably ~1.6× novice yield — mastery you can feel, no new UI.
- **Chunk play (the tether lock-in):** fracture chunks >20 u are tether cargo (GDD §5.5): winch,
  sling into your magnet cone, or haul to refineries (F2-14 pays bulk rates). Slinging a chunk
  *through* the beam line shatters it into vacuumable ore — the discovered trick that makes veterans
  grin. Chunk mass obeys F5 cargo-mass law: hauling changes your handling.
- **Volatile pockets:** 10% of seams are volatile (amber glow): overheating ON them detonates —
  damage + scatter + noise spike (danger meter). Vent discipline gets teeth; greed gets loud.
- **The quiet-mining stance:** beam at ≤60% power = half yield rate, −70% noise. Sneak-mining rich
  fringe fields becomes a real playstyle (feeds F4-21's pressure budget).

### 3. Architecture & wiring
All in existing `src/systems/mining.js` + `src/data/mining.js` (signatures are data per ASTEROID
type; tracking bonus is a per-target accumulator in mining state; volatile = seam flag consumed by
the heat handler). Chunk↔tether: chunks are already physics bodies; F3-17's tetherSystem validates
them as anchors — this spec adds the shatter-on-beam interaction (raycast the beam line vs chunk,
emit `mining:chunkShattered`). Noise/power stance: input = hold-modifier on RMB; noise routes into
`dangerModel.js` (exists). Determinism: seeded per sector as today; `check:mining:2` stays the
floor, extended.

### 4. Key code
```js
// Tracking bonus — the accumulator must live on the TARGET, not the beam: swapping rocks resets
// honestly, and two-rock juggling (advanced play) keeps two independent bonuses warm.
const t = state.mining.tracking;                     // Map<asteroidId, {onSeamS}>
if (hit && hit.onSeam) { e.onSeamS = Math.min(10, e.onSeamS + dt); }
else if (hit) { e.onSeamS = 0; }                     // off-seam on the SAME rock: reset (discipline)
const trackingMul = 1 + 0.02 * e.onSeamS;            // +2%/s → +20% cap
```

### 5–6. Assets / deps
Seam patterns = emissive decals from existing seam shader params (no new textures); volatile =
amber tint + audio warble (SPEC3-39 recipe). No new deps.

### 7. Build plan
1. Asteroid signature data + spin/seam-pattern variants; extend `check:mining:2` (yield deltas per
   signature deterministic).
2. Tracking bonus + stance power/noise; `scripts/check-mining-mastery.mjs` (scripted expert-vs-
   novice input tapes: yield ratio 1.5–1.7×).
3. Volatile seams + detonation + danger spike.
4. Chunk shatter-on-beam + tether-haul payout hook (waits on F3-17 attach verb).

### 8. Anti-patterns
Minigame popups (everything stays in-world: aim, heat, timing); punishing rhythm mistakes with lockouts
longer than 3 s; RNG yield swings that mask skill (variance lives in *finds*, F2-15, not in extraction);
asteroid HP sponges (bigger rocks = more seams, not more hull).

### 9. Ambition ceiling
Field choreography: rare "seam storm" events where a whole field's seams pulse in a traveling wave —
chase the wave across rocks at full burn for 90 s of peak-flow mining. Deterministic, scheduled by
the director as a *reward* shape.

---

## SPEC3-14 — Refining, materials & production
**One-line pitch:** one coherent production chain — ore → refined → components → modules/ships —
with the player refinery as a *place* (claims), making industry a mid-game identity, not a menu.

### 1. Why
Recon §7.4-3: refining exists as 19 blueprints + two disconnected base systems (outpost refinery vs
claims on-site refinery) and is "under-integrated into the moment-to-moment loop." Ore's only verb
is *sell*. Meanwhile F5-24 (crafting/rerolls) and F6-26 (bases) both need a materials economy. This
spec is the junction.

### 2. The design
- **The chain (canonical, 3 steps max — constitution: depth without cliff):**
  `raw ore → (refine) → refined goods → (assemble) → components → (craft/build) → modules · ships ·
  base parts · charge ammo`. Existing commodity IDs cover steps 1–3 (recon §1.8-9); blueprints
  cover the verbs. NEW: base parts + charge ammo as sinks (F6/F3 demand).
- **Where you refine defines you:**
  - *Station refinery:* instant, fee −18% of output value (the convenience tax).
  - *Claim refinery* (exists, 0.5/s): slow, free, RAIDABLE — industry with a home address.
  - *Shipboard micro-refinery* (new M utility module): 0.1/s, hold-to-hold, the nomad option.
- **Purity & batches:** refining yields `purity 0.85–1.0` scaled by input mix (single-ore batches
  purest) — purity multiplies assemble-output quality rolls (ties into F5-24 rarity: pure batches
  push modifier count). Mixing trash ore has a price; sorting cargo has a payoff.
- **Refinery contracts:** stations post "deliver 40 refined alloys" chains (existing mission gen,
  new type `industry_supply`) — the demand side that makes production *sell-through* instead of
  hoard-and-wonder.
- **The industry ledger:** one panel on the claim/automation screen: inputs/hr, outputs/hr, margin
  vs selling raw. Industry must beat raw-selling by 25–40% *with* the time/risk cost visible —
  honest math or players rightly ignore the whole layer.

### 3. Architecture & wiring
Blueprint executor already exists (recipes in `blueprints.js`, refine at refinery stationType).
Add: `purity` field on refined-cargo lots (extends the tradeLots lot model — recon §1.10 — so
cost-basis and purity ride the same rails); claim refinery honors purity; micro-refinery module in
`modules.js` (utility M, `refineRate 0.1`). New sinks: `cmdty_base_parts`, charge ammo already
priced (`impulseCharges.js`). `industry_supply` mission type in `missions.js` OFFER_MIX for
refinery/fab stations. Economy: new commodities enter `producedBy/consumedBy` so the market sim
prices them organically — zero special-casing.

### 4. Key code
```js
// Purity is a LOT property, not a global stat — it must ride the FIFO lots like cost basis does.
// {qty, unitCost, purity} — blending on merge: mass-weighted average. One rule, no edge cases.
function mergeLots(a, b) {
  const qty = a.qty + b.qty;
  return { qty, unitCost: (a.qty * a.unitCost + b.qty * b.unitCost) / qty,
           purity: (a.qty * a.purity + b.qty * b.purity) / qty };
}
```

### 5–6. Assets / deps
Claim refinery gets a visible hopper part + smelt-glow when running (SPEC3-37 queue, small). No new deps.

### 7. Build plan
1. Purity on lots + refine math + station fee vs claim free; `scripts/check-refining.mjs`
   (mass/credit conservation, purity blend math, chain margin 25–40% over raw in reference sim).
2. Micro-refinery module; base-parts + ammo sinks into commodity graph.
3. `industry_supply` mission type + OFFER_MIX.
4. Industry ledger panel (read-side).
5. Floor: `check:balance` (extend with chain-margin assertion), `check:sim:compare`.

### 8. Anti-patterns
Deep crafting trees (3 steps, hard cap — X4/Factorio depth is out of scope and out of taste here);
refining as a timer-wall (claim slowness must overlap play, never gate it); purity micromanagement
(two decisions max: sort or don't, station or home); producing anything with no consumer in the
commodity graph.

### 9. Ambition ceiling
Claim-to-claim logistics: alphabet-program drones (exists, §6.5) run ore from your belt claim to
your refinery claim — a visible, attackable, *yours* supply line. The moment the game becomes a
tiny empire sim without a single new UI screen.

---

## SPEC3-15 — Prospecting & the exploration loop
**One-line pitch:** make *finding* ore a loop of its own — scanner craft, survey intel, and rare
strikes that ping the whole economy.

### 1. Why
Fields are static known quantities; the scanner pulse reveals seams but not *stories*. The rarest
ores (ruby 20k → amazonite 500k) exist in data with no discovery drama around them. NMS/EVE lesson:
prospecting is the anticipation half of mining's compulsion loop — SpaceFace has the payoff half only.

### 2. The design
- **Ore-class scanner overlay (GDD §7.4, built out):** pulse (C, 8 s cd) paints scanned rocks with
  class glyphs for 20 s + logs them to the local map. Scanner tier (utility modules, exist) extends
  range/rehydrate time.
- **Field states (per FIELDS data + `fieldsDepleted` — both exist):** fields deplete as mined
  (tracked today, invisible) and *regrow on the day-tick*. Surface it: local-map field chips show
  richness % — belts become a managed renewable, and over-farmed home belts push you frontier-ward.
- **Prospector missions:** `recon_scan` type (exists) gains an ore flavor: "survey 3 fields in
  Pallas Drift" → your scan results auto-sell as survey data (the F1-11 intel economy, reversed:
  you become the data vendor).
- **Rare strikes:** each field has a seeded 2–5% chance per rich-core crack of exposing a **vein
  event**: 60 s of amplified spawns of that field's rare ore + a noise EXPLOSION (danger meter max —
  pirates come). Strike it rich or strike camp. Vein finds headline the ticker ("Platinoid strike
  reported — Ceres Belt") and inject a local `boom` event on that ore: the *market feels your luck*
  (and competitors' NPC miners converge — F7-29 shape).
- **Deep-core anomalies (F7-31 tie):** the 500k amazonite exists ONLY in anomaly-space cores behind
  hidden-POI scan play — endgame prospecting as expedition: survey gear, quiet mining, long haul back
  through interdiction space with a hold worth a fortune. The genre's classic "diamond run" — ours
  is *earned* by scan craft, not bought at a kiosk.

### 3. Architecture & wiring
Scanner overlay: `scanner.js` (exists) + localmap chips from `fieldsDepleted` (exists in
`state.world.discovery`). Vein events: seeded roll inside the rich-core resolver (mining.js), emits
`mining:veinStrike {fieldId, oreId}` → marketNews ticker + `injectEvent('boom')` + director pressure
spike. Regrowth: day-tick already drifts fields — surface only. Prospector missions: OFFER_MIX
weights. Determinism: all rolls from the sector RNG stream; vein rate is data.

### 4. Key code
```js
// Vein strike — one emit, three systems listen (news, economy, director). The event IS the design:
// luck must be LOUD. Never resolve a strike silently.
if (core.cracked && rng.next() < field.veinChance) {
  bus.emit('mining:veinStrike', { fieldId: field.id, oreId: field.rareOre, untilSim: sim.t + 60 });
}
```

### 5–6. Assets / deps
Class glyphs from existing icon atlas; vein VFX = amplified existing ore-burst recipe. No new deps.

### 7. Build plan
1. Field richness chips + regrowth surfacing; `scripts/check-field-states.mjs`.
2. Scanner ore-class overlay logging to local map.
3. Vein events + ticker/boom/director wiring (after F4-21 lands pressure; ticker after F1-10).
4. Prospector mission flavor + survey-data sale.
5. Amazonite deep-core placement in anomaly sectors (with F7-31).

### 8. Anti-patterns
Scanner spam as optimal play (8 s cd + information persists on map — re-pinging is never the loop);
rare finds by pure lottery (vein odds ride *rich-core cracks* — a skill event); depletion punishing
casual players (regrowth generous at low tiers); making the diamond run repeatable-on-rails (anomaly
cores relocate per save seed).

### 9. Ambition ceiling
NPC prospector rivalry: scanned-but-unmined rich rocks can be claimed by NPC miners who heard your
noise — race dynamics with zero new AI (they use existing miner behavior + a target hint).
