# SPEC3-F5a — Active Power Routing UI (station-only tuning minigame)

**Thread:** F5 · **Status:** DESIGN HOOK / PARTIAL UI
**One-line pitch:** turn the Outfitting power-flow beams from a read-only identity flourish into a
short-range, station-only tuning minigame where the player actively shapes power priority to favour
weapons, shields, or engines.

---

## 1. Why this hook / what's holding us back

The premium Shipyard/Outfitting screen now renders **routeBeam** power conduits from a virtual
reactor to each weapon/shield/engine hardpoint. Today those beams are purely informational: they
show which systems draw power and give an at-a-glance read on ship identity. That is already useful
(especially for new players learning why a hull "feels" like a fighter or hauler), but it leaves a
verb on the table.

SpaceFace's existing energy model is a flow budget: hull `energyRegen` vs module `energyDraw` +
weapon fire. The derived stat `continuousDrain` already surfaces whether a build is sustainable. The
next step is to let the player **trade between sustained and burst identity** by re-routing power
at a station — a minigame that is quick, readable, and never mandatory.

## 2. The design

### 2a. Core verb: drag priority pips on the power rail

In Outfitting, the central 3D stage gains a **power rail**: a horizontal tri-bar under the ship
portrait with three pips — **WEAPONS / SHIELDS / ENGINES**. The player drags the pips left/right
to set a priority share. The share always sums to 100%; moving one pip pushes the others.

Default (balanced): 33 / 33 / 34.

| Priority lead | Effect in flight | Read on the ship |
|---|---|---|
| Weapons high | Sustained fire drains cap slower; burst DPS ceiling up | Beam colour shifts red, weapon nodes pulse |
| Shields high | Shield regen begins sooner after hit; max regen up | Beam colour shifts cyan, shield ring visible |
| Engines high | Boost recharge faster; top-speed cap up slightly | Beam colour shifts amber, engine plume intensifies |

The effects are **modifiers on top of the base derived stats**, not replacements. A hauler with
weapons-high is still a hauler — it just shoots a little longer before going dry.

### 2b. Cost & commitment

- Routing can only be changed while docked at a station with an **outfitting bay**.
- Changing routing costs a small amount of credits (scaling with hull tier) and a single
  **reactor tuning kit** consumable (a new cheap commodity sold at industrial/refinery stations).
- The tuned profile is **saved per owned ship** (`ownedShip.powerProfile: {weapon, shield, engine}`).
- Undocking locks the profile until the next dock; no mid-combat fiddling.

### 2c. Visual feedback loop

- As pips move, the **routeBeam** conduits re-balance in real time: the dominant system gets a
  thicker, faster-marching beam; the lowest-priority system dims.
- The **circularGauge** set updates: energy/heat margins shift, thrust/shield bars respond.
- An invalid profile (e.g., all three at zero) is rejected with an amber/red path interruption on
  the beam tree — the same invalid-fit language already used for ghost previews.

### 2d. AI and NPC ships

NPC loadouts gain a deterministic `powerProfile` seeded from their faction archetype:
- Pirates favour weapons.
- Patrols favour shields.
- Smugglers favour engines.
This gives observant players another readable cue before committing to a fight.

## 3. Architecture & wiring

### New data

- `src/data/modules.js` or a new `src/data/powerProfiles.js`: default profiles per archetype.
- `src/data/ships.js`: optional `basePowerProfile` override for signature hulls (e.g., Wasp leans
  weapons, Mule leans engines).

### New GameState fields

```js
state.player.ownedShips[i].powerProfile = { weapon: 0.34, shield: 0.33, engine: 0.33 };
```

Serialized by the save system automatically because it lives inside `ownedShips`.

### New events

- `outfitting:setPowerProfile { shipIndex, weapon, shield, engine }` — emitted by UI, consumed by
  `ships` system (single writer of derived stats).
- `outfitting:powerProfileChanged { shipIndex }` — rebroadcast for UI refresh.

### Systems touched

- `src/systems/ships.js`: apply `powerProfile` in `getDerivedStats` as a multiplier layer on
  `capRegen`, `shieldRegenRate`, `boost.regenRate`, and a small `maxSpeed` bias. Keep the math
  simple and total so the effect is legible.
- `src/ui/screens/outfitting.js`: add the draggable tri-bar under the engineering stage; wire it to
  emit `outfitting:setPowerProfile`.
- `src/ui/shipEngineeringStage.js`: accept a `powerProfile` prop and animate beam thickness/colour
  accordingly.

### Determinism

Power profile is saved state, not runtime randomness. Flight remains deterministic: the profile is
an input to `getDerivedStats`, exactly like fittings. No `Math.random()` in sim.

## 4. Key code (sketch)

```js
// ships.js — multiplier layer inside getDerivedStats
function applyPowerProfile(profile, stats) {
  const p = profile || { weapon: 1/3, shield: 1/3, engine: 1/3 };
  const weaponBias = 1 + (p.weapon - 1/3) * 0.45;  // ±30% range at extremes
  const shieldBias = 1 + (p.shield - 1/3) * 0.35;
  const engineBias = 1 + (p.engine - 1/3) * 0.30;
  return {
    ...stats,
    capRegen: stats.capRegen * weaponBias,
    shieldRegenRate: stats.shieldRegenRate * shieldBias,
    maxSpeed: stats.maxSpeed * (1 + (p.engine - 1/3) * 0.08),
    boost: { ...stats.boost, regenRate: stats.boost.regenRate * engineBias },
  };
}
```

```js
// outfitting.js — tri-bar intent emission
function commitPowerProfile(profile) {
  ctx.bus.emit('outfitting:setPowerProfile', {
    shipIndex: ctx.state.player.activeShipIndex,
    weapon: profile.weapon,
    shield: profile.shield,
    engine: profile.engine,
  });
}
```

## 5. Assets & generation

No new meshes. Reuses:
- Existing `routeBeam` effect for power conduits.
- Existing `circularGauge` set for stat feedback.
- Existing reactor-node approximation at the centre of the engineering stage.

New UI assets needed (future art pass):
- Three small glyph icons for weapons/shields/engines in the tri-bar.
- A "reactor tuning kit" commodity icon if the consumable cost is implemented.

## 6. Libraries / tooling

No new runtime dependencies. The drag interaction can be implemented with pointer events.

## 7. Build plan

1. **Data layer** — add default `powerProfile` to `NEW_GAME` starter ship + NPC archetype data;
   `scripts/check-power-routing.mjs` asserts profiles sum to 1 and produce bounded stat changes.
2. **Sim layer** — wire profile multiplier into `getDerivedStats`; update `check-massline-feel.mjs`
   baseline if any default values shift.
3. **UI layer** — add tri-bar drag control to Outfitting; animate beams/gauges on change.
4. **Economy layer** — add reactor tuning kit commodity + station service cost (optional; can ship
   with credits-only cost first).
5. **Save compatibility** — missing `powerProfile` on old saves defaults to balanced.

## 8. Anti-patterns

- **Do not allow mid-flight routing changes.** The fantasy is *station tuning*, not combat macros.
- **Do not make routing mandatory.** A balanced profile must be competitive; extremes are sidegrades.
- **Do not hide the math.** The gauge readouts must show exactly how the profile moves stats.
- **Do not special-case every module.** The profile is a global multiplier layer; individual module
  bonuses still apply underneath.

## 9. Ambition ceiling

If this lands well, the same tri-bar concept can extend to **capacitor/vent stance** (SPEC3-24),
giving the player a second station-only dial: high-capacity alpha builds vs high-dissipation
sustained builds. The UI language (drag pips, beams respond, gauges confirm) stays identical.
