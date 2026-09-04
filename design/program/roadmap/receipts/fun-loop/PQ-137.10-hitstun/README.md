# PQ-137.10 (hitstun half) — the BEFORE measurement for "weapons have force"

Lane FORCE. Seed 4242. Measured on the real game path: `createAuthoritativeRuntime` on the live
`rapier-dynamic` physics authority, live hulls, live weapons, the live tumble owner.
Nothing in the game changed. This is the instrument that will judge PQ-137.04 and PQ-137.05.

---

## WHAT I FOUND

You said the physics weapons "blast things really slow and cumbersome" and that blasting an enemy
away "just barely does anything." That is true, and the reason is not the weapons. It is that
**nothing in this game agrees on what being hit means.**

Four different things can shove a ship — a gun, the rope, a gravity well, and flying into a rock —
and each one asks a *different* piece of code whether the ship should lose control. Those pieces do
not know about each other. Shove the same light ship by the same amount and you get:

| what shoved it | how long it loses the helm | how much it spins |
|---|---|---|
| the rope | **4.1 seconds** | fast |
| a rock | **1.5 seconds** | fast |
| the one shove gun | **0.48 seconds** | **not at all** |
| a gravity well | **nothing at all** | nothing |

That 0.48 seconds is not a rule. It is a hand-written pause attached to exactly one weapon in the
whole game. Every other gun in the game gives **zero**. And a heavy freighter hit by a pea-shooter
loses the helm for the same 0.48 seconds as a fighter hit hard — because it is not measuring
anything, it is just a number somebody typed once.

The shove weapon itself is also small: it changes a light fighter's velocity by **12.5 %** of its
cruising speed. The contract asks for 30 %. And the starter gun you actually fly with changes it by
**0.015 %** — which is to say, not at all. Two seconds after the biggest shove in the game, that
fighter is **less than half a screen** off the line it was flying, and it is already shooting at you
again.

**The second thing I found is that the old measurement was lying**, and that matters more than any
single number here. See "The instrument was lying" below.

## WHAT I CHANGED

Nothing in the game. This leaf builds the honest measuring stick, on fixed seeds, so that the two
leaves after it cannot claim a win they did not earn:

- a new scenario that shoves a light, a medium and a heavy hull at five strengths from four
  different sources — 60 real runs of the actual game — and prints how long each one lost the helm,
  how fast it span, and **which piece of code took the helm**;
- a rebuilt shove measurement that fires the real weapons at a real AI hostile flying a real attack
  run, and reports what the hit actually did;
- a test that fails if either one ever stops measuring the real game, or if the starter gun's number
  ever drifts away from the momentum the weapon actually carries.

## WHAT YOU WILL FEEL

Nothing yet — on purpose. This is the before picture. What it buys you is that the next two changes
have to move a real number on a fixed seed, in front of a test that catches the cheat that was
already in here once.

## THE NUMBERS

| bar | what it asks | old (fake) | now (real) | target | met |
|---|---|---|---|---|---|
| B4 | shove weapon changes a light hostile's velocity by | 15.4 % of cruise | **12.5 %** | ≥ 30 % | no |
| B4 | the **starter** gun changes it by | never measured | **0.015 %** | ≥ 5 % | no |
| B4 | shoved along its own motion, it gets faster | never measured | **see correction below** | faster | **not yet honestly tested** |
| B5 | 2 s later it is off the line it was flying by | 0.52 screens (of total travel) | **0.46 screens** (measured properly) | ≥ 1 screen | no |
| B5 | …and has not fired | never measured | **it fired** | silent | no |
| B11 | light hull loses the helm for — **gun** | 1.5 s (a constant, not a measurement) | **0.48 s** | ≥ 1 s | no |
| B11 | …**rope throw** | never measured | **4.13 s** | ≥ 1 s | yes |
| B11 | …**gravity well** | never measured | **0 s** | ≥ 1 s | no |
| B11 | heavy hull hit at gun strength loses the helm for | never measured | **0.48 s** | 0 s | no |
| B11 | how far apart the four sources are at the same shove | never measured | **100 %** | ≤ 15 % | no |

**B4, B5 and B11 are all unmet.** That is the finding.

## THE INSTRUMENT WAS LYING — and this is the part worth reading

The implementing model reported that the starter gun changes a fighter's velocity by **1.5 %** of
cruise. The real answer is **0.015 %**. It was wrong by a factor of a hundred, and that wrong number
was about to become the target the next leaf tuned the starter gun against.

Why it happened: it measured how much the target's velocity changed in the instant it was hit. But a
fighter under thrust changes its own velocity by 3.05 units in *any* instant — engine, not gun. The
one shove weapon in the game happens to author a beat that switches the target's engine OFF when it
lands, so *that* weapon's reading came out clean while every other weapon's reading was 99 % engine.
The comparison "shove gun 12.5 %, starter gun 1.5 %" was not comparing two guns at all. It was
comparing "engine off" with "engine on".

Proof, same seed, three runs identical except which weapon the hit is labelled as:

| momentum delivered | labelled as | measured velocity change |
|---|---|---|
| 0.5 | the shove gun | **0.031** — exactly the momentum ÷ mass |
| 0.5 | the starter gun | **3.053** |
| none (not shot at all) | — | **3.051** |

Every number a bar consumes is now the *caused* change: what the target's velocity was with the hit,
minus what it would have been without it, at the same instant of an otherwise identical run on the
same seed. The uncorrected numbers are still printed beside them, so this correction can be audited
rather than trusted.

## THE FRAMES

None, and none are required: this leaf changes no pixel and no game rule. The evidence is the 60-run
table in `curve.md` and the two identical bench passes in `before-bars-4242.json`.

## NEXT

- **PQ-137.04** — one hitstun law: helm-loss and entry spin become one function of how hard you were
  hit relative to your cruise, and of the mass ratio, for guns, throws, flings and collisions alike.
  The 0.48 s one-weapon beat is retired into it. Judged by the table in this folder.
- **PQ-137.05** — weapons get real force, including the starter gun, and the Crucible starts with
  something that shoves.

---

# Engineering appendix

**Hypothesis line.** When anything shoves a ship, three unrelated owners decide independently whether
it loses the helm, so the same ΔV yields 0 s, 0.48 s, 1.5 s or 4.1 s depending on which fired;
this leaf's job is to make that measurable on the real path before any of it is changed.

**Files (new).**
- `scripts/lib/bench/scenarios/feel.hitstun_curve.mjs` — the 4 sources × 3 hulls × 5 levels grid.
- `scripts/lib/bench/scenarios/feel.shove_magnitude.mjs` — replaces the inline stand-in by id.
- `test/hitstun-curve.test.mjs`.

**Scenario ids / seeds.** `feel.hitstun_curve` and `feel.shove_magnitude`, seed 4242.
Two consecutive passes of `runVerbBench({ seeds:[4242], scenarioIds:[…] })` + `evaluateBars` are
bit-identical. runHash `feel.shove_magnitude` `73d5c607…`, `feel.hitstun_curve` `54c162b1…`.

**Real-path proof carried in every run's metrics** (`realPathProof`):
`backend: rapier-dynamic`, `sg02Ready: true`, `contactCaptureEnabled: true`, `physicsBackend:
rapier-dynamic`, `flightBackend: v3`, `aiBackend: sg06-tactical`, `profileId: production`.
A stand-in reports `sg02Ready: false` / `backend: none`, and the test asserts all four.
60/60 cells measured; no cell is bodyless.

**Live constants read, not assumed.** Cruise is `entity.data.derived.propulsion.combatSpeed`
(wasp 210, drifter 195, atlas 170), not `maxSpeed`. Masses: wasp 16, drifter **48** (the packet's
table said 24), atlas 200, kestrel 18. `impulsePerHit`: starter pulse 0.5, concussion 420.

**The three helm-loss owners, located.**
1. `src/systems/tumbleStates.js` — massline only; hard 1.5 s floor; mass-ratio clamp 0.5–2.2;
   refuses throws below 60 WU/s payload speed (which is why the rope column reads 0 s at k 0.05/0.15).
2. `resolveCollisionConsequence()` in `src/combat/impulseKernel.js` feeding
   `src/systems/collisionConsequences.js` — ABSOLUTE thresholds (tumble ΔV ≥ 18, stagger ≥ 3,
   `staggerTicks ≤ 90`), so every collision cell saturates at 1.5 s / 6.0 rad/s.
3. `weapons._tickNpcCounterthrustRecovery` — `npcCounterthrustDelayS` authored on exactly one weapon;
   flat 0.483 s at k = 0.05…0.60 on every hull, zero entry spin.
Because (2) lives in `impulseKernel.js`, PQ-137.04 can re-derive the collision branch from the law
without touching CONTACT's `collisionConsequences.js`.

**Known instrument limits, stated rather than hidden.**
- The collision source stages its closing speed by writing the victim's velocity once; contact ΔV is
  then whatever the Rapier solver exchanges, and the cell reports **measured** k, never intended k.
  No light-hull collision cell reaches k ≥ 0.30 because that exchange is capped.
- `rope_throw` and `well_fling` cells at k 0.05 carry a ~+0.004 offset in measured k from the
  victim's own thrust in the event tick; the gun cells do not, because that weapon's beat silences it.
- `peakYawRadPerS` on the shove scenario is the AI hostile's own steering, not the hit's spin — the
  un-shot control arm peaked higher (6.00 vs 4.27 rad/s). `feel.hitstun_curve`, whose victim flies
  straight, is the authoritative entry-spin number.
- B11's mass-ratio clause and its "NPCs recover with real thruster torque, never a hidden gyro"
  clause are not yet bars.

**CORRECTION, same night, before anything was built on it.** The first version of this receipt scored
B4's third clause — *"a light hostile **already at cruise** gets faster when shoved along its motion"*
— as MET at 1.53x. That green was unearned. The instrument spawned the victim at cruise and then let
an AI hostile fly an attack run for a second before the hit; measured, it was down to **49.6 WU/s,
24 % of a wasp's cruise**, by the time the shove landed. The clause exists to interrogate the speed
governor above cruise, and at a quarter of cruise the governor is not in play at all — so the number
was real but it answered a different question. The along-motion arm now flies STRAIGHT under its own
thrust with no AI, and does not take the hit until it has actually reached 90 % of cruise; the arm
records `speedBeforeFractionOfCruise` and the clause **cannot be marked met** unless that premise
holds. This is the same class of defect as the 100x starter-gun number above: a deterministic,
repeatable, test-passing measurement of the wrong thing.

**A note on which tree these numbers belong to.** They were measured before FLIGHT's PQ-137.03 (the
nimble regime) landed. That change halves governed cruise catalog-wide (wasp 210 → 105), so every
number here that is expressed as a *fraction of cruise* roughly doubles for the same absolute shove,
with no change in this lane. The absolute values (26.25 WU/s of delta-V, 0.483 s of helm-loss,
4.13 s of tumble) are the ones to carry forward; the fractions must be re-measured after .03.

**Checks run.**
- `node --test test/hitstun-curve.test.mjs` — 3/3 pass.
- Two-pass determinism on both scenarios — bit-identical.
- 60/60 cells measured.
- `npm run check:baseline` was NOT the gate for this leaf: three physics lanes share this checkout,
  so its `sim`/`sim-v3`/`sim-compare` goldens are red for everyone whenever any lane holds an
  uncommitted physics edit. This leaf touches no `src/` file and no golden.

**Goldens.** None touched, none expected to move: this leaf adds two bench scenarios and a test.
