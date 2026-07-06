# SPEC3-F5 — Ships, Modules & Progression (specs 23–25)
**Thread:** F5 · **Reads:** GDD_2_0 §11, constitution, `_context/02_SIM_ECONOMY_WORLD.md` §3 · **Status:** PLAN
**Thread pitch:** turn the existing 13-hull / ~35-module / 28-node catalog into a build *system* —
one where physics enforces role fantasy, every choice is a felt tradeoff, and loot feeds identity
instead of inflation.

Research anchors (verified numbers): **Endless Sky** — nested budgets (`outfit space` ⊃
`weapon capacity` + `engine capacity`), every outfit has mass, and the whole model reduces to three
formulas: `accel = thrust/mass`, `turn = turn/mass`, `vmax = thrust/drag`; energy & heat are parallel
*flow* budgets (generation vs per-action drain), higher-tier engines trade thrust-per-ton for
thrust-per-energy (e.g. same-mass thrusters: +48% thrust for +72% energy / +79% heat). **Starsector**
— one Ordnance-Point budget where guns, hullmods, and flux tank all compete; flux capacitor = 1 OP →
+200 capacity, vent = 1 OP → +10 dissipation, per-hull caps 10/20/30/50; soft/hard flux, overload,
active-vent lockout; mount size (S/M/L, fit same-or-smaller-if-same-type) + 7 type-compatibility
classes; hardpoints get 2× the HP of turrets. **EVE** — semantic slot rows decide tank identity;
permanent rigs on a separate calibration budget. **Everspace 2** — rarity = modifier count, one
reroll-able prefix, legendaries build-defining, set bonuses, dismantle-3-same-type → blueprint.
**X4** — engines (linear) vs thrusters (angular) as separate parts. **FTL** — one live-reallocatable
power pool. **Star Valor** — crew/perks as a multiplier layer on gear.

---

## SPEC3-23 — Outfitting core: the physics-enforced build system
**One-line pitch:** adopt the Endless Sky constraint model — nested capacity budgets + mass that
feeds straight into the Rapier flight model — so a gunboat *flies* like a gunboat with zero
artificial rules.

### 1. Why / what's holding us back
Today's 6-type slot grid gates *what* fits *where*, but module mass barely matters and nothing makes
a max-gun build feel different from a max-cargo build in the hands. Depth exists as numbers, not as
flight feel — the exact "depth that never surfaces" failure the constitution bans. Meanwhile the
Rapier sim is *already there*, unpaid for. One data change makes physics the balance system.

### 2. The design
**2a. Nested budgets (per hull, in `src/data/ships.js`):**
```
outfitSpace: 240        // master pool, EVERY module consumes it (its mass in tons)
weaponCapacity: 90      // sub-pool; weapons draw from BOTH this and outfitSpace
engineCapacity: 55      // sub-pool; engines/thrusters draw from both
```
Sub-pools force the classic squeeze: a fat reactor + shields eat the space you were "allowed" to
spend on guns. Scouts get proportionally larger engineCapacity; haulers larger outfitSpace with tiny
weaponCapacity — the ladder's role identity becomes *budget shape*, not just stats.

**2b. Mass is the law.** `shipMass = hullMass + Σ moduleMass + cargoMass(current!)`. Flight derives:
`accel = thrust/shipMass`, `turnRate = turnTorque/shipMass`, `vmax = thrust/drag(hull)`. A loaded
hauler wallows; the same hauler empty is sprightly — cargo runs get a felt arc, piracy targets
telegraph their value by how they fly (AI reads this too, SPEC3-21).

**2c. Engine vs thruster split (X4).** Two engine-class parts: **Drive** (forward thrust, vmax) and
**Maneuver thrusters** (turn torque, strafe, brake power). Fast-but-clumsy and nimble-but-slow become
real, orthogonal builds. Existing hull turn stats migrate to a default thruster part per hull.

**2d. Mounts: size + type gating (Starsector).** Weapon slots get `size: S|M|L` and the grid's
existing 6 types collapse into mount-compat classes: a size-M mount accepts M-or-S of its type;
`universal` mounts (rare, expensive hulls) accept anything. Fixed hardpoints get +100% mount HP and
+10% weapon damage vs turreted (arc convenience costs output — the aim skill from F3 gets paid).

**2e. Energy & heat stay flows** (they already exist in weapons.js): modules add `energyDraw/s` and
`heat/s` under load; reactors add generation; the *fit screen* shows sustained-fire margin (see 4).
Higher tiers follow the ES efficiency curve: better thrust-per-energy, not just bigger numbers.

**2f. Visible builds.** The parts-based ship assembly (visualFactory/partsLibrary) already hot-swaps
GLB parts — bind module choices to visible parts where slots exist: drives change nacelle glow scale,
big weapons visibly bristle. Rule: any module ≥15% of outfitSpace must be visible on the hull.

### 3. Architecture & wiring
- Data: extend `src/data/ships.js` (budgets, hullMass, drag) and `src/data/modules.js`/`weapons.js`
  (mass, size, mountClass, energyDraw, heat). Migration: sum of current default fits must land within
  each hull's new budgets (write the check first — it IS the tuning harness).
- `src/systems/ships.js`: single `computeDerivedStats(state, shipId)` (memoized, invalidated on
  fit-change + cargo-change events) → `{shipMass, accel, turnRate, vmax, energyBalance, heatBalance}`.
  Flight (`flightDynamics.js`) reads ONLY derived stats — one seam, no scattered math.
- Events: `fit:changed {shipId}`, consumed by ships (derived), outfitting UI, and visualFactory
  (part swap). Cargo mass already changes — route `cargo:changed` into the same invalidation.
- Determinism/saves: pure data + derived cache; no new serialized state beyond the fit itself
  (already saved). 47a untouched (default fits must produce identical derived stats to current
  hand-tuned values within 1% — that's the migration acceptance bar).

### 4. Key code
```js
// ships.js — the whole build system is one function. Keep it boring, keep it total.
export function computeDerivedStats(state, shipId) {
  const ship = state.ships[shipId], hull = HULLS[ship.hullId];
  let mass = hull.mass, energyGen = hull.energyGen, energyDraw = 0, heat = 0,
      thrust = 0, torque = 0, used = 0, usedW = 0, usedE = 0;
  for (const m of shipModules(ship)) {
    mass += m.mass; used += m.mass;
    if (m.kind === 'weapon') usedW += m.mass;
    if (m.kind === 'drive' || m.kind === 'thruster') usedE += m.mass;
    thrust += m.thrust ?? 0; torque += m.turnTorque ?? 0;
    energyGen += m.energyGen ?? 0; energyDraw += m.energyDraw ?? 0; heat += m.heatPerS ?? 0;
  }
  mass += cargoMass(state, shipId);                       // live! loaded ships wallow
  return {
    mass, accel: thrust / mass, turnRate: torque / mass, vmax: thrust / hull.drag,
    fits: used <= hull.outfitSpace && usedW <= hull.weaponCapacity && usedE <= hull.engineCapacity,
    sustainMargin: energyGen - energyDraw,                // <0 = burst-only build, UI shows it amber
    heatMargin: hull.cooling - heat,
  };
}
```
```js
// outfitting screen — the ghost preview is the UX that makes tradeoffs FELT before purchase:
// on hover, render current-vs-hovered derived stats as paired bars + a turn-circle overlay on the
// ship preview (turnRate drawn as an arc radius). Numbers lie politely; arcs don't.
```

### 5. Assets & generation
No new meshes required (visible-build rule maps to *existing* part variants). Where a module has no
part variant yet, flag it in `parts_manifest.json` as `wantsVisual: true` — SPEC3-37's authoring
queue picks these up in Blender priority order.

### 6. Libraries / tooling
No new deps.

### 7. Build plan
1. Data migration + `scripts/check-fit-budgets.mjs` (every stock fit fits; derived stats within 1%
   of current hand-tuned flight values; every module has mass/size/mountClass). Parallel-safe.
2. `computeDerivedStats` + flight reads derived only; extend `check-massline-feel.mjs` with a
   loaded-vs-empty hauler assertion (accel ratio ≥ 1.25).
3. Mount size/type gating in outfitting UI + drag-fit validation.
4. Drive/thruster split (new module kind + per-hull defaults).
5. Ghost-preview UX (bars + turn-circle arc) in outfitting screen.
6. Visible-build part bindings for the top 8 modules by usage.

### 8. Anti-patterns
- A second artificial "power number" on top of mass (mass IS the budget — Starsector's OP exists
  because it lacks a physics sim; we have one).
- EVE's dual PG+CPU fiddliness (one master pool + two sub-pools is the ceiling of complexity).
- Letting derived stats be computed in more than one place; letting cargo mass be static.
- Budget inflation across the ladder (bigger hull = different *shape*, not strictly more of everything).

### 9. Ambition ceiling
AI fits use the same budgets — pirate variants become *builds* you learn to read from silhouette +
flight behavior ("that one turns like a brick, it's running plates — get behind it").

---

## SPEC3-24 — Modules, flux-style defense, rarity & crafting
**One-line pitch:** one sharp tank axis (capacity↔dissipation), a rarity system that feeds builds
instead of inflating numbers, and a deterministic dismantle-to-craft loop.

### 1. Why
The module catalog is flat: linear upgrades, no build identity, loot is vendor trash or strict
upgrade. The genre's best single lever (Starsector flux) and best loot loop (ES2) are both cheap to
adapt onto systems SpaceFace already has (energy/heat, deterministic drops).

### 2. The design
**2a. The capacitor↔vent axis (Starsector, mapped onto existing energy/heat).** Free module-slot
micro-items: **Capacitor** (+200 energy buffer each) and **Vent** (+10 heat dissipation/s each),
per-hull caps scaling T0→T5 as 10/14/20/28/38/50 combined. High-cap = alpha-strike builds (big
burst, long recovery); high-vent = sustained-fire builds. **Active vent** (hold C at station… no —
C is scanner; hold **H**): 2× dissipation, weapons+shields offline until cool — a committed, readable
defensive stance (AI telegraphs it too, SPEC3-21).
**2b. Rarity = modifier count, not bigger base stats.** Common 0 / Uncommon 1 / Rare 2 / Exceptional 3
modifiers from a curated table (e.g. `-15% heat`, `+20% tether winch force`, `+1 charge capacity`,
`vent also restores 5% shield`). One **prefix** slot rerollable at stations (credits + materials —
economy sink, SPEC3-14 materials). Base stats stay tier-flat: a Rare T2 laser ≠ a T3 laser — sidegrade
identity, not power creep.
**2c. Legendaries (build-defining, 12 at launch).** Hand-authored, named, one mechanic each:
"Cormorant Winch" (tether reel speed ×2, cable never fray-warns — it just *breaks*), "Glasspoint
Array" (+40% beam damage, capacitors count double, vents count zero), etc. Drop from named bounties
(SPEC3-22) and anomaly vaults (SPEC3-31) only — never random trash.
**2d. Set bonuses (4 sets of 3).** Worn as module trios; bonus is a *verb*, not a stat ("Breaker set:
ram collisions vent 30 heat"). Sets teach playstyles.
**2e. Dismantle-3 → blueprint (ES2).** Three same-type modules dismantle into materials + unlock the
blueprint at that rarity; blueprints craft deterministically (no gacha) using SPEC3-14 refined goods.
Junk loot becomes agency; crafting becomes the bad-luck floor.
**2f. Permanent rigs (EVE, scaled down).** One **Keel slot** per hull: permanent (destroyed on
removal), big swing (+15% class stat), installed at shipyards. The commitment read: "this hull is
*my* miner now."

### 3. Architecture & wiring
- `src/data/modules.js`: add `rarity`, `modifiers[]`, `prefixPool`, `setId`; new data files
  `modifierTable.js`, `legendaries.js`, `sets.js`. Modifier application = one pure function in the
  derived-stats path (SPEC3-23's single seam — modifiers NEVER apply anywhere else).
- Drops: existing deterministic loot tables gain rarity weights seeded from the sector RNG stream
  (replay-safe). Dismantle/craft = station service in `stationHub.js` services tab.
- `state.player.blueprints[]` (new, saved). Reroll/craft consume the same materials ledger as
  SPEC3-14.

### 4. Key code
```js
// derived-stats path — modifiers are data, application is one fold. Resist the urge to special-case.
function applyModifiers(base, mods) {
  return mods.reduce((s, m) => MODIFIER_OPS[m.op](s, m), base);
}
const MODIFIER_OPS = {
  mulStat: (s, m) => ({ ...s, [m.stat]: s[m.stat] * m.v }),
  addFlag: (s, m) => ({ ...s, flags: [...s.flags, m.flag] }),   // verbs live as flags read by systems
};
// e.g. tetherSystem checks flags.includes('noFrayWarn') — modules reach into systems ONLY via flags.
```

### 5. Assets & generation
Rarity reads as *material treatment* on the module icon chip (existing UI atlas): thin cyan / double
amber / red-gold hairline borders — no new icons. Legendaries each get a 1-line codex entry + named
icon tint. No 3D work.

### 6. Libraries / tooling
No new deps.

### 7. Build plan
1. Modifier table + application fold + `scripts/check-modifiers.mjs` (every modifier op total,
   derived stats deterministic, no orphan flags).
2. Capacitor/vent items + caps + active-vent stance (respect the `typeof window` heat-vent gate in
   weapons.js — the new stance is a *separate* code path in the sim, never touching that gate).
3. Rarity drops (seeded) + dismantle-3/blueprint/craft station service.
4. Sets + flags; 12 legendaries authored + gated to named sources.
5. Keel slot + shipyard install/destroy flow.
6. Golden: loot-table changes re-record as deliberate batch if any 47a drop is affected.

### 8. Anti-patterns
Power-creep rarities (rarity = *texture*, tiers = power); random-stat soup (curated table only);
modifiers applied outside the one seam; gacha crafting; legendaries in random pools (they're
*destinations*, SPEC3-22/31).

### 9. Ambition ceiling
Corrupted modifiers in anomaly space (SPEC3-31): powerful + a drawback ("+35% damage, heat never
fully vents") — the build-around chase for hour-100 players.

---

## SPEC3-25 — Fleet, wingmen & crew
**One-line pitch:** a light crew/perk layer and a real (small) wingman system that make the mid-game
social instead of solitary — without becoming an RTS.

### 1. Why
The automation layer (drones/traders/outposts) is abstract income; the wingman radial (Z) exists as a
micro-loop; the bar screen generates characters that do nothing. Between them is a missing fantasy:
*people fly with you.* Star Valor proves a thin crew layer adds build depth at near-zero sim cost.

### 2. The design
- **Crew (max 3 seats by hull, T2+).** Hired at bars (existing bar NPC generation becomes real).
  Each crewmate = 1 passive perk + 1 activatable. Curated roster of 18 (deterministic per-sector
  pool), e.g. Gunner (+8% turret tracking; active: 6 s overdrive), Rigger (+15% tether winch; active:
  instant re-splice on break), Fixer (contraband scan resistance; active: bribe hail). Perks apply
  via SPEC3-24's modifier flags — same seam.
- **Wingmen (max 2, hired or mission-granted).** Real ships using existing AI archetypes with a
  4-order radial on Z (already wired): Form up / Engage my target / Cover me (intercept attackers) /
  Break off. Orders are *stances*, not waypoints — no micromanagement. Wingmen use SPEC3-23 budget
  fits you can edit at the shipyard (their build is your strategy).
- **Loss & loyalty:** wingman hulls persist; "downed" not killed (recover at station for a fee,
  Highfleet-style attachment without permadeath grief). Crew gain 1 loyalty tier per 10 missions →
  perk +50%; they *quit* if you abandon them mid-fight repeatedly (telemetry exists to detect it).
- **Cost discipline:** wages are a soft income sink (SPEC3-10 ties in); a full crew+wing costs ~20%
  of mid-game mission income — companionship is affordable, armadas are not (automation stays the
  scale lever; this stays the *character* lever).

### 3. Architecture & wiring
- `src/systems/wingman.js` exists in spirit via the radial micro-loop — promote to a real system
  owning hire state, stances, and the downed/recover cycle. Wingman ships = normal entities with
  `faction: player`, spawned/despawned at dock; saves serialize their fit + status only.
- Crew: `state.player.crew[]` (id, loyaltyTier, activeCooldown). Actives route through the existing
  input/radial; effects via modifier flags. Bar screen hiring UI = one new panel in `bar.js`.
- AI: stances map to existing archetype behaviors (Form up = escort slot steering from the
  `check:sg06:formation` convergence work; Engage = standard attack FSM on your target id).

### 4. Key code
```js
// wingman stance = ONE field the AI FSM reads. No new pathfinding, no orders queue.
state.wingmen[i].stance = 'cover';   // formup | engage | cover | breakoff
// cover: retarget = nearest hostile whose target IS the player, else formup slot.
// This one line of retarget policy is the entire "my wing protects me" fantasy.
```

### 5. Assets & generation
Crew portraits: reuse the existing pilot-portrait asset lane (already in repo as reference-only
media) — promote 18 via SPEC3-38's image-gen pass (spec there); fallback = initials-on-chip, ship
readable without portraits. Wingman hulls: existing GLBs.

### 6. Libraries / tooling
No new deps.

### 7. Build plan
1. Crew data + hire flow + passive perks via flags + `scripts/check-crew.mjs` (deterministic pools,
   flag application, wage drain).
2. Actives on the radial + cooldowns.
3. Wingman system: hire, spawn-at-undock, stances, downed/recover + `scripts/check-wingman.mjs`
   (stance retarget policy over scripted 600-tick fight; formation slot convergence reuse).
4. Loyalty tiers + quit rule (telemetry-driven).
5. Editable wingman fits at shipyard (reuses SPEC3-23 outfitting with a target-ship switcher).

### 8. Anti-patterns
RTS creep (no waypoints, no formations editor); escort-quest AI that dies to be a burden (wingmen
are durable by fit, not by cheats); crew as a stat spreadsheet (18 curated > 200 generated); wages
that punish having friends (sink stays soft).

### 9. Ambition ceiling
Named wingmen remember: kill-counts surface as one-line bar toasts ("Vex: 'That's fifty.'"). Zero
sim cost, maximum attachment — the cheapest storytelling in the game.
