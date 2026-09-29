<!-- LIFETIME: DURABLE -->
# Hull Burst and the physics overhaul — design

Status: owner-validated design, 2026-09-29. Informative rationale: this file does not dispatch work or
grant a lease. Implementation is admitted through the ordinary program queue (`build_map.md` §1).
Product authority stays `design/VISION.md` ("The Massline is a signature mechanic", "Combat should feel
delightfully abusive").

## 1. The problem

The Massline is a one-trick pony. The only thing the player's *position* does is decide where damage
lands and where bullets leave. Contact is one-way and free (the player takes no impact damage; the Ram
Plate is a damage multiplier), so a hull has no reason to be anywhere in particular, and the tool that
moves the hull (the Massline) inherits that irrelevance. Swinging around a rock is play, and swinging
around an enemy is only bullet dodging.

Thesis: **make the hull a third channel.** If the ship's body does something where it is, then the
Massline becomes the best way to put it there fast and aimed.

What already exists and is not a new invention (verified 2026-09-29):

- All Massline2 features are ON in the production profile (`src/runtime/runtimeProfiles.js`):
  throw, tumble, impact damage, hitchhiking, six rope heads.
- The five number-key field powers (`src/data/fields.js`, kernel `src/core/fields/fieldKernel.js`,
  system `src/systems/fields.js`): Well (pull), Repulsor (shove ring), Clearing Cone (player-attached
  forward wedge, `halfAngleRad` 0.56, strength 260). They are gentle lane-clearing tools, with no
  high-speed fling, no kill, and no Massline coupling.
- The hitstun law (`HITSTUN_LAW`, `SHOVE_BEAT_LAW` in `src/combat/impulseKernel.js`): a hull loses the
  helm only when ΔV ≥ ~14% of its cruise speed (`uFloor` 0.14), the stun is short (1.0 s at k = 0.30,
  cap 3.5 s), and heavies (mass ≥ 150, `HEAVY_AS_TERRAIN_MASS`) shrug. This is why enemies "buzz
  against the wind."
- Tumble is one helm-override writer for every delivered impulse (`src/systems/tumbleStates.js`) with a
  0.9 s recovery window at 0.35 thrust.
- Weak arcs on big hulls (`src/data/weakPoints.js`, mostly rear) that only bullets can use.
- Stunt scoring with cause chains (`src/systems/stuntGrammar.js`, `src/combat/stuntTaxonomy.js`) and
  Open Line Contracts (`src/combat/stuntContracts.js`); credit parity between gun and physics kills
  (`src/data/killRewards.js`: "credits stay equal across gun and physics kills", stunts pay as
  salvage-rights chits).
- Four specialists that each break one player plan (`src/ai/specialistPlans.js`).
- Module patterns for build-defining verbs: Ram Plate, Swing Drive (`src/data/modules.js`; derived stats
  in `src/systems/ships.js`).

## 2. Owner decisions (2026-09-29)

| # | Question | Ruling |
|---|---|---|
| 1 | What gates the hull shield? | A **special attack that lasts a while**, upgradeable to last longer. Not a constant. |
| 2 | How are types chosen? | **One slot, one type.** Fit one hull-burst module at the station; each type is a build. |
| 3 | Shape | **Mostly front-facing.** The nose is the weapon; heading, spin and swing arcs matter. Volumes are cone/ring/sheet, never a sphere (field-kernel law). |
| 4 | Scope | **Full physics overhaul** (ground rules, burst family, tie-ins, enemies, pay, consequences). |
| 5 | Crash risk | **The player never takes physics or impact damage.** At worst a temporary stun and tumble. Ships that take too much pressure or impact tumble out of control, fly off in a new direction and ping off objects, and are **not acted on by their own propulsion** while tumbling. Nothing should "buzz against the wind." |

Ruling 5 flips one existing rule: "the player ship never tumbles" (comment in `tumbleStates.js`;
asserted in `scripts/check-massline2.mjs`, `test/weapon-impulse-consequence.test.mjs`,
`test/massline-presentation-uvp.test.mjs`). Those assertions are updated as part of stage 1, not
worked around. "Never damaged by physics" stays true and stays asserted
(`masslineImpactDamage.js` invariant).

## 3. The ground rules (stage 1)

**Nothing is hurt by physics. Everything can lose control.**

1. **Player:** never takes impact damage from asteroids, ships or stations. A big-mass hit or an
   enemy physics attack can cost a short stun and tumble: a warning cue, a hard cap on duration
   (placeholder ≤ 1.0 s), the existing recovery window, then a short immunity window (placeholder
   2 s) so nobody can chain-stun-lock the player.
2. **Enemies lose control more easily.** Lower `uFloor` and lengthen the stun for light and medium
   hulls. Heavies keep shrugging (moving terrain); a heavy is shoved and briefly stunned but does not
   spin off.
3. **A tumbling ship is a projectile.** During a tumble all thrust is off, including AI thrust, so
   nothing fights the knockback. The hull carries its new velocity, bounces off rocks and other hulls
   and can knock others into tumbles. Its damage is what it hits while tumbling, attributed to the
   player.
4. **Recovery is a beat.** Damped spin, weak thrust, no guns: the window to finish or re-fling.

Retune-first: most of this is constants in the existing law plus a thrust cut and restitution on the
existing tumble writer. Determinism: sim uses `state.rng` / `state.simTime`; no new ambient random.

## 4. Hull Burst modules (stages 2-3)

A fitted `utility` module (pattern: Ram Plate, Swing Drive). Activated on a key. Runs for a duration,
then recharges for clearly longer than it lasted. Tech-tree tiers add duration, wedge length and
strength.

While active:

- a **front wedge** (the field-kernel cone volume, player-attached) sits at the nose;
- the player counts as **much heavier for collision mass**. The hitstun mass factor
  (`hitstunMassFactor`, clamped 0.5-2.2) caps this advantage, so light/medium hulls tumble on contact
  and heavies need the module's own kick on top;
- anything touched inside the wedge takes the module's effect, **scaled by closing speed**.

Starter roster:

1. **Gravity Bumper.** Hurls light and medium hulls away at high speed; they tumble, ricochet and
   trigger further tumbles. Heavies are shoved hard but keep flying. The Clearing Cone stays as the
   gentle utility; this is its violent cousin.
2. **Fire Lance.** Narrow, short wedge; contact kills light/medium hulls. Heavies ignite and burn
   (existing burn status). The finisher: you must fly straight at it.
3. **Grip Bumper.** Catches a light hull on the nose and carries it; when the burst ends or the
   player cuts it, the hull is released at the player's speed. A battering ram with a hostage, and
   the type where a Massline swing matters most.

Later types follow the same pattern (for example a cryo plow: freeze, then shatter on impact).

## 5. Tie-ins that make position matter (stage 4)

1. **Speed scaling.** Burst effect scales with closing speed along the wedge. A crawling touch is a
   nudge; a full-speed hit is the module's full effect. A Massline swing is the fastest way to arrive
   at speed and aimed, so the loop is swing, ignite mid-swing, release into the group.
2. **Everything you fling is your weapon.** Hulls the burst sends tumbling count as the player's for
   what they hit. The stunt system already tracks cause chains and pays credits, reputation and
   salvage rights, so "burst, ricochet, second ship dies" is a recognized trick with a chain bonus.
3. **Burst contact is a hit at the contact point.** Contact on a weak arc gets the weak-point bonus
   (`weakPoints.js`), so flying around to a big ship's rear becomes a hull skill.
4. **Position has four uses:** approach angle (the nose), arrival speed (the Massline), what is behind
   the target (rocks, hazards, other hulls), and which arc of the enemy is exposed.

## 6. Enemies, pay and consequences (stage 5)

Enemies that answer the burst (same pattern as `specialistPlans.js`: each names the player plan it
breaks, has a verb and a telegraph):

- **Stabilizer.** Light support hull whose pulse cancels tumbling on nearby allies. Breaks "fling
  everyone and watch"; answer: kill it first or fling it.
- **Skirmisher.** Reads the burst warming up, keeps range, bolts when the wedge lights. Breaks "walk
  up and ram"; the answer is a Massline swing that closes the gap at speed.

Tether cutters and anchors stay. Heavies stay moving terrain; answer: fling something at them or take
the rear arc.

Pay and consequences (credit parity between kill styles is kept):

- **Physics writs:** new Open Line Contract offers whose answers include the burst (for example "clear
  the escort without firing a shot"). Completion is judged from causal trick receipts; cards are
  recognition, not score.
- **Loot follows the fling:** kill loot already inherits victim velocity, so where a hull is flung
  decides where its loot lands.
- **Collateral is real:** a tumbling hull that strikes a civilian or patrol counts as the player's
  harm (heat, reputation, scattered cargo) under the existing civilian-harm rules.

## 7. Safety, save and testing

- Feature switches default OFF in the frozen `legacy47a` profile so the deterministic goldens stay
  byte-identical; ON in `production`. Never edit `test/*.expected.json` to pass.
- Burst state is transient and unsaved. A save load, dock, jump or death ends it. It cannot stack.
- Allies in the wedge are nudged, never flung or harmed.
- Frontend changes stay minimal and follow `design/frontend/ORRERY.md`; a HUD indicator is required
  (a feature is not done until it is reachable on the default route: shop, key, HUD, VFX, audio).
- Proof is a fixed-seed number, not a screenshot: share of light-ship hits that tumble, distance a
  flung hull travels, seconds the player is ever stunned. Then one targeted playthrough for the
  overall feel (`docs/VALIDATION_WORKFLOW.md`).

Known tuning risks (tune, do not solve now): player stun length, heavy resistance, and whether the
recharge reads as a special attack or a wait.

## 8. Build order

1. Ground rules: tumble law retune, thrust cut, bounce, capped player stun; update the old
   "player never tumbles" assertions.
2. Burst framework plus Gravity Bumper, end to end (module, key, HUD, VFX, audio, tiers).
3. Fire Lance and Grip Bumper.
4. Speed scaling, fling credit, weak-point contact.
5. Stabilizer, Skirmisher, physics writs, collateral.

Each stage is reachable in the real game before the next begins.
