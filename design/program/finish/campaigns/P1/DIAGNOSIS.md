# P1 — the Ship Sheet — diagnosis

**2026-11-06, Lane 4 (SHIP).**

## 1. The player-visible problem

The owner cannot tell what a part does until he fits it and flies. The ship screens are a wall of
names and no explanations, and there is no screen where he looks at *his* ship and feels he is
building a character.

Measured on the committed bench captures of `station-shipworks`, `ship` and `new-game`:

- The readings column prints **engineering units with no reference point**: `Agility 8.8`,
  `Inertia 18`, `Brake 78`, `439 TOP SPEED`, `+12/s POWER`, `CORE · 0 DRAW`. Nothing says whether
  8.8 is good, bad, or how much of the scale is left.
- **Seven slots read `EMPTY · S`** on a stock Hull Hitch (`Weapon 01 EMPTY · S`, `Shield 02
  EMPTY · S`, … `Thrusters 07 EMPTY · S`). The letter is a *size class*, not a decision.
- The hull-name paragraph is a **five-clause engineering sentence** — "Can tow a Pelican. Turns
  steadily. Stops clean. At fight speed the turn radius is 139 m. A full reversal takes 4.4 s.
  Draws 11/s against 12 back. Heat climbs at 44 and cooling takes 12, so the gun holds for 3.1 s
  before the heat stops it." That is the entire explanation of a ship.
- The only identity word, `GENERALIST`, is classified from **fitted module ids**
  (`src/systems/buildIdentity.js`), so an empty hull and a full hull of the same parts read the
  same, and a genuinely fast, fragile hull still reads "Generalist".
- Hovering a part in the chooser ghosts the 3D hull and prints a four-word `Proposed fit` strip of
  raw deltas (`mass +3.0t`, `top speed −4.2`), again in engineering units.

## 2. The measured cause chain

1. **There is no flight→player translation layer.** `getDerivedStats()` (`src/systems/ships.js`)
   is the sim's authoritative derived block (verified: 61 fields for the Hitch —
   `hullMax`, `shieldMax`, `capMax/capRegen`, `thrust/turnRate/maxSpeed`, `propulsion.*`). Every
   UI surface that explains a ship re-prints a sub-selection of those fields:
   `handlingProfile.js` (four axes, roster-normalised to 0–100), `fitReadout.js` (sustain
   sentence), `shipBandModels.js` (bars + a composed crest sentence). **Three presenters, one
   vocabulary: engineering.**
2. **Each presenter normalises differently.** `handlingProfileDomain()` takes min/max across the
   15-hull roster, so every hull's bar moves when a hull is added — the same fit shows a different
   bar next release. There is no fixed scale a player can learn.
3. **The scale is unbounded and per-axis.** `Agility 8.8` is `yawAccel` in rad/s²; `Brake 78` is
   `reverseAccel` in world-units/s². Two numbers on adjacent rows are in different units and
   neither has a top.
4. **No aggregate.** Nothing sums a fit into "this ship hits hard, turns badly and can tow a
   house". `capabilityBandModel()` lists *verbs* (good) but a verb list is not a shape, and the
   shape is what makes an RPG character readable.
5. **The 3D ship already exists and is already big.** `shipScreen.js` and the dock's shipworks tab
   are literally the same object (`getSharedShipStage`) — so the hangar view, the hull, the slot
   ring and the jib are one implementation. The missing piece is not the ship; it is the sheet
   beside it.

## 3. The architecture question

This is **not a bug in a sound design**. The presenters are honest and correct. The design is the
bottleneck: it has no *player* model of a ship at all, only a *simulator* model with three
different windows onto it. Writing a fourth window (another bar, another sentence) is the failure
mode the owner is complaining about.

What replacing the design costs: one new pure module (~300 lines) that maps the existing derived
block onto six bounded 1–10 stats with fixed anchors, plus one shared DOM block that the three
hull surfaces mount. What it buys: every ship screen in the game — Shipworks, THE SHIP, New Game,
and (through the published interface) the Crucible Ship & Kit and the Swarm shop — speaks one
scale, one vocabulary and one identity word, and the engineering numbers stay available behind a
Details toggle instead of being deleted.

The alternative (teach the player radians) is cheaper for one commit and does not finish.

## 4. The road

1. **`src/ui/ship/shipStats.js` — one pure stat model, no DOM.** Six stats, each
   `1 + 9 · clamp(log(v/floor) / log(ceiling/floor))` over **absolute, documented anchors** (not
   roster-relative, so a bar never moves when content is added):
   - **Firepower** — sustained damage per second, from `buildWeaponList` (dmg × shots/s, duty-cycle
     weighted by `sustainedFireForFit.seconds`).
   - **Toughness** — effective hit points, `(hull + armour) / damageReduction + 1.3 · shield`.
   - **Speed** — the governed fight speed the kernel clamps to (`derived.maxSpeed`), plus boost.
   - **Handling** — yaw authority and reverse thrust, the two things the thruster bay moves.
   - **Power** — the capacitor and its regen: how long a heavy fit keeps firing and casting.
   - **Muscle** — what the Line and a ram can move: `towClassMassFor` and the hull's own mass.
   Every input is an existing derived read. **No new calculator in the sim, no re-tuning.**
2. **Deltas come from the same model**, computed as `after − before` in tenths, so a hover can
   never disagree with a committed fit.
3. **The build identity is computed from the stat shape** — the top stat and the spread — so it is
   a statement about how the ship plays, not which modules are bolted on.
4. **One DOM block, `src/ui/ship/shipSheet.js`**, mounted by Shipworks (which is also THE SHIP) and
   New Game. Engineering numbers survive behind a `Details` disclosure.
5. **No seventh stat, no percentages, no sentence that restates a name.**

## 5. Finish line

- The stat model test: monotonic (a bigger gun never lowers Firepower; a heavier hull never raises
  Handling), and every starter hull lands on a distinct stat shape.
- `ui-bench --shot=station-shipworks,ship,new-game --walk` — before and after, every PNG opened.
- **Blind comprehension check:** an independent reviewer, given two sheets and no other
  information, predicts the winner of a drag race, a slug-fest and a tow job — and is right.
