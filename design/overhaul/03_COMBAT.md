# 03 — Combat: the atom both doors share

**Director, 2026-11-18.** The fight is the game (`01_THE_GAME.md` §3). This page turns the owner's
description into rules an agent can build and a reviewer can check. Read `design/FEEL_CONTRACT.md`
first: its bars B1–B13 stand except where §5 and §6 below amend B6 and B9.

## 1. The density contract — every item on this page carries it

The owner's test of every idea: *what happens when fifty of these happen at once?* So every work item
below states four things, and a packet built from it must repeat them:

1. **At ×50** — what the screen, the camera, the sound and the frame time do with fifty bodies doing it.
2. **Guardrail** — the existing rule it touches and *why that rule exists* (usually a past regression).
3. **Tests that move** — which pinned tests or goldens change, rewritten with the owner's sentence in
   the assertion message (FEEL_CONTRACT D2); goldens re-recorded only through `docs/COMMON_BUGS.md`
   §8/§10d with the causal diff written down. Never re-pinned to pass.
4. **Done when** — an on-screen result at the gameplay camera **and** a number from a seeded scenario.

---

## 2. The rope: mass decides who moves (ruling R12)

### 2.1 What the player experiences

| Target vs your hull | Tag on the aim reticle | What happens |
|---|---|---|
| ≥ 3× your mass, or immovable (station, monolith, capital wreck) | **ANCHOR** | The line goes taut and *you* swing. Thrust becomes orbit. Reel in and you zip toward it. Let go and you are flung. |
| ≤ ⅓ of your mass | **TOW** | It swings around you. Drag it, whip it, throw it. |
| Between | **TUG** | Both move. Whoever thrusts harder wins; a boost wins the tug. |

The words replace **TOO HEAVY**, which is deleted from the game. The ratio thresholds are starting
values; tune by play.

**The mosquito** (Hitch 18 t on a Bruiser or an 80 t boulder): the player holds the cursor on the
anchor and fires while the rope carries them round it. **The crane** (Atlas 200 t on a 16 t Wasp): the
Wasp trails behind and the player drags it through the rocks.

### 2.2 Rules

- **Latching is never refused for mass.** Delete `entityOverLineClass` as a refusal and the overclass
  strain in `src/systems/lineProgression.js` (`update()`: the 0.62 reel / 0.55 turn factors, winch
  heat, the timed snap). Keep tonnage logging and class-ups.
- **Line Class becomes the rope's budget** — the three numbers in `DEFAULT_MASSLINE_DEF`
  (`src/core/constraints/masslineController.js`) scale with class: `maxTension`, `maxYank` and reel
  power under load, plus reach. Class I is the current tuning. Starting curve: ×1.0, 1.35, 1.8, 2.4,
  3.2, 4.3, 5.8, 8.0 for classes I–VIII.
- **Overload pays out, it does not snap.** When tension exceeds the budget the winch slips: rest
  length grows until tension fits. Only a *catastrophic* yank (above `catastrophicRatio` × budget)
  breaks the line, and it announces itself for 0.6 s first: the cable frays visibly, the creak splits
  into two notes (doc 18 §1), the strain gauge goes red.
- **Reeling on an ANCHOR pulls you**, at the class's reel power. This is the zip-line.
- **Guns while latched.** In the latched state the assisted-turn bound (`assistedTurnBound`,
  `src/core/flight/propulsionKernel.js`) must not drag the nose off the cursor: an orbiting pilot aims
  inward while moving tangentially. Release the bound while latched to an ANCHOR.
- **Class-ups still mean "you can throw something bigger"** (doc 17 sentence kept): a bigger budget is
  what lets a heavy body be *slung* fast without the line paying out.

### 2.3 Density, guardrails, tests

- **At ×50:** one rope per player (two with Second Reel / twin bridle). No per-body cost change.
  Tags show for the body under the cursor only.
- **Guardrail:** the "one weight rule" (2026-11-16) existed so the tag and the snap could never
  disagree — a body the tag allowed must never snap. Polarity keeps that promise more strongly: there
  is no mass snap at all.
- **Tests that move:** the weight-rule tests added with `entityOverLineClass` (2026-11-16) and any
  test asserting a snap for overclass mass. The throw-rate fixture (`throw-rate.mjs`, ≥ 95 % click →
  throw, FINISH-LINE) and SWING-01 (thrown 2.1 kills of 5) must not move.
- **Done when:** (a) on screen: Hitch latched to a Swarm boulder orbits it while firing inward, the
  word ANCHOR on the reticle; Atlas drags a Wasp through a rock. (b) Seeded: Hitch on an 80 t anchor
  at cruise for 3 s — orbit radius within ±15 % of rope length, ≥ 80 % of shots aimed at the anchor
  hit it; Atlas towing a Wasp — the Wasp's displacement ≥ 6× the Atlas's.
- **Must not return:** any refusal or timed snap by mass; the text TOO HEAVY.

### 2.4 Heads — one list, built for real

Two head lists exist and neither is the design: `LINE_HEADS` in `src/data/lineProgression.js` (ten
behaviours, **no physics consumer for any of them**) and module heads via `masslineHeadId` (`tractor`,
`monofilament_sweep`, `twin_bridle`, `elastic_whip`) read by `src/combat/attachments.js`. Merge into
doc 11 §4's six, mapped onto what works:

| Head | Does | Built from | Order |
|---|---|---|---|
| **Hook** | the standard latch | today's line | — |
| **Coupler** | latch A, then B: A and B are tied to each other and your line lets go. Bolas, a raider tied to a rock, two heavies nose to nose | new: a Rapier rope joint between two non-player bodies, through the attachments owner | **first** — it is the clip machine |
| **Breaker** | a slammed rock splits into throwable chunks | the existing fracture seams | second |
| **Harpoon** | passes through a light body and latches the one behind | new | third |
| **Chain** | short, unbreakable; for dragging the enormous (the Tank's head) | `twin_bridle`/load mult tuning | fourth |
| **Reel** | winds fast, never swings (the Saucer's head) | `tractor` | fifth |

The other `LINE_HEADS` rows (Weld, Hush, Override, Bell, Spore, Index, Evidence Clamp) become **story
heads** — rare finds with one rule each, built only after the six. Until a head has a consumer it is
not offered anywhere.

- **At ×50:** Coupler cap of three live ties per player; each tie ends after 20 s or when cut.
- **Done when:** a stranger shown a ten-second clip of each head names what it does.

---

## 3. Guns: damage against kick (ruling R5)

### 3.1 The curve

Every gun is one point on a curve. Kick here means momentum delivered per second of fire.

| Family | Damage | Kick | The owner's words | Starting target vs a Wasp (16 t) at mid range |
|---|---|---|---|---|
| **Hose** | highest | ~none | "the minigun… soak them with constant damage but not knock them back visibly at all" | kills in ≤ 1.0 s of fire; moves it ≤ 0.1 screen depth |
| **Pew** | medium | small | "a pistol type weapon… they do damage" | kills in 1.5–2.0 s; walks it back ~0.3 depth per second |
| **Burn** | medium, over time | none — it melts | — | kills in ~1.5 s; hull glows and sags; a melted body is sticky ammo |
| **Needle** | high per shot | through-and-pin | — | one shot kills it and passes through two more |
| **Thump** | low | very high | "the cannon gun that wallops them… they become a weapon themselves" | by bullet alone ≥ 3 s; one hit sends it ≥ 1 depth in 2 s (FEEL_CONTRACT B5); into anything solid, it dies |
| **Boom** | medium, area | high, radial | — | scatters a pack |
| **Trick** | none or little | special | the "gravity blast… doesn't do any damage but sends them tumbling" | see §10 the Tumbler |

Heavies shrug at Hose and Pew and fear thrown bodies, Thump and hazards (doc 11 rule, kept).

### 3.2 Rules

- **The starter is a competent pistol.** Pulse Laser S stops being deliberately weak: damage up to
  the Pew target, and the forced all-weapon vent goes. Heat becomes rhythm: let go of the trigger while
  the heat bar is in its amber band and the gun cools at once (**feathering**); hold through red and it
  locks out for 1.2 s. Overheat is a mistake you made, not a timer the game imposed.
- **Rocks take kick.** Thump, Needle and Boom carry `environmentImpulsePerHit` so a loose rock becomes
  a cue ball. With a Kick gun equipped, the rock under the cursor shows a thin chalk line of where one
  hit will send it (1.5 s horizon, the one rock only). This is the "free to blast at asteroids to knock
  them into enemies" sentence made aimable.
- **A kill by collision still pays more** (doc 17 §3 stays). The gun path is viable; the room path is
  louder and richer.
- **Recoil is on the ship, never the camera:** Thump and Needle nudge the hull back a few pixels in
  presentation; Hose has none.

### 3.3 Density, guardrails, tests

- **At ×50:** a Hose stream is the most-drawn thing on screen. Tracers are instanced gold threads with
  one light per *stream* (at the muzzle), never one per bullet; hits produce target-local flashes (§6),
  not camera events or floating numbers.
- **Guardrail:** row 482 nerfed guns because standing off and grinding beat throwing. The answer now
  is the Pilot Tree: a Gunner build that wins by grinding is a *chosen* build, and it is slower and
  pays less Scrap than a Rigger's room kills. Measure both (done-when).
- **Tests that move:** `test/zc-a34-guns-nudge.test.mjs` (pins dmg 5) — rewrite with R5's sentence;
  FEEL_CONTRACT B4 ("starter ≥ 5 % of light cruise per hit") stays for Pew and **exempts Hose**, whose
  kick is zero by design.
- **Done when:** the family table above is met in a seeded trace (`node scripts/agent-loop.mjs sim
  <scenario> --trace`, doc 11 "Kick is measured"); a Gunner-only bot and a Rigger-only bot both clear
  Swarm round 10 on Fair, the Rigger faster and richer.

---

## 4. The five powers: force you can see (rebuild)

Seen at 301d3fb074 (`02` B5, B6): Pull is a white smear, Shove is a ring of flat orange crescents. The
owner: "the VFX makes them feel shitty, it's really cheap". The keys and verbs stay (1–5, merged
2026-10-22). Each power is rebuilt as **force + light + matter**: a shape that shows the force, a real
light that lands on what the force touches, and physical matter that moves because of it. Switch the
effects off and the bodies still go exactly where the picture said.

| Power | The force (physics) | The look (rebuild to this) |
|---|---|---|
| **1 Pull** | A well at the cursor that yanks for 1.2 s (README ruling 5). | A refracting lens at the well — the scene behind bends (screen-space distortion from the colour buffer, the technique AAA games use for singularities); a hot white point light at the core that **lights the hulls being dragged in**; debris and hulls streaking inward. Never a white sprite. |
| **2 Shove** | A forward punch: everything in the cone gets the kick. | A thin refracting pressure front racing outward; dust and sparks **shed from the surfaces it passes over**, aligned outward; every hit body visibly accelerates with a velocity streak; a light pulse at the emitter that lights your own bow. Never crescent sprites. |
| **3 Pin** | A bolt that reaches the cursor in ≤ 0.5 s and nails the body to space. | A spike that lands with a flash, a taut glowing cable from the body to a point in space; the pinned ship's own thrusters flare as it fights the pin. |
| **4 Bomb** | A sticky charge; detonates on Shove or on a second press. | A blinking lamp on the charge that **lights the hull it is stuck to**; detonation is a flash that lights the whole room for 0.25 s, a shock ring, kicked debris. |
| **5 Rig** (the plough) | A wedge field at the bow captures loose bodies; inside it their sideways motion is damped so the pack holds together and moves with you; press again to launch them all forward, energised (§5). | Tight electric arcs from emitter prongs on the bow to **every captured rock**, grinding sparks where captured rocks touch, a crisp refracting edge along the front of the wedge, a hot rim on each captured body. On launch: a bang and every rock's trail. |

**The plough is the owner's favourite sentence** — "bull doze with this cone straight through it and
now you're flying at the enemies… with 25 big-ass asteroids barreling towards them." So:

- **Capacity 25 bodies** on desktop presets (12 on phones). Rocks over the class budget are pushed, not
  captured.
- **No pinball inside the pocket:** rock-against-rock contacts inside the wedge are softened to
  separation only; a captured rock never strikes the player.
- **Launch:** every captured body leaves at the ship's speed plus a launch impulse, all energised for
  3 s. Impact on a carrier or a pack is the hero beat (§6.3).
- **Done when:** in a seeded field of 40 rocks, one plough pass captures ≥ 20, holds them ≥ 4 s while
  turning 90°, and on launch ≥ 15 travel ≥ 3 screen depths; on screen it reads as a wall of rock.

**Gyre** folds into **Pull: Leash** (doc 11 bend: "the well follows your ship — you tow a ball of
enemies like a flail"). **Cloak** becomes a Ghost-branch ability (§11). Neither keeps a dead slot on
the bar. Aimed powers act on **press** by default (the hold-to-preview of row 493 stays for players who
hold).

- **At ×50:** one light per active power (not per affected body); arcs and sparks are pooled and
  instanced; the plough's light is one strip along the wedge.
- **Guardrail:** VFX-02 (2026-11-17) capped smoke opacity over the player and champions; keep that cap
  for every power effect. LOOK-04's bloom budget applies.
- **Done when:** a stranger shown a muted five-second clip of each power names it; with effects off,
  the bodies' paths are identical (seeded comparison).

---

## 5. The calm world (ruling R11)

The owner: NPCs "constantly crashing into each other and triggering chain reactions of pinball
crashing and everything's exploding." Physics stays honest (FEEL_CONTRACT B6: a light hull that meets
rock at half cruise is badly hurt). The world is calm because its actors are competent:

1. **Loose rocks rest.** Field rocks spawn with zero linear velocity (spin is presentation) and sleep
   until touched. Nothing drifts into anything on its own.
2. **Spawns are clear.** Every spawner checks a clearance radius (2× body radius + 40 WU) and a 2 s
   predicted path; it retries elsewhere rather than spawning onto a body or a collision course. Swarm
   arrivals come through visible gates (doc 12), never inside the player's view.
3. **Pilots fly competently.** NPC steering uses time-to-collision against large bodies and each
   other and brakes when TTC < 1.5 s. Bench: 40 NPCs crossing a rock field and traffic at cruise for
   10 simulated minutes — **≤ 1 unintended hard contact (ΔV ≥ 18 WU/s) per NPC per 10 minutes.**
4. **One safety net.** A body is *energised* for 3 s after the player or a hazard moves it (gun kick,
   throw, Shove, Pull, plough, ram, freight, crusher, furnace), and anything an energised body strikes
   is energised in turn (one hop). A contact where **neither** body is energised cannot kill, cannot
   tumble, cannot open a law incident, and takes at most 15 % of hull. A non-energised death's blast
   displaces neighbours but cannot kill them.

- **At ×50:** this is the item that makes ×50 survivable. Measure it there.
- **Guardrail:** B6 was made provenance-blind because a hull that met rock at speed used to survive if
  no rope put it there — the A5/A6 "terrain is a scratch" defect. Energy is not provenance: a body the
  player shoved into rock is energised, so the slam is still lethal.
- **Tests that move:** none of B6's; add `test/ambient-calm-census.test.mjs`.
- **Done when (the census):** 10 minutes of idle Adventure in Helios plus three passive Swarm rounds —
  **zero kills and zero law incidents that no player or hazard caused**; SWING-01 and the throw-rate
  fixture unchanged.

## 6. Feeling the hit without shaking the screen (ruling R10)

### 6.1 On the body that was hit

- A two-frame emissive flash on the struck mesh (a per-instance uniform, not a new material).
- A spark spray from the hit point, directed along the reflection of the shot.
- A shield shell that ripples at the impact point (fresnel shell, hit-point ripple) when shields hold.
- **Damage that stays:** scorch and dent decals at hit points for the hull's lifetime; damage states at
  60 / 30 / 10 % — a smoke trail, then sparks and a flickering engine, then fire and a stuttering drive.
- **Death:** the hull breaks into two to four authored chunks that keep their momentum and come to rest
  as wreckage you can throw; a flash that lights its neighbours; debris.

### 6.2 On the player

- Your hull hit hard (≥ 8 % in one blow): a small camera kick *toward* the hit side and a red edge
  pulse on that side of the screen.
- Boost: the camera opens with speed (exists, FEEL_CONTRACT §C).

### 6.3 Hero beats — the only other things that move the camera

A throw kill on a heavy; a perfect release; a plough launch that kills ≥ 5; a boss phase break. One at a
time, through `src/render/shakeAdmission.js`. These also get the only **hitstop**: 40–60 ms,
presentation-only (render time scale; the simulation never pauses, so replays stay deterministic), at
most once per 0.8 s.

- **No floating damage numbers.** Damage is read on the hull.
- **At ×50:** fifty hits per second produce fifty local flashes and zero camera events.
- **Tests that move:** FEEL_CONTRACT B9 is rewritten to §6.2–§6.3; the test enforcing "every collision
  ΔV ≥ 8 produces camera trauma" changes to "only player-hull and hero-beat events reach the camera".
- **Done when:** a three-minute Swarm round 10 recording has camera motion only at player hits and
  hero beats (count from the camera trace), and a muted clip still reads every hit.

## 7. Ships that tumble like they were hit

When a body loses its helm (FEEL_CONTRACT B11 hitstun law), its *mesh* tumbles in three dimensions —
pitch and roll about its velocity — while the simulation stays planar. The engine plume sputters, a
smoke-and-spark corkscrew trails it, its running lights flicker, and it recovers with a visible burn when
the hitstun ends. This is the owner's "tumbling like a TIE fighter end over end". It is presentation on
the mesh transform: cheap at ×50.

## 8. Flight feel — measure before touching

FEEL_CONTRACT B1–B3 and B13 are met; do not retune flight blind. Two measurements are owed:

- **More keys never make you slower.** Holding W while turning must turn at least as fast as turning
  alone (`assistedTurnBound` is the suspect). Seeded: 180° heading change at cruise, W held vs not.
- **The mosquito orbit test** from §2.3.

## 9. Enemies built to be abused

The roster (doc 12, fifteen kinds plus bosses) already contains the abuse cases — the dart you send back,
the dome you pull its owner out of, the raider that latches you. The work is behavioural:

| Tier | Members | Dodges thrown bodies? | Packs | Notes |
|---|---|---|---|---|
| Fodder | Wasp, Detonator Dart | **never** | bunch tight (separation ~60 WU, not 118) | They exist to be thrown and bowled. |
| Light | Corsair, Reaver, Ghost | one dodge per 4 s, telegraphed | loose | |
| Medium | Lancer, Jackal, Tether Raider, Anchor, Warden, Zealot | yes, with a 0.3 s wind-up you can see | role-based | |
| Heavy & bosses | Bruiser, Anvil, the six bosses | no — they are terrain | — | Turret slew ≤ 1.5 rad/s so a mosquito can orbit them. |

- `BODY_DODGE` (`src/ai/reflexes.js`, priority 0 for every pilot today) moves behind the tier table.
- Every attack telegraphs ≥ 0.6 s (doc 19). Every kind is sorted by silhouette and paint, not by a red
  ring (G08 row, `07` §6).
- **Done when:** fodder thrown-body hit rate in the staged fixture rises (measure before/after), and a
  stranger sorts the fifteen kinds by sight.

## 10. The room is a weapon — stage kills

- **Swarm:** each arena's machinery (doc 15) kills: freight, crusher, furnace, sluice, pylons, mill.
- **Adventure:** each town's toy is also a hazard, plus three sector-scale killers: a **sinkhole** (a
  collapsed-star well in a frontier sector — light bends around it; a body pushed in stretches, spins
  and is gone), a **planet's limb** (bodies knocked into the upper atmosphere ignite in a re-entry
  streak), and a **star's corona** (hulls glow and cook).
- **The Tumbler** — the owner's "long-distance gravity blast laser… doesn't do any damage but sends
  them tumbling": a Trick-family long gun. Zero damage; on hit, 2.5 s of helm loss, a strong impulse
  along the beam, the §7 tumble. The kill comes from what the body hits. It is a Ghost/Bruiser
  centrepiece and an Adventure god-tier unlock (`05` §6).
- **Kills by the room are named,** once, dry: *"Into the furnace."* *"Under the freight."* *"Off the
  edge of the world."* They pay more than any gun kill.

## 11. Ghost — the stealth layer

Built on `src/systems/cloak.js` and the sun shadows of `07` §2:

- **Cold drift:** cut your drive and you coast dark — signature falls, your running lights go out.
  Inside a real shadow (a rock, a station hull between you and the star) detection falls further.
- **Sensor cones you can see:** patrols sweep visible search-light cones that land on hulls and rock.
- **Ambush:** the first attack out of stealth hits harder and kicks harder for 2 s.
- **Sabotage:** a sticky charge planted on an unaware ship (Bomb: Sticky) or a Coupler tie set while
  unseen.
- In Swarm it is a small branch (a decoy, a short vanish); in Adventure it opens heists (doc 13).
