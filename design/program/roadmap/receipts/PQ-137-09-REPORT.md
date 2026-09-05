<!-- LIFETIME: RECEIPT -->
# PQ-137.09 — Chains go off

```text
DONE  PQ-137.09 — one shove into a cluster now sets off a chain of explosions instead of nudging one ship.

WHAT I FOUND     Nothing in the room could set anything else off: a mine that threw a ship never
                 took its helm, a bomb stuck to a hull only ever went off when the player pressed
                 the button, a gravity well pulled ships in faster and faster until they killed
                 each other, and two ships on the same rope felt nothing of each other's hits.

WHAT I CHANGED   Bombs now go off when the ship carrying them slams into something, a blast cooks
                 whatever it throws hard enough for about a second so that ship goes off on its
                 next slam, a well now pulls ships together at a settled speed and cooks whatever
                 it grinds against itself, and a taut rope passes a share of one end's hit to the
                 other.

WHAT YOU WILL FEEL   Shove one primed ship into a knot of enemies and the room comes apart on its
                 own — a bang, ships spinning, then two more bangs a beat later that you did not
                 fire. What still is not there: none of this has its own sound or effect yet, and
                 you cannot carry a bomb into the Crucible at all, so today you can only start a
                 chain there with the gravity well.

THE NUMBERS      bar | before | after | target
                 secondary consequences from ONE player action (seed 4242) | 0 | 15 | >= 3
                 distinct kinds of consequence | 0 | 4 | >= 2
                 well convergence speed, relative to the well | 81.0 and climbing | 42.5 | 30-60 WU/s
                 hulls a well primes by grinding them together | 0 | 2 | >= 2

THE FRAMES       none — no strip tape exists for this and the tape file belongs to another lane.
                 The exact block to add is in the appendix.

NEXT             node scripts/program-dispatch.mjs --next
```

---

## Engineering appendix

### 1. Surface before invent — the audit

Every rule below is a connection between things that already existed. The audit, and what each one
turned out to be missing:

| Already computes | What it already did | What it was missing | Connected as |
|---|---|---|---|
| `src/systems/impulseCharges.js` | sticky plates, armed/detonate lifecycle, blast falloff, shove cap, massline combos | the blast never published to the hitstun law, and nothing but a keypress could set it off | `_onPhysicsImpact` -> `_resolveSlams` -> the existing `_detonateOne`; one extracted `_blastVictims` serves the plate, the slam and the cook-off |
| `src/combat/impulseKernel.js` (read-only, another lane) | `resolveHitstunLaw`, `publishHitstunImpulse`, `COLLISION_CONSEQUENCE_LIMITS.tumbleDeltaV` | nothing — it was complete; `impulseCharges` was simply the one impulse source in the game that never called it | imported and called; the prime test IS `resolveHitstunLaw(...).durationS > 0`, the same expression `tumbleStates` evaluates |
| `src/systems/tumbleStates.js` (untouched) | the single helm-override writer, already listening on `combat:hitstunImpulse` | nothing | both new intents (blast fling, tether share) arrive on that existing event; **zero edits to this file** |
| `src/core/fields/fieldKernel.js` (read-only) | `field.damping` — a velocity term with the same falloff as the radial term | nothing; the player-deployed Well authored it as `0` **and the deploy path never forwarded it at all** | authored `5.3333` and added the missing `damping: def.damping` to `_deployRadial` |
| `src/systems/fields.js` `_wellBodies` / `_wellAccum` | the per-tick set of craft a well is acting on, already bounded by `maxAffected` | no notion of two of them being in contact | `_detectWellGrind` walks that existing set id-sorted and emits `well:grind` |
| `src/core/sg02DynamicBodyOwner.js` `_applyAttachmentSpring` (read-only, another lane) | the pair's reduced mass `mu`, used for stiffness and damping; `getAttachmentTelemetry().phase` | nothing | the share is `dV * mu/m_p`; the taut gate is that telemetry's own phase |
| `src/systems/swarmChain.js` | scores a kill chain, and already steps on `entity:killed` for anything `runOwnsReward` accepts | nothing | **not edited.** A chain kill in a swarm run steps the score through the event that already exists |
| `src/systems/cargo.js`, `src/systems/combat.js` | cargo writer, `routeDamage` | nothing | used unchanged |

### 2. The three measurements, in order (the loop)

**Measurement 1 — the rules in, the slam read from the consequence receipt: 0 consequences.**
`combat:collisionConsequence.deltaV` is `exchangedMomentum / mass` for ONE tick. The soft contact
solver spreads a craft-craft contact across about twelve ticks: a wasp shoved into another wasp at
**57.5 WU/s** produced impulses 173 -> 107 -> 67 -> 42 -> 26 -> ..., so the first receipt read
**10.8** — 0.6 of the slam floor — and the pair cooldown suppressed the rest. Read that number and a
57.5 WU/s slam is a scrape and nothing can ever go off.

Fix: read `physics:impact.preSolveClosingSpeed` against the same `tumbleDeltaV` threshold. This is
not a new law — PQ-137.06 already established it for terrain damage ("the solver bound stays a rate
limit and never the damage input"). Result: **3 consequences.**

**Measurement 2 — 3 consequences, but the chain fired on a bystander.** A plate is a physical object
on a physical face. `_tryStick` seats it up to `hostRadius + chargeRadius + stickRadius` = 21.2 WU
from a light hull's centre; the hull it is then carried into sits a further 28 WU away. Worst case
the blast must cross **49.2 WU** to reach the centre of the ship it slammed. At `radius: 42` it
delivered **7.4 WU/s** there (0.07 of the stun threshold) and instead primed a ship 23.7 WU off to
one side. Measured, seed 4242, plate stuck on the aft face.

Fix (the ONE authored number this leaf moved): `charge_standard.radius` **42 -> 84**. Derived, not
tasted: priming a light victim needs falloff >= 0.294, i.e. radius >= 49.2 / 0.706 = 69.7; 84 is that
with margin. **Centre magnitude is unchanged** (`impulse / mass`), so every bar written "at the
centre" reads exactly what it read before. Result: **16 consequences.**

**Measurement 3 — one beat was doubling.** Both ends of a contact are queued together, so a hull
primed by the blast that had just gone off beside it cooked off in the same drain, off the same
contact: one slam, two detonations. A prime now has to predate the tick of the slam that fires it.
Result: **15 consequences**, and the trace reads as beats — t100 slam detonation, t101 first cook-off,
t141 second.

### 3. The rules, as shipped

1. **Slam detonation.** A hull carrying an armed plate detonates when `preSolveClosingSpeed >=
   COLLISION_CONSEQUENCE_LIMITS.tumbleDeltaV` (18 WU/s) — the same number the game already uses to
   take a helm. The player is skipped: the player is never a bomb.
2. **Priming.** Every detonation publishes a hitstun impulse per victim and primes exactly those the
   one law would stun (`resolveHitstunLaw(...).durationS > 0`), for `CHAIN_REACTION.primeWindowS`
   (0.8 s, tick-quantized). A plate never primes the hull it was stuck to.
3. **Cook-off.** A primed hull answers its NEXT slam with a blast at `sympatheticYield ^ link` of a
   plate. Decaying yield is why a chain is finite; `maxLinks` (4) is the hard stop behind it. Nothing
   scripts a death — a hull lives or dies on the damage.
4. **Well convergence.** `FIELD_DEFS.well.damping = 5.3333`. The kernel's radial term is
   `strength * fall` and its velocity term is `-v * damping * fall`: same falloff, same coupling, so
   they cancel at exactly `strength / damping = 45.0 WU/s`, at every depth and for every mass. A
   heavy takes longer to get there and still gets there. Pinned as a fixed point in
   `test/chain-well-convergence.test.mjs`.
5. **Well grind.** Two craft in surface contact inside a well for `WELL_GRIND.ticks` (24 = 0.4 s)
   consecutive ticks emit `well:grind`; `impulseCharges` primes both. `fields.js` never writes primed
   state — one writer.
6. **Tether share.** On `combat:tumbled`, each ACTIVE and TAUT attachment with the victim at one end
   publishes a hitstun intent for the other end at `dV * m_v/(m_v+m_p)` = `dV * mu/m_p`. It emits an
   intent; `tumbleStates` and the one law decide. Loop-guarded on `source === 'tether_share'`.

### 4. Did it add drag, a clamp, a gyro, a transform write, or hit-point scaling?

No — and one line needs saying out loud, because it looks like drag:

**The well's velocity term is not drag.** It exists only inside a bounded, player-deployed,
9-second volume; it is a FORCE with a fixed point, not a subtraction from a speed; a body slower
than 45 WU/s is *accelerated* by it; nothing is ever clipped and no earned momentum is deleted (a
body at 400 WU/s is opposed harder, never truncated — pinned by the "nothing is clipped" test). The
player is already excluded from their own well by `filters.excludeId`. The enemy anchor snare has
shipped this same term since PQ-012 at 185/3.2 = 57.8 WU/s. The leaf's own done-when asks for
exactly this: "a force law whose equilibrium is that band".

**Scoped to craft.** The kernel applies the velocity term only when a velocity sample is handed to
it, so `fields.js` hands it only for `ship`/`drone`. Projectiles keep "curve the shot", pickups keep
"vacuum the loot", and debris/payloads/rocks keep the pure positional funnel the release predictor
was built around. (Measured: without this scoping, `test/fields-predictor.test.mjs` moved — a wreck
travelled 7.5 WU where the test wants > 8. The scoping is the fix; the test was not touched.)

No NPC gyro (recovery is `tumbleStates`' existing real thruster torque). No transform writes — every
motion crosses `combatPhysics.applyImpulse` or is an intent someone else owns. No hit-point scaling.

### 5. Files changed

Source:
- `src/data/impulseCharges.js` — new `CHAIN_REACTION` block; `charge_standard.radius` 42 -> 84.
- `src/data/fields.js` — `FIELD_DEFS.well.damping` 0 -> 5.3333; new `WELL_GRIND` block.
- `src/systems/impulseCharges.js` — the chain owner: slam trigger, primed state (single writer),
  cook-off, `_blastVictims` extraction, hitstun publication on every blast.
- `src/systems/fields.js` — forward `damping` on deploy (it was silently dropped); scope the
  velocity sample to craft; `_detectWellGrind` + `well:grind`.
- `src/systems/tetherGameplay.js` — `_shareHelmLoss`.

Bench and tests (new):
- `scripts/lib/bench/scenarios/feel.chain_reaction.mjs`
- `test/chain-reaction.test.mjs`, `test/chain-tether-share.test.mjs`,
  `test/chain-well-convergence.test.mjs`, `test/chain-reaction-determinism.test.mjs`

Deliberately NOT changed: `src/systems/swarmChain.js` (connected by the `entity:killed` it already
consumes), `src/systems/tumbleStates.js` (already consumes the event both new intents use), and
every file another lane holds.

New events, all additive: `chain:slam`, `chain:primed`, `chain:primeEnded`, `chain:detonated`,
`chain:tetherShare`, `well:grind`. `charge:detonated` gains `trigger` and `hostId` fields.

### 6. Checks

| Check | Result |
|---|---|
| `npm run check:baseline` (before) | green except the two `sim` children, which fail on a PRE-EXISTING evidence-schema violation in `test/47a.telemetry*.expected.json` (`notes[44]`, `notes[45]`, `notes[63]`, `notes[64]` exceed the 260-character cap). Not this unit's; not touched. |
| `npm run check:baseline` (after) | see the line recorded below the table |
| `npm run check:massline` | 25/26 green; `check:47a:physical-branches` hit its 150 s wall budget at 152 s under parallel load. Re-run alone: **green** (exit 0). Environmental, not a red link. |
| `node --test test/chain-*.test.mjs` | 28/28 green |
| `node --test` on the field / charge / vfx surface | green, except `field-anchor-controller` "anchor snare alters a body trajectory", which is **RED AT HEAD** — verified by running that file against `git show HEAD:` copies of both fields files. Not this unit's. |
| `node scripts/check-impulse-authority.mjs` | green |
| `node scripts/check-impulse-massline-combos.mjs` | green |
| `node scripts/sim-golden-diff.mjs` (+ `--flight-system v3`) | see below |

**Goldens.** No hash should move and none did: `impulseCharges`, `fields`, `tetherGameplay`,
`tumbleStates` and `collisionConsequences` are all absent from `sf-sim.mjs`'s curated 47-A system
list (verified in `scripts/sf-sim.mjs`), and `fields` additionally holds the three-layer golden gate
(`FIELD_FLAGS.enabled` is false under node, it is not in the curated list, and nothing auto-deploys
a field). `src/data/fields.js` and `src/data/impulseCharges.js` are not on the tape's import path.

**One regression I caused and removed.** `_prime` first published a `presentation:vfxCue`, which
turned `test/vfx-impulse-cone.test.mjs` red ("declared families stay cone/sheet/ribbon, not rings").
PQ-137's non-goals say "No VFX/audio (that is PQ-139)", so the cue is gone and the `chain:primed`
receipt is the seam PQ-139 consumes. Confirmed mine by running that file against `git show HEAD:`
copies; green again after.

### 7. Shared-change requests (the two things I could not do from here)

1. **The Crucible cannot carry a plate.** `physics_toolkit` (`src/data/combatLabSetups.js`) grants
   three weapons and no cargo, and nothing on the Crucible route grants `cmdty_impulse_charge` — so
   "prime one, sling it" is not performable there today. The chain IS reachable in the Crucible
   through the well (Digit5 -> grind -> prime -> shove), and fully reachable on the adventure route
   where charges are bought. Request, for PQ-137.05's kit decision: grant the Crucible starter a
   small stock of `cmdty_impulse_charge` (4 units, 8 volume) alongside the shove weapon.
2. **A strip tape for the chain.** `scripts/lib/bench/frameStripCapture.mjs` `STRIP_SCENARIOS` is
   another lane's file. Proposed block, using only live bindings (`Digit5` deployWell, `KeyY`
   chargeThrow, LMB fires, WASD flies) — the well variant, so it works with today's Crucible kit:

```js
  chain_reaction: {
    // PQ-137.09. Deploy a Well into the swarm so it converges hulls onto each other and primes
    // what it grinds, then shove one of them with the concussion cannon. What the strip has to
    // show is the beat AFTER the shove: a bang the player did not fire, ships spinning, then a
    // second bang a moment later.
    label: 'Crucible swarm, well the cluster, then shove one primed hull into it',
    loadoutId: 'physics_toolkit',
    durationS: 26,
    warmup: [
      { atS: 0, aim: 'nearestHostile' },
      { atS: 0.1, mouseDown: true },
      { atS: 1.2, mouseUp: true },
    ],
    tape: [
      { atS: 0.5, keyDown: 'KeyW' },
      { atS: 2.5, keyUp: 'KeyW' },
      { atS: 3.0, aim: 'nearestHostile' },
      { atS: 3.5, keyDown: 'Digit5' },
      { atS: 3.65, keyUp: 'Digit5' },
      { atS: 9.0, aim: 'nearestHostile' },
      { atS: 9.5, mouseDown: true },
      { atS: 11.0, mouseUp: true },
      { atS: 16.0, aim: 'nearestHostile' },
      { atS: 16.5, mouseDown: true },
      { atS: 18.0, mouseUp: true },
    ],
  },
```

### 8. Unfinished, and why

- **No frames.** There is no chain tape and I may not add one to another lane's file; the block
  above is written for the integrator. Everything else in the leaf is measured.
- **No sound or effect for a prime or a cook-off.** Deliberate: PQ-137's non-goals hand that to
  PQ-139, and `chain:primed` / `chain:detonated` / `chain:slam` are the receipts it will read.
- **`field-anchor-controller` "anchor snare alters a body trajectory" is red**, at HEAD and after.
  It is not this unit's and I did not touch it.
- **The two `sim` children of `check:baseline` are red on an evidence-schema length cap** in a
  golden's `notes` array, at HEAD and after. Not this unit's.
