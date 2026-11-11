# A01-05 — The Forge and the Taps: upgrades you buy on the Foundry floor

**Lane 2.** **Design:** `design/game/12_SWARM_THE_PIT.md` "What is on the floor" (Forge, Taps);
`design/game/11_THE_ARMORY.md` §2 (Forged forms) and §5 (mods); prices `17_…` §3.
**Do after A01-04** (reuse its pad, label, purse and registration code — `src/systems/swarmFloor.js`).
**Size:** large. Swarm only; Foundry (`helios_core`) first.

## Lead decisions (numbers are mine; use them exactly)

### The Forge — one pad behind the furnace, label `THE FORGE · 5000`
- Fly through with the purse ≥ 5000 (or `run.freeForge === true`, which it then clears): the gun you
  hold becomes its **Forged** form. **Once per gun per run** (a second visit with the same gun: toast
  *Already forged*).
- **Every gun's Forged form:** name `Forged <name>`, damage ×1.4, knockback impulse ×1.35.
- **Concussion Cannon's Forged form is `Wrecking Ball`:** as above, plus the slug **does not stop at
  the first body** — it passes through up to 2 bodies, applying full knockback to each. (The other five
  hero forms in 11 §2 are later packets; leave a data row for each with `form: null`.)
- A forge plays an existing heavy/industrial sound and a brief flash on the ship.

### The Taps — mods dispensed as canisters (max 4 per run)
- Two Tap pads on the main Foundry floor for now (the Casting Hall and Scrap Yard ones come with doors).
  Each Tap shows the mod it will give (chosen with `state.rng` from the not-yet-owned list when the round
  starts) and the price: **1500 · 2000 · 2500 · 3000** for the 1st…4th Tap bought.
- A bought mod lasts the whole run. A small row of owned-mod icons/labels appears in the HUD's existing
  status area (reuse; if none, list them on the between-round armory screen).
- **The ten mods in this packet — exact trades:**

| id | Name | Gives | Takes |
|---|---|---|---|
| `overbore` | Overbore | knockback ×2.0 | fire rate ×0.5 |
| `hair_trigger` | Hair Trigger | fire rate ×2.0 | knockback ×0.7, heat gain ×1.5 |
| `long_reel` | Long Reel | Line max length ×1.5 | reel speed ×0.7 |
| `hot_core` | Hot Core | boost duration ×2 (boost drain ×0.5) | 2 hull/s while boosting at top speed |
| `ballast` | Ballast | player mass ×1.6 | turn rate ×0.75 |
| `stripped` | Stripped | acceleration and turn rate ×1.25 | player mass ×0.65 |
| `magnet_hull` | Magnet Hull | pickups within 260 WU drift to you | enemy mines within 260 WU drift to you too |
| `glass_cannon` | Glass Cannon | knockback ×1.4 | max hull ×0.5 |
| `bumper_rails` | Bumper Rails | ram damage dealt ×2, taken ×0.5 | top speed ×0.85 |
| `wide_bore` | Wide Bore | power radius ×1.4 | power cooldowns ×1.35 |

(`volatile_wake` and `second_reel` are later packets — they need new mechanics.)
- Mods multiply; they never write base data. Put them in one place the weapon, flight, Line and power
  code read (a `playerModifiers(state)` helper or the existing stat-modifier seam if there is one —
  search `modifier\|statMult\|multiplier` in `src/systems/weapons*.js`, `src/systems/flightV3.js`,
  `src/systems/fields.js`, the tether/Line system).

## Files you may edit
`src/systems/swarmFloor.js`, `src/data/swarmFloor.js`, new `src/data/swarmMods.js`, new
`src/systems/playerModifiers.js` (or the existing seam), the minimal read sites in weapon / flight /
Line / fields code (one multiply each; name every site), new `test/swarm-forge-taps.test.mjs`.
`git diff` first.

## Checks
- New test: forge at 5000 makes `Forged <name>` with ×1.4/×1.35, only once per gun; free forge works
  once; Wrecking Ball passes through 2 bodies; each of the ten mods changes exactly its two numbers;
  Tap prices step 1500→3000; a fifth Tap is refused.
- `node --test test/swarm*.test.mjs test/survival*.test.mjs test/fields*.test.mjs` — report failures vs
  the known reds.
- Look (through the lock) at round 3 with `--start-round=3` and describe the pads.

Commit: `fleet(A01-05): the Forge and ten Taps on the Foundry floor`.
