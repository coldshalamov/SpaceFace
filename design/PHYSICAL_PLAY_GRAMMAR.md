<!-- LIFETIME: STABLE -->
# SpaceFace — Physical Play Grammar

**Status: DESIGN PROPOSAL, NOT ADMITTED WORK.** This document owns the *mechanics-level* description
of how physical play is intended to work: the primitive/state/outcome grammar, the input models, the
presentation language that makes them legible, and the record of ideas that were tried and rejected.

It does not claim implementation, status, or acceptance. Nothing here is committed scope until the
lead assigns a roadmap ID and admits a bounded slice through `design/program/`. Where this document
disagrees with `ARCHITECTURE.md`, architecture wins. Where it disagrees with `GDD_2_0.md` §4–§6, this
document is the more recent design intent and the GDD should be corrected in the same pass.

Source: design conversation, 2026-07-26. Written to stop mechanics-level nuance from being lost
between sessions.

---

## The game, in plain language

Read this part even if you skip the rest. Every specification below is downstream of it, and specs
without it produce technically-correct work that misses the point.

**SpaceFace is a game about grabbing space and throwing it at things.**

You fly a ship that has real mass, in a world made of other things that have real mass, and your
signature tool is a rope — the Massline — that couples your mass to theirs. Everything else in the
game is an elaboration of that one idea. Gravity wells that make things heavy. Repulsors that make
them light. Webs that lash eight ships into one flailing knot. A tractor beam that lets you pick
something up and *throw* it. These are not a weapon list. They are a family of instruments that all
answer the same question in different ways: **how do I change where mass is and how fast it's going?**

The camera looks down. That is a readability superpower, not a limitation — you can see the whole
fight, every threat, every rock, the entire geometry of the situation at a glance. Lean into it. The
player should be able to look at one frame and know what is about to happen.

The player's hands are on a keyboard and a trackpad. Not a gamepad, not a mouse with a scroll wheel —
**a trackpad**, often. That constrains everything: no sustained right-click-holds, no precision
flicks, no wheel gestures, no hover-only information. A verb that requires the player to do two
delicate things at once with the same hand is not a verb, it's a bug report waiting to happen.

The fantasy is not "space trucker with spreadsheets." It is closer to **a physics playground with an
economy attached**. You should want to fight because fighting is a puzzle made of momentum. You
should want to mine because mining funds better toys. You should want more enemies on screen, not
fewer, because more enemies means the web catches more.

The look should be **grounded ships in a dark void, and neon where the forces are.** Grey PBR hulls
are an asset — they are the dark surround that makes the energy read. When a Massline goes taut it
should be the brightest object on the screen. When it snaps it should whip. When a gravity well
opens, space itself should bend around it. The world stays honest; the forces glow.

And the sound should tell you how heavy everything is. A freighter shouldering a rock aside and a
scout clipping the same rock are not the same event, and right now they make the same noise.

**Three things to hold in your head while implementing anything here:**

1. **The player has two hands and a trackpad.** Test the input model before the mechanic.
2. **If the player can't see it, it doesn't exist.** A state with no visual is a bug.
3. **Depth comes from combination, not from count.** Before adding a system, ask what it lets the
   existing systems do that they couldn't before. If the answer is nothing, it's content, not depth.

---

## 0. Why this document exists

The repository has ~60 design documents. None of them record a mechanic **at the input level** —
which hand is on which key, what the cursor is doing, what happens frame by frame. So every agent
re-derives mechanics from prose descriptions of how things should *feel*, and prose descriptions
consistently produce mechanics that do not survive contact with top-down keyboard/mouse control.

Two rules follow, and they are the point of this file:

1. **A mechanic is not specified until its input model is specified.** "Tether a planet and swing
   around it" is not a spec. "Left hand holds WASD, cursor is steering the nose, so the tether cannot
   require a cursor move" is a spec.
2. **A rejected approach without a written reason will be re-proposed forever.** §10 records
   approaches that were evaluated and set aside, each with the mechanical reason and a positive
   alternative, so that the reasoning is inherited along with the conclusion.

§10 is a design record, not a prohibition list. An approach recorded there can be revisited by
addressing the stated reason. It is not a guardrail, and nothing in it restricts work outside the
specific approach described.

---

## 1. The product claim

The distinctive play is **direct manipulation of mass and momentum**. Not "a rope." The Massline is
one instrument in a class.

| Instrument | What it does to mass | Present state |
|---|---|---|
| Massline | couples two masses (constraint) | implemented, `Space`/`F` |
| Mass Seed | plants a gravity source | implemented (PQ-011), `Digit4` |
| Well | static attracting field | implemented (PQ-012), `Digit5` |
| Repulsor | static repelling field | implemented, `Digit6` |
| Clearing Cone | directional clearing field | implemented, `Digit7` |
| Skim Collector | harvest field | implemented, `Digit8` |
| Impulse charges | instantaneous force | implemented, detonate on `R` |
| Tractor beam | continuous positional force at cursor | proposed, §7.3 |
| Neutron slug | *moving, decaying* gravity source — the Well is static | proposed |
| Snarl / Capstan | couples N masses to one hub | proposed, §5 |
| Directional shield | one-way projectile filter | proposed, §6 |

Framing the class this way, rather than framing the Massline alone, is what makes a progression lane
possible (`GDD_2_0.md` §11 "physics verbs get their own progression lane") and what stops each new
tool from having to justify itself in isolation.

**The class already exists and none of it can be earned.** Six instruments ship today, gated only by
build feature flags (`src/data/featureFlags.js:39-56`, checked at `src/systems/fields.js:111`) — no
module, no research, no purchase, no teaching moment. They are simultaneously the game's most
distinctive content and the only content with no acquisition arc. §8.1 addresses this.

**Category name for the interchangeable, spacebar-launched slot: `Rig`.** It fits the existing
nautical/industrial voice (spool, capstan, massline, Kessler), it covers non-rope instruments
naturally, and "what's your rig" reads correctly in UI and fiction. Alternate considered: `Tackle`.

---

## 2. The grammar: primitives → states → outcomes

### 2.1 The diagnosis

Every physical verb currently resolves **immediately and in isolation**. Tow resolves to towed. Spin
resolves to spinning. Snap resolves to damage. Nothing a player does leaves behind a *condition* that
another primitive can exploit, so nothing chains, and the total outcome set is three items: collision
damage, weapon damage, massline snap damage.

This is why the physical toolkit feels shallow despite being deep. Depth in an action game comes from
combination, not from count. The missing layer is between the primitive and the outcome.

### 2.2 States

A state is a physical condition an entity can be in. Primitives **set** states; other primitives
**exploit** them. States are the combination layer.

| State | Physical meaning | Set by | Exploited by |
|---|---|---|---|
| **Drifting** | engines dead, pure ballistic — an object, not an agent | EMP/spike, boarding, power kill | tow, throw, board, capture |
| **Spinning** | high angular velocity — cannot aim, weapons drift | tractor flick, tether release, glancing impact | everything; it cannot return fire |
| **Primed** | carrying energy that wants out | overload weapon, coolant breach, volatile cargo | *any* impact detonates it |
| **Pinned** | artificially massive, cannot accelerate | gravity well, mass seed | web, tow, execute |
| **Unmoored** | artificially light, thrown by anything | inverse well | tractor, collisions, wake |
| **Hot** | high signature — visible and targetable | firing, boosting, using rigs | seekers, ambush; inverse of cloak |
| **Breached** | hull open, venting, thrust unreliable | melee charge, snap damage | board, capture, cargo strip |
| **Snarled** | coupled to N others | Snarl / Capstan | spin, bomb, use as shield |

Design constraints on the state set:

- Every state must be **legible without UI** — it needs a distinct silhouette, motion, or emission
  (see §9.3). A state the player cannot see is a bug, not a mechanic.
- Every state must have **counterplay**, per `CANONICAL_BUILD_MAP.md` §6 question 3.
- States belong to simulation, not presentation, and must survive save/Continue.

### 2.3 Outcomes

With states, the objective set stops being "kill" and becomes:

**disable** (set Drifting) · **destabilize** (set Spinning) · **prime** (set Primed) · **pin** (set
Pinned) · **strip** (set Breached) · **capture** (Drifting + boarding) · **kill**

Each wants different primitives. That is the depth being asked for, and it costs roughly eight states
rather than a long weapon list.

### 2.4 Chains

The property that makes this worth building is that states **cascade**, producing outcomes nobody
authored:

> Prime a ship → tether it → sling it into a crowd → the line snaps → snap damage Breaches two more →
> a Breached hull vents into a Primed one → detonation → the blast snaps three more lines.

One setup, several seconds of consequence the player only watches. This is the felt difference
between a physics toolbox and a physics game.

**Recommended first build: disable → tow → capture.** Every part of this chain already ships and only
one number changes:

| Step | What exists |
|---|---|
| disable | `wpn_emp_disruptor_m` routes all damage to subsystems (`src/data/weapons.js:141-146`); `subsystem_drive` disable is defined at `src/data/combatDefs.js:161-166` |
| the state | `combat:subsystemDisabled` fires (`src/combat/subsystems.js:72`); AI reads `self.disabled`/`contact.disabled` (`src/systems/aiPorts.js:625, :718`) |
| the invitation | `aiPorts.js:984` already scores a drive-disabled ship `tetherabilityBand: 'excellent'`; `combatOutcome.js:61` already prints "capture window open" |
| tow and capture | `src/systems/surrenderRecovery.js` already tows a yielded ship to lawful custody on a 45 s clock |

**The one change:** `combatDefs.js:165` sets `multipliers: { movement: 0.25 }` for a disabled drive.
Setting it to `0` turns "crippled" into **Drifting**, and the chain closes.

Prime → tether → snap → breach was the earlier candidate and is **worse first work**: Primed and
Breached are two of the four states that need new effect machinery (§2.5), whereas disable → tow →
capture is one number plus a visual.

### 2.5 Cost asymmetry across the eight states

Not all states cost the same, and planning should respect the split:

- **Cheap — data rows in an existing service.** Drifting (one number, above) and Spinning (already
  exists, see §11) reuse `src/combat/statuses.js` directly.
- **Moderate — needs a new home.** Hot has no per-entity representation at all; signature exists only
  as a player-only scalar (`src/systems/cloak.js:143-149`, not serialized) alongside a separate
  player-only WANTED heat (`src/systems/heat.js`).
- **Expensive — needs a new effect vocabulary and physics-membrane paths.** Pinned, Unmoored, Primed,
  and Snarled cannot be expressed by `applyEffects`, which understands only capabilities, three
  named multipliers, and blocked action tags (`src/combat/subsystems.js:55-62`). Effective mass,
  damping, detonate-on-contact, and N-body coupling all require writes behind the SG-02 physics
  membrane (`src/core/physicsAuthority.js`).

---

## 3. Objects need properties

The second reason verbs feel thin: **a rock is a rock.** Give world objects physical material
properties and the existing verbs multiply without a single new mechanic.

| Property | Behavior | Makes which verb interesting |
|---|---|---|
| Volatile ore | detonates on hard impact | throwing becomes bomb delivery |
| Ice | shatters into many small bodies | a thrown chunk is a shotgun |
| Ferrous | attracted to wells and mass seeds | it aims itself |
| Hull plate (from wreck) | dense, flat | a shield held on a short line |
| Reactor core | chains to nearby cores | area denial you find rather than buy |
| Coolant tank | freezes/slows in a cloud | crowd control from the environment |

Ore tables, the commodity system, and typed World Site components already exist, so the nouns are
half-built. This also turns **the environment into content**: sectors can play differently by
changing their material mix rather than their layout.

---

## 4. Combat framing: swarms, not dogfights

Precise single-target aiming is where the physical toolkit performs worst — it is the root of the
targeting complaint in §7.1. Against many enemies the player does not need precision, they need
**area**, which is exactly what physical verbs supply. A web that catches eight is significant at
thirty enemies and pointless at three.

The dogfight framing therefore actively fights the toolkit. Swarm framing is not a separate feature
request; it is the frame in which the rest of this document stops being awkward.

Mechanically this is mostly rebalance: enemies die fast, hit soft, and arrive in numbers. It also
supplies the reward loop below.

**Reward loop.** Destroyed entities spray collectible light that accelerates toward the player ship
and counts up on arrival. This is the highest juice-per-hour item available to the project and it is
thematically correct, because the pull is gravity.

---

## 5. Defense

Currently unsolved. The de-facto answer is "fly fast, do not get hit," which fails once the player is
simultaneously managing physical verbs, and fails harder under swarm framing.

Proposals, in order of distinctiveness:

1. **Gravity deflection** — a small well near the hull bends incoming fire around the player. Same
   primitive as the offensive well, so one instrument serves offense and defense. Visually
   spectacular (curving tracers) and unique to this game.
2. **Spinning tethered escort** — the Snarl/Capstan used defensively: captured ships orbit the player
   and absorb fire. See §3.2 of the instrument table and the notes below.
3. **Directional shield Rig** — a projected barrier that blocks incoming fire and passes outgoing,
   for a duration; upgrades extend duration. Proven pattern, reads instantly, low risk.
4. **Deployable structures** — placed cover that blocks fire and provides bounce surfaces.

**Bouncing must be asymmetric.** Player shots bounce off asteroids and structures (so structures
become a damage multiplier and a reason to build); enemy shots do not (so incoming fire stays
readable); bosses and semi-bosses get bounce sparingly as a threat signature. Symmetric bouncing in a
swarm fight is visual noise.

### Snarl and Capstan (the web instruments)

- **Snarl** — fires masslines at every valid body in radius and jettisons the hub, locking them into
  one constraint network. AI flight controllers solve against forces that no longer make sense, which
  is the intended effect. Upgrade axis: spray radius.
- **Capstan** — the winding variant. The hub spins and reels everything inward. Upgrade axis: wind
  speed.
- **Wrap is faked.** Do not simulate rope-on-hub collision. Model the wrap as effective constraint
  length decreasing at `hubAngularVelocity × hubRadius`. This is a one-line length model on an
  existing constraint and produces the correct spiral-and-collide behavior at no physics cost.
- **Bomb web** — an alternative hub that detonates instead of winding. Damage sources: line tension,
  acceleration, snap, and blast.
- **Defensive use** — a spun web of captured ships becomes orbiting armor. This gives the player a
  reason to keep enemies *alive*, which is an incentive inversion no comparable game has. Notes:
  when a shield-ship dies its line goes slack and **whips**, so the armor degrades violently; and the
  law/faction system should treat using crewed ships as armor as a serious offense, which is free
  moral texture on existing systems. A duration (~5 min) before captives work loose is a good clock,
  displayed as line strain rather than a timer.
- **Counterplay** — the hub is a physical body with hitpoints; destroying it releases the web. The
  web catches allies and the player's own hauled cargo. Heavy hulls resist by mass ratio, making it a
  swarm-breaker rather than a capital-ship answer.

---

## 6. Stealth

Stealth's distinct role in this grammar is that it is **the only primitive that operates before the
fight**: cloak → approach → set states (tether, prime, plant) → uncloak with everything already in
position. That makes it a preparation verb in an otherwise reactive game.

- **Heat is the resource.** `heat.js` already exists. Heat is visibility; cloaking suppresses it,
  acting generates it. Self-balancing with no arbitrary timer, and it ties stealth to the same **Hot**
  state that seekers and ambushes key off.
- Upgrade axes: cloaked movement speed, actions permitted while cloaked, heat ceiling.
- Combo target: capture a ship while cloaked, remote-pilot it into a formation, detonate. The
  captured hull generates no heat of its own, so the delivery stays silent.

---

## 7. Input models

This section is the reason the document exists. Record decisions here at the level of hands and keys.

**Standing constraint.** The live default scheme is `pilot` — `src/core/gameState.js:25`, described at
`src/systems/input.js:5-6` as "KEYBOARD FLIES, MOUSE FIGHTS. The mouse never steers the nose."
`src/save/saveSystem.js:3187` migrates older `helm-assist` saves back to `pilot`. So the cursor owns
weapon aim and target selection, not steering.

The contested resource is therefore **weapon aim**, not heading: any mechanic that asks the player to
move the cursor away from what they are shooting costs them their gun. During a fast pass the player
is also under time pressure with both hands committed. Both constraints point the same way — a
mechanic that requires an *additional* independent cursor move during flight is suspect by default.

### 7.1 Massline targeting

**Symptoms.** Latching grabs small debris that happens to be closest, or grabs the wrong body near an
idle cursor, instead of the large body the player is flying toward.

**Actual root cause, confirmed in source.** The live latch path is `_acquireCommandTarget`
(`src/systems/tetherGameplay.js:343-384`) and it is **nearest attachable body by surface distance**,
tie-broken by id. There is no mass term, no swing term, and no cursor term. The weighted scorer the
symptoms are usually blamed on is not running.

**The good scorer exists and is disconnected.** `src/combat/masslineTargetScoring.js` implements
swing-potential ranking with a mass comfort band (ideal 120–1200, `:52-55`), a range comfort band
(ideal 30–75% of 390 wu, `:47-50`), hostility bonus, five contextual intent profiles (`:90-111`), a
Schmitt-trigger stability layer (`:431-486`), and hard gates for protected/blocked/out-of-range.
Note it *forbids* weapon-aim coupling by contract (`:40-41`) — cursor proximity is an opt-in
`intentDir` only.

Three more pieces are written and have **zero callers**:

| Piece | Location | Purpose |
|---|---|---|
| `_refreshAcquisitionPreview` | `tetherGameplay.js:282-314` | produces the live candidate receipt with top-3 alternatives and per-axis contributions |
| `_updateAcquisitionPreview` | `src/ui/masslineHud.js:175-227` | renders a world-anchored label + link line with offscreen clamping and an ARIA live region |
| `_consumeAcquisitionReceipt` | `tetherGameplay.js:316-341` | latches the previewed candidate |

**Decision: show the candidate continuously — by connecting what exists.** Call
`_refreshAcquisitionPreview` every tick regardless of key state, call `_updateAcquisitionPreview`
from `masslineHud.update`, and switch the latch at `tetherGameplay.js:232` from
`_acquireCommandTarget` to `_consumeAcquisitionReceipt`.

That third call is the real behavior change and the real risk: without it the highlight would be a
lie, because the preview and the latch would disagree. With it, the scoring module becomes live for
the first time, which is a genuine gameplay change that needs feel testing — not a wiring task.

**Alternative considered and set aside:** splitting into two keys with disjoint mass-gated candidate
sets. See §10.

### 7.2 Flyby focus

**Intent.** At high closing speed, dilate time so the player has a window to tether a ship that would
otherwise cross the screen in a fraction of a second, and lock the Massline candidate to it for the
duration.

**Named failure mode.** Constant retriggering during a battle, producing repeated zoom in/out.

**All three mitigations ship.** `src/systems/flybyFocus.js` gates acquisition on relative speed ≥ 96,
closing speed ≥ 25, and a bounded time-to-closest window. Its 4-second global cooldown remains the
anti-spam floor across all contacts, while a deterministic 14-second per-target cooldown prevents
the same ship from reopening bullet time throughout one knife-fight.

- **Cooldowns have separate jobs.** The global floor limits overall Focus frequency; the bounded
  `Map<targetId, until>` skips a recently focused ship without preventing a genuinely new attacker
  from opening a later window.
- **Ordinary hostile Focus no longer moves the camera.** The involuntary `FOCUS_PAIR` takeover and
  its render-dependent pair-fit acquisition gate are retired together. Only the explicitly flagged
  onboarding/training Focus exception retains `FOCUS_PAIR`; ordinary hostile leases remain a
  gameplay/time effect under the threat-aware chase camera.
- **Massline reads a dedicated transient target.** Active Focus publishes
  `state.player.flybyFocus.targetId` plus its latch scale, and Massline acquisition consumes that
  target directly as a physically validated bias. Focus never writes or clears
  `state.player.targetId`, which remains the player's explicit persistent gun/UI selection.

### 7.3 Tractor beam — modal, not stateful

Direct manipulation is the only reliable way to aim a thrown mass (see §10 on tow-and-release).
Resolving the conflict with Helm Assist requires it to be a **mode**:

> Hold key → `bulletTime.js` dilates → the ship **stops following the cursor** → the cursor becomes a
> manipulator handle. Cursor motion swings the held mass. Release → throw along the cursor's motion
> vector. Release key → time resumes, Helm Assist resumes.

Properties: it is a **flick**, so power scales naturally with gesture size; the PQ-006 release
predictor extends to draw the throw arc, which is what makes throwing aimable at all; and it pairs
with gravity wells, because the well does the fine aiming.

### 7.4 Massline spin control

**Reel is already an analog axis under hold, not a pair of keys.** There is no dedicated reel binding
(`src/systems/input.js:273-274`, empty in all three schemes). Holding the Massline key past
`MASSLINE_HOLD_S = 0.16` enters line-control (`src/systems/masslineInputGrammar.js:104`), and W/S then
drive `lineLength` continuously (`input.js:1057-1058`) at `reelRate: 69` wu/s
(`src/data/combatDefs.js:227`). A tap-release instead cuts (`masslineInputGrammar.js:109`). Keep this
grammar; do not replace an analog axis with discrete keys.

**The spin-up is genuinely physical.** Reeling writes `attachment.restLength` through the attachment
service into the Rapier constraint (`tetherGameplay.js:511` → `src/core/sg02DynamicBodyOwner.js:364-379`),
so angular speed-up is emergent, and heavy anchors resist the winch via a tension stall term
(`src/core/constraints/masslineController.js:113-115`).

**User correction 2026-08-05 — the release flourish is proportional.**
`selfSlingBonusDv` in `src/systems/masslineThrow.js` adds `actual exit speed × 0.15 × live line load`
along the ship's real exit vector. It requires a genuinely taut, loaded line and at least 25 wu/s of
real motion. Slack, unloaded, near-stationary, and accidental latch/cut cases receive zero; the helper
never chooses a direction or manufactures a flat launch.

### 7.5 Rig slots

Number-key slots, action-RPG style, with slot count as a hull upgrade axis.

**Most of this already exists under a different name.** `Digit4`–`Digit8` are already five physics
instruments — Mass Seed, Well, Repulsor, Clearing Cone, Skim Collector (`src/systems/input.js:239-249`)
— and the **utility slot** already scales from 1 on the Hitch to 8 on the Leviathan
(`src/data/ships.js:41, :400`), which is the hull capacity axis this proposal asks for.

So the Rig system is a **reframing of shipped parts**, not new bindings:
- treat the utility slot type as the Rig slot; do not add a seventh slot type, which would shift every
  index in the positional `fittings[]` array (`SAVE_SCHEMA.md:273`) for no player-visible gain;
- convert the five deployables from feature-flag-gated free verbs (`src/data/featureFlags.js:39-56`)
  into fitted modules, which is what gives them an acquisition arc (§8.1);
- replace the 1:1 verb→system coupling (`input.js:824-836`) with slot-indexed dispatch.

`Digit1`–`Digit3` are soft-reserved for modal prompt answers and `Digit0` is brake, so the available
band is 4–8 plus 9. That is five to six Rigs, which is the right number.

### 7.6 Binding hygiene

**Space is already the Massline key** — `src/systems/input.js:222` (`tether: ['Space','KeyF']`), with a
persisted binding profile `masslineBindingProfile: 'space-v1'` (`src/core/gameState.js:32`) and a
prompt-strip label (`src/ui/controlPrompts.js:4, 53, 62`). Brake is `Digit0` (`input.js:269`).

The confusion is a documentation defect, not a design gap: `GDD_2_0.md` §4.1 still assigns Space to
brake-to-stop and §4.3 still describes the tether on RMB/G with scroll-to-winch, none of which match
live code. Bindings for signature verbs should be corrected in the GDD, recorded here, and left
alone in code.

---

## 8. Loadout as handling model

The three obvious config axes — mass control / damage / movement — are generic because they are
**stats**. The version that is not generic:

**Rigs and weapons have mass, and mounts have positions.** A heavy Rig forward makes the ship slow to
turn and hard-hitting. Ballast aft makes it stable but sluggish. A light hull with a heavy web
launcher gets yanked by its own tether.

Fitting therefore is not picking numbers, it is tuning a physical object, and it feeds directly back
into the game's own distinctive claim. Two players with identical components in different mounts fly
measurably differently.

**What exists.** Every module and weapon already carries `mass` (`src/data/modules.js`,
`src/data/weapons.js:13`), and there is a complete mass → handling → Rapier pipeline:
`Σ module.mass + hull + cargo → totalMass → massRatio` (`src/systems/ships.js:256-261`) driving turn
rate, top speed, drag, bank, and angular acceleration (`:265-286`, `:174-200`), written to the body by
`syncDerivedPhysicsMass` (`src/core/physicsAuthority.js:154-165`). Weapon slots already carry a
`facing` that affects firing arc (`src/data/ships.js:5-9`), which is the precedent for mount position
mattering. Three before/after fitting-feel panels are written and check-covered but imported by no UI
screen: `src/ui/panels/massDelta.js`, `handlingProfile.js`, `moduleRisk.js`.

**What is missing.** Mass is summed to a scalar and the mount is discarded, so position is blind:
`physicsBody.centerOfMass` exists (`physicsAuthority.js:139`) but is never derived from fittings, and
`inertiaY` is a uniform disc (`:128`). And `roleOperationalBiases.opMassBias` (`ships.js:252-260`)
multiplies the mass term per hull, so two ships with identical fitted mass fly differently for
reasons the player cannot see — which makes mass an untrustworthy currency.

**Decision: no hard mass cap.** A refusal state ("this fit is illegal") is a worse feel than a
consequence. Make mass *legible and consequential* instead — wire the three built panels, derive
center of mass from mount position, and retire `opMassBias` so the numbers tell the truth. The budget
is then emergent: overload and you fly badly, visibly, with a before/after readout that says why.

### 8.1 Acquisition — how Rigs are earned

The six shipped instruments are free (§1), which means the game's signature content has no
progression arc at all. The fix should reuse the four grant paths that already exist rather than add
a fifth.

| Tier | Source | Existing mechanism |
|---|---|---|
| **Stock** | Massline ships with every hull. It is the identity verb and is never gated. | already true |
| **Bought** | The workhorse Rigs — Mass Seed, Well, Repulsor — sold at station outfitters for credits, no research required. This should be most of them. | `buyModule` (`src/systems/ships.js:720-742`) |
| **Researched** | Not the instruments, but their *tiers*: radius, wind speed, slot count. The tech DAG already unlocks purchase rights and efficiency modifiers rather than abilities. | `src/data/tech.js` (29 nodes / 4 branches), `applyUnlocks` (`ships.js:696-707`) |
| **Salvaged** | The exotics — Capstan, neutron slug. Finding one is a story, which is the right acquisition for a spectacular toy. | `uniqueWrecks.js:1279` → `grantModule`; `purchasable:false, salvageOnly:true` already exists in module data |
| **Taught** | A career-ladder contract that grants a Rig and then requires using it. | `registerLadderDefinition` FSM (`src/careers/ladders/careerLadders.js:50-66`) — currently rewards credits and reputation only |

Three deliberate choices:

- **No skill tree.** There is no XP or level system, and adding one would create a fourth parallel
  progression authority beside the tech DAG, the hull ladder, and slot capacity. The mass budget is
  the interesting constraint; a skill tree would dilute it.
- **Credits, not research points.** RP has exactly two sources — `recon_scan` and
  `salvage_retrieval` mission completion (`src/systems/missions.js:2866-2872`) — and is already tuned
  tight enough that bounty RP was deliberately removed. Putting Rigs on RP would starve the lane.
  Credits keep the trade and mining loops load-bearing.
- **Teach through the career ladder, not the onboarding array.** Onboarding is a frozen beat list with
  a hardcoded condition switch (`src/systems/onboarding.js:66-98`) and a six-flag literal hint object
  (`src/core/gameState.js:69`); neither is extensible. The ladder FSM is a real registry and is the
  right home for "here is a new instrument, now go use it."

---

## 9. Presentation

### 9.1 3D presentation over 2D simulation

**The models are authored in full 360°, the undersides are drawn every frame, and they are never
seen.** The game is being presented as 2D despite paying for 3D.

**Critical property: presentation may be fully three-dimensional while simulation stays XZ-planar.**
Roll, pitch, and tumble are render-layer transforms driven by sim state. They do not touch
determinism, Rapier, or save. This is one of the only visual upgrades available at effectively zero
systemic cost.

Specific opportunities, all currently missing:

- **Tumble is the visual for Drifting.** A powerless ship rotating on all three axes and drifting
  communicates "disabled — tow me, board me" with no HUD element.
- **Roll on hard turns** reads as mass; haulers lean, scouts snap.
- **Pitch under thrust and deceleration.**
- **Tether tension torques the hull** — an off-center pull rolls the ship, making line tension legible
  without a gauge.
- **Wrecks settle at arbitrary orientations**; nothing dead stays flat on the plane.
- **Explosions displace off-plane** with a return.
- **A slight camera tilt** off pure top-down gives parallax and puts undersides on screen at frame
  edges.

### 9.2 VFX language

Current effects — thrusters, weapons, Massline, impacts — are uniformly mild. The intended direction
is **neon and liquid**, applied to energy and force only.

**The reference is a supernova starburst, not bloom.** "Bloom" as commonly implemented is a gaussian
wash over bright pixels and produces a fogged, cheap result. What is actually wanted:

- **HDR with tonemapping** so bright cores clip to white while colour survives in the falloff. The
  white-hot centre against a saturated halo is what reads as liquid neon.
- **Anisotropic streaks** — additive sprites with directional stretch, not radial blur.
- **A dark rim.** Edge contrast is what sells neon; glow without a dark surround always looks cheap.
- **Ribbons over particles.** Liquid means continuous connected geometry. Masslines are already
  ribbons and should be the brightest object on screen.
- **Screen-space refraction for anything gravitic.** Distortion reads as "liquid" more strongly than
  any colour choice, and it is inexpensive.

**Discipline: keep the world grounded, make only energy neon.** The existing realistic grey hulls are
an asset — they are the dark surround that makes force read. If everything glows, nothing does. Grey
ships plus neon forces makes forces the most important thing on screen, which is correct, because
they are the game.

**Model note:** chunkier silhouettes, less thin greebling. Thin sticks read as noise at top-down
scale and do not catch light well.

**Scope:** this is a VFX and model-language pass over the existing authored assets, which are
retained. The established material direction for hulls and structures stays as it is — it is what
makes the energy layer read.

### 9.2.1 Ruling: shape carries identity, brightness carries energy

There is a live conflict between this section and `design/vfx/FIELD_TOOL_READABILITY_BIBLE.md`, which
mandates that field-tool arcs be "normal-composited, thin, desaturated, **not** additive white lasers"
and requires every effect to survive a grey-read test — identity must remain legible with saturation
removed. It governs precisely the gravity instruments this document expands.

**The ruling: the neon direction wins, and readability moves to a different carrier.**

The bible's underlying worry is correct and must be preserved. If every field tool is a bright
additive blob, the player cannot tell them apart and cannot see gameplay-critical objects through
them. Top-down readability is the game's superpower and nothing may cost it.

But the bible protects readability by making **desaturation** the carrier of identity, which forces
every instrument to be dim. Swap the carrier:

- **Silhouette and motion encode *what a thing is*.** Each instrument gets a distinct geometric
  signature that is identifiable in a single frame with the colour knocked out entirely: the Well is
  concentric rings contracting inward; the Repulsor is the same rings expanding; the Clearing Cone is
  a directional wedge; the Mass Seed is a static pulsing point; the Skim Collector is a sweeping band.
  Motion direction encodes function — inward attracts, outward repels, sweeping collects.
- **Colour, saturation, and additive brightness encode *how much energy is present*.** These are then
  free to be as loud as the moment deserves. A Massline at breaking tension should be the brightest
  object on the screen.

**The grey-read test survives, and gets easier.** Identity must still be legible with saturation
removed — and it will be, because geometry is doing that job. An effect that fails grey-read now fails
because its *shape* is generic, which is a better and more actionable note than "too saturated."

**On occlusion, use judgement, not a rule.** If a lot is happening, effects may briefly obscure a ship,
and that is fine — it is what a big moment looks like. The only thing to avoid is the ridiculous case:
a persistent effect that hides gameplay you need to react to, for long enough that you lose the fight
because you could not see it. `src/render/energy/energyMaterials.js` already does depth-aware soft
intersection and that is usually enough. **Do not write a deterministic occlusion test.** This
document has already been through one cycle of a reasonable worry becoming a hard rule that made
every effect in the game bland; do not start a second one.

**Consequently, from `FIELD_TOOL_READABILITY_BIBLE.md`:** the readability goal, the grey-read test (as
redefined above), and the occlusion discipline are retained. The palette allowlist, the ≤6-draws-per-field
ceiling, the 2px floor, "boundary never blooms," the non-additive mandate, and the ten-step review
ritual are **withdrawn**. They are aesthetic prescriptions with no cited play failure and they
contradict the product north star at `CANONICAL_BUILD_MAP.md:33`, which requires treating ambitious
graphics as part of the feature rather than a luxury to suppress.

### 9.3 State legibility

Mechanical depth and the VFX revamp are **the same work**, not two lanes competing for time. Every
state in §2.2 requires a distinct visual, and the visuals are only worth building because the states
give them meaning.

| State | Visual |
|---|---|
| Drifting | full 3-axis tumble, dark hull, dead thrusters, drifting off-plane |
| Spinning | motion ribbons, weapon fire scattering off-axis |
| Primed | energy crawling across hull panels, rising pitch |
| Pinned | space distorting around it; struggling thrust with no displacement |
| Unmoored | over-reactive to every impact; visibly weightless |
| Hot | bright signature bloom, visible at range, radar emphasis |
| Breached | venting plume, interior light spilling, irregular thrust |
| Snarled | the constraint network drawn as glowing geometry |

---

## 9.5 The economy is the engine that funds the toys

Mining and building are not a side activity. They are **the machine that pays for the physics**, and
the whole Rig progression in §8.1 rests on them. If ore→credits→instrument is a grind, the instrument
lane is a grind, and the game's best content sits behind a wall of held buttons.

### 9.5.1 What mining should feel like

Mining should be the calm half of the game, but calm is not the same as *empty*. The player should be
doing three things at once and enjoying all three: **aiming** (seams reward precision), **pacing**
(heat rewards rhythm), and **hauling** (big chunks reward using the tether). That last one is the
important one, because it is where mining and the Massline become the same activity.

The intended loop, written out fully:

> You scan. Seams light up on a slowly-rotating rock. You burn the seams because off-seam is a waste
> of your time *and* your yield. Heat climbs; you feather the beam in the amber band because the vent
> bonus is real money. The rock cracks along the seams into two or three chunks and an ore burst that
> vacuums into your hold. Two of those chunks are too big for the hold — so you tether one, feel your
> ship get sluggish, and haul it to a refinery for a bulk payout worth more than the loose ore. On
> the way, the mass on your line is a liability: you're slow, you're loud, and pirates like loud.

That paragraph is the design. Every clause of it is either already built, half-built, or was built
and then quietly disabled.

### 9.5.2 Three amputations that must be repaired

These are not missing features. They are **features that exist in the codebase and have been
disconnected**, leaving orphaned cues and dead code paths behind. Repairing them is cheaper than
building anything new and it fixes the loop's core.

**1. The heat/vent rhythm was deleted, but its sound effects still ship.**
`src/systems/mining.js:126-131` unconditionally `delete`s `heat`, `heatRate`, `coolRate`,
`overheated`, and `heatMax` from the beam runtime **every single tick**. Meanwhile
`src/presentation/cueRecipes.js:52-53` still declares `mining.heat.overheated` and `mining.vent.ready`,
and `src/audio/audioSystem.js:417` still ships `sfx_vent_chime` — cues with no emitter, waiting for a
signal that is destroyed sixty times a second.

*What it should be:* heat rises with sustained beam, releasing in the amber band grants a real
extraction bonus, overheat locks the beam. This converts "hold the button" into pulse-timing, which is
the single change that makes mining engaging per-minute rather than merely profitable per-hour. The
cues are already written. The audio is already written. Restore the state.

**2. Bulk tether-haul is arithmetically impossible.**
`BULK_HAUL_MIN_U = 20` (`mining.js:37`) sets the threshold for a chunk being too big for the hold. But
fracture chunks are generated at `parentYield × ratio(0.35–0.5) / count(2–3)`, and the largest
authored `yieldU` in the game is 32 — so the **best possible chunk is about 8 units.** The threshold
can never be met. Consequently `bulkHaulPayoutForChunk`, the refinery dock handler
(`mining.js:851-870`), and the `bulkHaulTag` prompt are all **dead code that has never once run.**

*What it should be:* this is the loop-lock. `GDD_2_0.md` §5.5 calls it "the loop-lock that makes both
features feel inevitable" — mining teaches the tether, the tether feeds mining — and it has never
executed. Either raise fracture yields so 20u chunks occur naturally, or drop the threshold to ~6u.
Prefer raising yields: a chunk you can *see* is too big to swallow is more legible than a threshold.
The payout path is already written.

**3. The mining attention meter has no listener.**
`_updateMiningNoise` (`mining.js:946-954`) accumulates `player.miningNoise` and emits
`danger:miningNoise`. **Nothing anywhere in `src/` subscribes.** The greed-gets-loud pressure valve
that makes quiet mining a choice does not exist.

*What it should be:* wire it to `dangerModel.js`. Loud mining attracts interdiction. This is the
mechanism that stops mining from being a safe-space minigame and connects it to the combat game.

### 9.5.3 Two design corrections

**Seams should cost yield, not just time.** `SEAM_YIELD_OFF = 0.35` is named as a yield fraction and
implemented as a *speed* fraction — the code comment at `mining.js:461-467` confirms total yield is
unchanged. Missing a seam currently costs nothing but patience. That makes aim decorative. Aim should
be a bet: hit the seam and the rock pays; spray it and you get less ore out of the same rock.

**The rich-core payout is negligible.** `richCorePlan.multiplier` is named a multiplier and consumed
as an absolute quantity (`mining.js:831`) — a successful timing minigame pays 3–8 *units*, against a
hold that carries dozens. The tension is real and the reward is a rounding error. Make it a multiplier
as the name promises.

### 9.5.4 The drill is the game's best minigame and nobody can find it

`src/systems/drill.js` is a 28×45 tile bore — a Motherload-style descent with energy management, heat
cooling, hazard tells, scan pulses, and tunnel geometry that persists and heals over roughly thirty
minutes. Deep-core yields are 4× surface. It is genuinely deep, and it is **gated behind having a live
Massline tether on the asteroid** plus proximity (`src/ui/input.js:392-410`).

This is accidentally perfect and should be made deliberate. The tether is the key to the deep game;
the drill is the reward for learning the tether. **Say so.** Teach it in the career ladder, signpost
it on the rock, and let the surface beam be the shallow default that makes the player want the deep
one.

### 9.5.5 What the economy should do that it doesn't

The market sim is real — stock and elasticity, a produce/consume spread, closed-form price impact on
trades, honest single-writer credit discipline. But the price motion a player actually *observes* is
dominated by a wave equation that picks a random regime family and oscillates on a 4–20 minute period
(`src/systems/economyCycles.js:59-70`), and any dent the player puts in a market heals with a
19-minute drift half-life (`economy.js:57`). So the deepest system in the codebase presents to the
player as **shaped noise**.

*What it should be:* the player should be able to point at a price and say why. Three changes, in
order of value:

1. **Let player action leave a mark that outlives the drift.** Clearing a pirate base already ends
   piracy events; that's the right shape. Extend it: destroying a convoy, monopolizing a commodity,
   or completing a claim's relay contract should move an equilibrium, not just a stock level.
2. **Show the cause.** The market news ticker and the price-memory overlay exist. Every significant
   move should be attributable to a visible event, even if the underlying model is statistical.
3. **Turn the cycle generator down.** It is currently at `CYCLE_WEIGHT = 0.5` — half the observed
   price motion is decorative. Halve it again and let supply do more of the talking.

**And fix the lying help screen.** `ORES[].baseValue` in `src/data/mining.js:56-88` duplicates
`COMMODITIES[].basePrice` at *different numbers* — iron is 12 in one table and 28 in the other. The
help screen (`src/ui/help.js:415`) reads the stale table, so the game actively tells new players the
wrong prices. Delete the duplicate and read one source.

### 9.5.6 The throughput problem, stated plainly

Credit **sinks** are abundant: roughly 4.5M in the hull ladder and 7M in the tech tree. Credit
**income** is the constraint — mining runs ~300–450 cr/min gross, and the tier-1→tier-2 hull step is
four to eight hours of play. Pricing Rigs like modules (12k–90k) inserts another thirty to two hundred
minutes of beam-holding per instrument into a loop whose entire interaction is one held button.

So: **do not add the Rig sink before repairing the mining loop.** Order matters here more than
anywhere else in the plan. Repair heat/vent, make bulk haul reachable, make seams pay — then the same
credit price buys an hour of engaging play instead of two hours of holding a button. The sink is fine.
The faucet is the problem.

---

## 9.6 Audio is force feedback

The audio system is much better than the design docs suggest, and it has exactly one hole — but the
hole is directly under the game's central claim.

**What exists** (`src/audio/audioSystem.js`, `src/data/audioRecipes.js`): a fully procedural Web Audio
stack, 158 declarative synth recipes, five sub-buses with per-bus lowpass filters used for bullet-time,
a twelve-voice cap with oldest-voice stealing, a priority arbiter that ducks the engine and weapon beds
when something important happens, and adaptive four-state music with hysteresis. Engine timbre changes
per drive family. **And there is already a real tether-tension hum** — a sine at `90 + strain × 220` Hz
with a second "overload" strand that beats against it above strain 0.72. That is exactly the right
instinct and it should be the model for everything else.

**The hole:** every collision in the game plays the same sound. `audioSystem.js:1256-1259` maps impulse
to *volume only*, at a fixed playback rate, on a single `sfx_explosion_small` recipe. A five-tonne scout
kissing a rock and a six-hundred-tonne freighter broadsiding a station are the same noise at different
loudness. **For a game whose entire pitch is that mass is meaning, mass is currently inaudible.**

*What it should be — the physics-audio contract:*

| Physical quantity | Should drive | Currently drives |
|---|---|---|
| Impact impulse | volume **and pitch** — big things are low | volume only |
| Combined mass at impact | body/weight of the sample — sub content | nothing |
| Material pair (rock/hull/ice/station) | timbre selection | nothing |
| Incidence angle | scrape vs. slam — noise content vs. transient | nothing |
| Tether strain | pitch of the hum | **already correct** |
| **Rate of change** of strain | creak on load, whip on release | nothing |
| Towed mass | base frequency of the hum — heavy loads groan lower | fixed 90 Hz |
| Relative velocity of a passing mass | doppler | flag exists on 2 recipes, no panner node |
| Gravity well proximity | a presence layer, sub-bass pressure | nothing |

Two structural additions carry most of that: **a material-pair impact matrix** (a small table, not new
plumbing — the recipe system already supports it), and **a derivative channel** so the audio layer can
read `Δstrain/Δt` and velocity rather than only instantaneous state.

Two smaller things worth doing: expose five sliders for the five buses that already exist rather than
three, and **sidechain the engine bed to impact magnitude** so a heavy hit punches through the 110 Hz
boost tone instead of being buried under it.

Note also that `MUSIC_STEMS` (`audioRecipes.js:1397-1458`) declares a far richer four-stem spec — bpm,
key, loop bars, drums/brass/choir/strings layers, a boss state — that the runtime does not implement.
Someone designed the music system twice and only built the simpler one.

---

## 9.7 The HUD, and the trackpad

### 9.7.1 The problem is not density, it's that nothing is in charge

There are roughly fifteen independently-anchored surfaces on screen during normal flight, and **there
is no layout system.** Three named anchors are hardcoded CSS strings living inside a JavaScript
template literal (`src/ui/uiRoot.js:1173, :1264, :1298`); everything else is `position: absolute` and
placed by whoever added it. `hudLayout.js` is not a layout engine — it is a Ctrl+drag free-position
persister used by exactly one element.

The symptoms are what you would predict:

- **Heat appears three times** — a HEAT micro-bar, per-weapon heat bars directly beneath it, and the
  WPN cluster stat.
- **Hull and shield appear twice** — a ring and a number saying the same thing.
- **Tether state appears three ways** with no clear primary — a cluster chip, the massline meters, and
  the audio hum.
- **Three separate surfaces stack into the same 118–146px bottom-center band** (cargo panel, mass-seed
  HUD, field HUD) and can physically collide.
- The **radar escapes its own dock** with `position: fixed; z-index: 200` — a workaround, not a layout.
- A fully-built **command bar is hard-disabled** by `const COMMAND_BAR_IN_FLIGHT = false`.
- **The loaded fonts are never used.** `styles/fonts.css` fetches IBM Plex Sans, IBM Plex Mono, and
  Saira Condensed as woff2 — and `--font` resolves to `"Segoe UI", system-ui`. The game pays to
  download three typefaces and renders in the system default.

*What it should be:* one **HUD surface arbiter**, the visual sibling of the message `voiceArbiter` that
already exists. Surfaces declare a slot, a priority, and a relevance predicate; the arbiter decides
what is visible. The game already has the idiom in ad-hoc form (`vtape.dataset.state`, chip
appear-then-fade) — it needs one owner instead of fifteen.

And then the pillar-3 cut becomes possible: **one objective, one action, one threat, permanently
visible; everything else event-gated.** Contacts strip, sector law card, band HUD, and nav readout are
all candidates for reveal-on-relevance rather than always-on.

### 9.7.2 The trackpad is a first-class input and the HUD currently fights it

This is not a polish item. Four separate affordances assume a mouse:

| Hazard | Location | Why it hurts |
|---|---|---|
| Camera zoom is `Math.sign(deltaY) × 8` per wheel event | `src/systems/input.js:502-504` | A two-finger trackpad flick emits dozens of events. No delta normalization, no keyboard alternative. Zoom is uncontrollable. |
| **RMB-hold is a live gameplay verb** (mass-sample / mine) | `input.js:987`, advertised at `hud.js:875` | Sustained right-click-hold is the single worst trackpad gesture. This is the *mining* button. |
| The braking solution is **hover-only** | `hud.js:948-949`, `uiRoot.js:1293` | Shown only on `:hover` and hidden entirely at narrow widths — unreachable without a hover-capable pointer. |
| Ctrl+drag repositions HUD panels | `hudLayout.js:41` | Collides with the macOS trackpad right-click gesture. |

Plus: middle-mouse is captured and stored but never read (dead binding, unreachable on a trackpad
anyway), and two station screens remap vertical wheel deltas to horizontal scroll, which fights a
trackpad's native two-axis input.

*What it should be:* normalize wheel deltas and add a keyboard zoom; move sustained-hold verbs to
toggles or key-holds rather than mouse-button-holds; **never put information behind hover alone**; and
add a trackpad-mode setting that swaps any remaining mouse-shaped affordance. Every new mechanic in
this document must pass a trackpad check before it is considered specified (§0 rule 1).

---

## 9.8 Hand-tuned by feel — protect these

Most of this repository was written by agents. A smaller set of things was **tuned by the owner, by
hand, by playing** — usually after a specific failure they lived with. Those are not arbitrary and an
agent "improving" them is a regression, not a contribution.

The three principles the owner has stated directly:

1. **The ship should spin faster when the thrust is off.** Coasting is when you turn.
2. **The Massline should be extremely hard to break.** It was snapping constantly and that was
   miserable. Ordinary flight, boost, slack catch, a botched slingshot — none of these may break a
   line. Only a deliberate cut, a disabled spool, a despawned endpoint, or an explicitly authored
   extreme-load object.
3. **Speed should be additive.** Long runs with repeated boosts should build real speed and not feel
   bogged down. But an earlier version overdid it — enemies flung around, nothing read as physical,
   and the player couldn't fly either. **The current state is the best it has ever been.** Treat it as
   a working equilibrium, not a starting point.

### 9.8.1 The implementations, so they are recognisable

| Principle | Implementation | Notes |
|---|---|---|
| Spin faster coasting | `COAST_HELM_YAW_MULT = 1.2` at `src/core/flight/propulsionKernel.js:32`, gated at `:686-691` | Applies to yaw *rate*, *accel*, and *brake* together (`:699-706`). Gated on throttle and boost only — **strafe deliberately does not cancel it**, because strafe is RCS. Guarded by `test/flightV3.spec.mjs:134`. |
| Unbreakable line | `tether_standard` at `src/data/combatDefs.js:230-243` | `breakTension: 10500000` — a **ten-times** envelope over the previous tune, `snapImpulseNoise: 0`, `automaticBreakPolicy: 'extreme_load_only'`. The gate at `src/combat/attachments.js:80-90` is **fail-closed**: omitting a policy is never permission. Load-induced breaking is off. |
| | Snap hardening at `src/core/constraints/masslineController.js:125-146` | `harden = clamp(0.18 + sustainedTension·0.55 + sustainedHistory·0.35, 0, 0.85)`, one-directional. The named regression it fixes: "gentle contact with a drifting asteroid snap instantly." |
| | Geometric edge at `combatDefs.js:241` | `maxStretchRatio 1.44`. Over-stretch now causes **reel slip and rest-length rebasing, not a cut** (`src/core/sg02DynamicBodyOwner.js:960-963`). |
| Additive speed | Earned-momentum tags at `src/systems/flightV3.js:63-71` | Sling, dash, and travel burn raise the *effective* cap for ~1s and decay at τ=6s. The tag cannot manufacture speed — it requires `forward > baseCap` first (`propulsionKernel.js:276`). |
| Enemies don't fly apart | `applyMasslineFlightModifiers` is called **only** inside `if (isPlayer)` — `flightV3.js:242-246` | This single guard is what separates the current good state from the regression the owner describes. The comment says it: "NPCs must not get a travel drive from the player's latch." |
| | `NPC_INPUT_SLEW = 2.6` at `flightV3.js:41` | ~0.4s for a full throttle flip. Turns stop-zip-stop twitching into inertial motion. Yaw is deliberately excluded. |
| Boost never brakes | `propulsionKernel.js:296-305` | A measured fix: at 400 WU/s against a 302 cap the old governor commanded −6.24 m/s², so *holding boost made you slower*. The **unboosted** overspeed brake is deliberately untouched. |

A fuller constant-by-constant list — per-drive accelerations, bank response, autopilot gains, winch
rates, the tether socket lever arm (0.50, where ≥0.72 is a known break) — is in
[`PHYSICAL_PLAY_BUILD_PLAN.md`](./PHYSICAL_PLAY_BUILD_PLAN.md) §3.5. **Changing any of them requires
playing the result and saying so, not reasoning about it.**

### 9.8.2 Consequence: snap damage is an *engineered* event, not an ambient one

Earlier drafts of this document proposed snap damage as a routine part of tether combat — lines
breaking under load and hurting what they were attached to. That does not fit the game as tuned.
**Nothing in `src/` emits `physics:attachmentBroken` at all**, and a break currently deals no damage of
its own; all Massline damage is impact-driven (`src/systems/masslineImpactDamage.js:19-25`), and the
player never takes hull damage from any physical impact.

Reconciled design: **a snapping line is a special event you cause on purpose.** It comes from the
bomb-web hub detonating, from a cutting charge, or from an authored extreme-load object — not from
pulling too hard. That is a better mechanic than the original: a rare, loud, engineered break reads as
a decision, where a constant ambient one reads as a malfunction. Snap damage therefore belongs to the
Capstan and bomb-web work (§5), not to the base tether.

---

## 9.9 Missions: why they feel the same, and the one change that fixes it

The owner's description is exact: *"go here, click a thing" / "go here, dock, THEN click a thing" /
"go here, RIGHT click a thing."* That is not a content shortage. It is a structural ceiling, and it has
a precise location.

**A mission can express success in exactly two ways.** `counter >= N` incremented by one of six bus
handlers, or `docked at station X` (`src/systems/missions.js:1453` and `:2587`, whose own comment says
"boolean-at-dest"). `update()` at `:533` evaluates nothing per frame except the deadline — **there is
no continuous predicate hook at all.**

Everything above that collapses onto it. Eleven mission types, five set-piece archetypes, nine career
contract chains, three career ladders, and the POI causal-offer generator all terminate in the same
eleven `type:` strings. Two instances of the same type differ **only in numbers and proper nouns** —
`_titleFor` and `_briefFor` (`:1100`, `:1124`) are switch statements interpolating a quantity and a
destination into a fixed sentence.

**And the game's identity is invisible to its own reward loop.** Missions subscribes to 26 bus events.
Exactly one touches the Massline (`mining:bulkHaulDelivered`), plus one hardcoded story special case.
Meanwhile roughly sixty physics events are emitted and evaluated by nothing:
`tether:strain`, `tether:nearBreak`, `tether:releaseRated`, `tether:whipImpact`, `massline:throw`,
`massSeed:locked`, `fields:deployed`, `combat:collisionConsequence`, `cargo:massSettled`,
`cargo:fragileLost`, `cloak:engaged`, `heat:changed`, `asteroid:chunked`, `mining:richCoreCompleted`,
`drill:break`, `law:custodyTransfer`, and more.

So the optimal play for any contract is "fly there and do the generic verb." **The missions do not
know the game is about mass and tethers.**

### 9.9.1 The fix: a data-authorable condition language

Give a mission a `conditions: [{event, predicate, count}]` array, evaluated by one generic observer
subscribing to events that are already emitted, plus a per-tick predicate slot in `update()`.

Two systems in this repository already do exactly this and neither is reachable from the mission board:

- **`src/systems/encounterScripts.js`** has real physical predicates — pay a toll by braking within
  520wu below 8wu/s for three held ticks (`:38-40`, `:291-297`), run a scan by breaking 700wu for two
  seconds (`:42-43`), convoy arrival by centroid radius (`:46`), claim forfeit by leaving 2400wu for
  twelve seconds (`:51-52`). Seventeen scripts of this quality, used only as director-spawned ambience.
- **`src/systems/onboarding.js:615-680`** already evaluates `tether:released` gated on a prior reel,
  ore-collected counts, and burst-heat peaks as beat completion conditions. The condition language
  exists; it lives in the tutorial.

Generalise `attachClauses` (`src/systems/contractClauses.js:42`), which today allows five clauses on
three events under a deliberate safety allowlist, into N conditions over the events that exist.

**What that buys immediately**, with no new mission types:

> *Deliver 20 units by tether without exceeding 40 wu/s.*
> *Recover the core without letting the line go slack.*
> *Clear the field without firing a shot — use mass.*
> *Get the cargo there with the fragile crate intact.*
> *Break the blockade while running dark.*
> *Tow it home before the drift takes it out of the sector.*

Same eleven verbs. Completely different missions. **Risk tier stops being a payout multiplier and
becomes a verb modifier.** That is the whole fix, and it is one array plus one observer.

---

## 9.10 Factions, law, and the world as one system

The owner's intent: *"the factions and law and other gameplay elements should all complement each
other, they're all part of the same system."* They currently do not, and the reason is unusual —
**the systems are built, they simply do not read each other.**

### 9.10.1 What is already real

There is a genuine offscreen war. Fourteen factions each carry rep, tier, aggro, and computed `power`
derived from owned sectors, live haulers, stations, and aggression (`src/systems/factions.js:398-443`).
Conflicts accrue `tension` and `momentum`, and at ±100 **the contested sector changes owner**
(`factions.js:356-391`). `sectorSim` injects NPC-versus-NPC tension with no player involvement
(`src/systems/sectorSim.js:410-428`). Territory flips happen whether or not you are watching.

Three things permanently change the world and never decay: sector ownership, the custody
repeat-offender ledger, and moral debts.

### 9.10.2 The problem: reputation is a write-only sink

Eight systems emit `faction:repDelta` into the faction layer. **Nothing meaningful reads standing back
out.** The entire exported read API — `priceMod()`, `dockAccess()`, `missionAvailable()`,
`bribeCost()`, `getStanding()`, `getTier()`, `isAggro()` (`factions.js:493-546`) — has **zero
importers.** The consumers that need this data re-read `state.factions` raw and duplicate the formulas
(`missions.js:3827`, `src/ui/dockDenyBanner.js:70`, `src/ui/missionPreflight.js:87`).

**Law and reputation are entirely disjoint.** `src/systems/lawSecurity.js` emits no `faction:repDelta`
at all — you can destroy a patrol inside a station's protection volume and lose zero standing with the
faction that owns the station.

**The encounter director never reads politics.** It reads danger, cargo value, and WANTED heat; it
never touches `state.factions` or `state.conflicts` (zero matches). The war is invisible from the
cockpit, and `faction.power` and conflict tension are computed daily and displayed nowhere in the UI.

### 9.10.3 The three connections worth building, in order

1. **Law incidents move reputation.** One emit at `lawSecurity.js:284` turns every crime into a
   standing consequence and closes the single largest hole in the design.
2. **Wire the read API into economy and docking.** `priceMod()` and `dockAccess()` are written and
   tuned; they need callers. This is what makes reputation *felt* rather than displayed — a faction
   that likes you sells cheaper, one that doesn't turns you away at the ring.
3. **Feed conflicts and sector ownership into the encounter director.** A sector at war should press
   harder and spawn the belligerents. This is what makes the director deserve the name in its header.

Also cheap and worth doing: give `knownContrabandStrikes` a forgiveness path — it is currently a
permanent ratchet with no decay, which is the one place the design is stricter than anyone intended.

---

## 9.11 Story: stop writing chapters, start authoring evidence

There are **137,000 words** of worldbuilding canon across 131 files. The spine that actually runs is
eight beats, and all five endings are implemented and reachable. But roughly fifty of sixty-nine
entity sheets have no runtime referent at all — every crew member, every rival, most gangs — and the
canon's own `LITERARY-AUDIT.md` concludes the bible contains "two writers," one who shows and one who
explains, and recommends cutting about 40% as self-commentary.

The mismatch is not quality. It is **container**. Prose chapters are the wrong unit for a game where
the verbs are tether, tow, cut, and salvage.

### 9.11.1 The two loops that already tell stories, and they are the good ones

**Unique wrecks.** Twelve authored wrecks (`src/data/uniqueWrecks.js:103-397`), each with a provenance
record, a hazard context, a salvage-law position, and a **two-way moral choice** with distinct claim
and handover consequences. The contract in the file header is exactly right: *rumor → bearing → scan →
salvage*. It runs today — the bar delivers rumors, the system owns the phase machine, the bearing ring
appears. **There are only twelve.**

**Aces that remember you.** `src/systems/aceMemory.js` records named-pilot outcomes and emits
transitions; `src/systems/moralMemory.js:42` mints a durable debt with a seeded `ally | vengeful`
disposition; `src/systems/e1EncounterRuntime.js:393-419` later pulls that debt, reveals it, and emits
`moralMemory:vengefulReturn`. **A pilot you let live comes back — sometimes for you, sometimes against
you.** That is character generated entirely by physical outcomes with zero authored prose, and it is
the best narrative loop in the codebase.

### 9.11.2 The direction

**Author wrecks, debts, and places that remember.** Concretely:

- **Promote your own battles into history.** `src/systems/aftermathWrecks.js` already durably marks
  where fights happened, and `uniqueWrecks.js:9` notes a `promoteToAuthored(lossLike)` adapter. Let a
  battle you fought become a wreck someone later hears a rumor about.
- **Make the codex written by play, not gated by beat index.** Today it is a static book with a
  progress lock — nothing the player *does* writes an entry. Moral debts, ace transitions, and salvage
  provenance should all write into it.
- **Gate canon characters on salvage history rather than beat number.** The pattern exists: Dustwife
  Senna is already gated on `minUniqueWrecks: 3` (`src/story/campaign47a/embodiedDialogue.js:38-53`).
  That is how a character should arrive — because of what you have done, not where you are in a list.
- **Let the radio report what you actually did.** The Band already reacts to events via `eventKey`
  (`src/data/flavor/040-band.js:32-36` — *"Tessera broke the blockade. Concord reports the lane
  reopened itself"*). Run wreck and moral-debt events through it.

Twelve wrecks is the content unit that works. Write forty more before writing another chapter.

**Note the stranded library:** `src/story/campaign47a/embodiedMissions.js` (450 lines) and its beat
model self-declare as an unregistered sidecar with no runtime consumer. Audit it for reusable material
before authoring anything new — some of the work may already be done.

---

## 10. Approaches evaluated and set aside

Each entry states the mechanical reason it was set aside and what to do instead. Append when an
approach is set aside; do not remove entries.

| Approach | Why it was set aside | Do this instead |
|---|---|---|
| **Object-to-object tether** — tie two external bodies to each other (queue row PQ-031, "Twin Bridle") | Requires the player to select two separate targets and a relationship between them. Under Helm Assist the cursor is already steering the nose, so there is no spare cursor input during flight for a second selection. The idea describes well and has no workable input model. | The Snarl and Capstan webs (§5) produce the same fantasy — many bodies coupled together — from one keypress and no second selection. |
| **A dedicated brake-to-stop key on Space** — specified in `GDD_2_0.md` §4.1 with feel targets, and repeated as an open checklist item in `design/revamp/BP-07_FLIGHT_TRAVERSAL.md:12, :29` | Releasing thrust already decelerates the ship, and S/Down is reverse-plus-brake, so a dedicated brake key duplicates what the absence of input does. The design was never implemented as written: Space is the Massline (`src/systems/input.js:222`) and brake is `Digit0` (`:269`). | Correct `GDD_2_0.md` §4.1 and `BP-07` to match live code. No code change is required — the docs are stale, not the game. |
| **Splitting the Massline across two keys** — one mass-gated for heavy anchors, one cursor-gated for light grabs | One tool with different rules per key is hard to hold in mind while flying, and there is no clean situation in which only one of the two behaviors is wanted. It also leaves the underlying problem in place: the selection stays invisible until the key is pressed. | The continuous candidate highlight in §7.1. |
| **Choosing an off-centre attach point** on a body so the line produces an arc rather than a radial stop | Detecting the correct release moment becomes an expensive and fragile physics problem, and the resulting motion is not distinguishable to the player from the simpler treatment. | Retain the physical center constraint and the bounded load-scaled release flourish (§7.4); neither may take over ordinary flight. |
| **Tether-based traversal** — firing a line ahead to swing past obstacles and cover distance | A line fired ahead of the velocity vector goes taut radially and arrests the ship instead of swinging it. A real swing requires attaching roughly perpendicular to velocity, which the player cannot reliably arrange at speed. Even when it lands it is unlikely to beat boost-and-dash for covering ground. | Spin-then-release-boost (§7.4), which exists and delivers the payoff without depending on the traversal claim. |
| **Screen-wide bloom** as the neon treatment | A gaussian wash over bright pixels raises the black level across the whole frame and flattens contrast, which reads as fog rather than as energy. | The HDR core, saturated falloff, dark rim, and anisotropic streak treatment described in §9.2. |

---

## 11. Known defects, unsolved problems, and open questions

Live problems identified during design and not yet mapped to packets:

- **Auto-target fails in exactly the situation the Massline creates.** Three independent causes, all
  firing at once when the player orbits a tethered enemy: (a) the weapon target
  (`state.player.targetId`, set at `src/ui/uiRoot.js:1118`) and the tether target
  (`state.player.tether.targetId`) are unreconciled variables; (b) the constrained fire solution
  requires a taut line (`src/systems/weapons.js:399`) but a tight orbit is *inside* rest length and
  therefore slack (`src/systems/tetherGameplay.js:582-591`), so the circular-motion solver in
  `src/combat/tetherFireControl.js` — written for precisely this case — is bypassed and a linear lead
  is used against a body on an arc; (c) one lead solution is computed from the *first* weapon's
  projectile speed and applied to the whole battery (`src/combat/autoTargetMode.js:57-63`). Also
  `pickMasslineAutoTarget` (formerly `autoTargetMode.js:265-304`) **was deleted** on 2026-07-27 —
  it was exported, massline-aware and never called by anything but its own check script. Scored
  latch acquisition (`src/combat/masslineTargetScoring.js` driven through
  `tetherGameplay._refreshAcquisitionPreview` / `_consumeAcquisitionReceipt`) is now the live
  acquisition path; there is no second massline-aware picker to reconcile it with. Do not
  reintroduce one. `scripts/check-massline-auto-target.mjs` was rewritten against the surviving
  behaviour and records the removal in its header.
- **Spinning exists twice.** `src/systems/tumbleStates.js:141-143` writes an ad-hoc
  `entity.data.tumble` *and* schedules `status_tumbling` (`combatDefs.js:118-126`), with a manual
  resync hack at `tumbleStates.js:177-181` and three external readers of the ad-hoc form. Pick one
  and delete the other before adding any state, or the state layer becomes a third representation.
- **NPC states do not survive save.** `src/combat/persistence.js:39-50, :56-57` only builds entity
  refs for the player and `flags.persistent` entities, so ordinary NPC statuses are dropped. The §2.2
  constraint "states must survive save/Continue" is currently false.
- **Statuses are invisible to the determinism gate.** `src/core/simSnapshot.js:47-49` collapses all of
  `state.combat` to a beam count, so the existing status service ships unprotected by the only
  replay-hash gate the project has.
- **AI cannot see statuses.** The sensor frame exposes `disabled`/`tethered`/`tags`
  (`src/systems/aiPorts.js:625, :718`) but not the status map, so a new state can be authored without
  any AI reacting to it.
- **Enemy doctrine flees the thing the player just built.** `src/ai/combatDoctrine.js:406` scores
  tethered contacts at `-100` and `:235` triggers egress when a target becomes tethered. Under swarm
  or web framing this scatters the swarm away from the cluster.
- **No close-range action class.** Reeling to contact should open a window for charge, drain, spike.
  Note `surrenderRecovery.js` already implements a leashed tow-to-custody capture, so the slow end of
  this spectrum exists.
- **Masslines do not wrap** — they rotate freely at the attachment. Correct for normal use; the
  Capstan needs the faked length model in §5 rather than a change to this behavior. The attachment
  schema is also 1:1 today (`combatDefs.js:259-263` `maxAttachments: 1`; `state.player.tether` is a
  single record), so a Snarl hub has no representation yet.
- **Defense is unsolved.** See §6.
- **HUD density.** The first-minute frame carries roughly a dozen competing surfaces against
  `GDD_2_0.md` pillar 3 ("one objective, one action, one threat").
- **Empty backgrounds are authored, not broken.** `src/render/spaceBackground.js` gates nebula, wisp,
  and hero-star layers on sector rarity (`:464-467, :1600-1605`), and
  `test/post-processing-restraint.test.mjs:26-32` actively forbids re-adding fake galactic detail.
  Enriching a sector means changing its composition data, not the renderer. `starfield.js`,
  `parallaxLayers.js`, and `spaceReflectionEnvironment.js` are superseded and should not be revived.

Open questions to resolve before or during admission:

1. Which chain is built first — damage-facing (prime → snap → breach) or world-facing (material
   interactions)? The first one built sets the tone.
2. Does the state layer survive contact with play, or does it read as imposed abstraction?
3. How many states can be simultaneously legible on one screen under swarm framing before the frame
   becomes noise?
4. Does capture/remote-pilot stay bounded, or does it collapse the moment-to-moment game?
5. Is Space the Rig key, and what happens to the current binding?

---

## 12. Folding this into the program

This document is design intent. It becomes work through the normal path in
`CANONICAL_BUILD_MAP.md` §5 and `program/06_RETAINED_FUTURE_BACKLOG.md` §"Admitting an item".

Suggested shape, smallest-first:

| Order | Slice | Notes |
|---|---|---|
| 1 | **State layer keystone** — the §2.2 states, their sim representation, save continuity, and their §9.3 visuals | Doubles as the VFX revamp; everything downstream keys off it |
| 2 | **One chain end to end** — prime → tether → snap → breach → board | The cheap test of whether the grammar is real |
| 3 | **3D presentation pass** — roll/pitch/tumble driven by sim state | Zero simulation cost; largest visual gain per hour |
| 4 | **Swarm rebalance** | Mostly tuning; makes the physical verbs make sense |
| 5 | Tractor (§7.3), gravity well, Snarl/Capstan (§5), cloak/heat (§6) | Each cheap once states exist |
| 6 | Rig slots + mass-distribution loadout (§8), loot magnet (§4), structures/bounce (§5) | Structure and reward |

**Existing rows this touches.** Most of §9 falls inside **PQ-023** (unified propulsion, weapon VFX,
HUD, camera, accessibility language), which is already an umbrella with one leaf integrated — so the
presentation work is largely a re-brief rather than new scope. The instrument proposals in §1 overlap
the deferred **PQ-026** (mass-coupling tactics), **PQ-029/PQ-030** (Massline heads), and **PQ-031**
(Twin Bridle, now rejected per §10).

**Recommended queue maintenance:**
- Retire **PQ-031** to a rejected disposition citing §10, so the rejection is inherited instead of
  the idea.
- Correct **`GDD_2_0.md` §4.1** (brake-to-stop) and audit that document specifically for other
  mechanics that were invented rather than derived from code. It sits at the top of the authority
  order, so anything invented there propagates to every agent indefinitely.
- Add a pointer to this file from `design/PLAN_REGISTRY.md`.
