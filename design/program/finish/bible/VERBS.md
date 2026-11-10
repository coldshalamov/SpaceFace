<!-- LIFETIME: ACTIVE_PROGRAM -->
# VERBS — everything the player can do, and how each must feel

The verbs are the game. A verb is done when it scores ≥ 4 on R1/R2/R8/R9 (QUALITY.md) and its
moments (MOMENTS.md) happen. Numbers marked ≈ are starting targets; tune by feel and write the final
values back here. Timings are at 60 Hz. Keys follow the owner's ruling: the five powers stay on 1–5.

Every verb entry has: **what it is · input · feel targets · timings · look · sound · how it can fail ·
combos.** Tags: [EXISTS] / [EXTEND] / [NEW].

---

## 1. Flight

### Thrust, turn, brake [EXISTS → tune]
- **What:** a mass you steer; momentum is real but the ship obeys.
- **Feel targets (≈, per class):**

| Class | Rest → cruise | Full reversal | Turn radius at cruise | Feels like |
|---|---|---|---|---|
| Skater (Hitch, racers) | 0.5 s | 1.2 s | ≈ 0.6 screens | a skateboard on ice — nimble, drifts when you let it |
| Mid (Wasp, Hornet, Drifter) | 0.7 s | 1.6 s | ≈ 0.95 screens | a sports car |
| Hauler (Mule, Pelican, Hawser) | 1.2 s | 2.5 s | ≈ 1.5 screens | a loaded truck |
| Juggernaut (Ironback → Leviathan) | 2.0–3.5 s | 4–6 s | ≈ 2–3 screens | a freight train you're proud to drive |

- **Look:** hull banks into turns by actual yaw rate (exists); engine flare on thrust, retro flare on brake; speed streaks and parallax rise with speed.
- **Sound:** engine note pitch follows speed; brake hiss; heavy hulls rumble at idle.
- **Fails if:** a heavy ship is merely *slow* (it must be *powerful*: momentum that pushes through things); brake is so strong momentum never matters; turning is so slow combat is frustration.

### Boost [EXISTS → tune]
- **What:** a burst of speed from an energy bar.
- **Feel:** a kick (≈ 0.08 s pre-kick exists), the camera stretches back, streaks double, engine goes white-hot; top speed ≈ 2× cruise.
- **Timings:** drains ≈ 2.5 s of full boost; refills in ≈ 4 s when not boosting.
- **Fails if:** boost is a number change without a felt kick.

### Dash [EXISTS → surface]
- **What:** a short directional burst (tap boost + direction) to dodge.
- **Feel:** ≈ 0.25 s, distance ≈ 0.3 screens, a 0.4 s afterimage; 1.2 s cooldown.
- **Combo:** dash through a charger's line; dash out of a well; dash-ram (a dash into a light ship counts as a ram).

### Chase camera (stern view) [EXISTS → extend; Velocity program]
- **What:** drive from behind like F-Zero/GTA.
- **Feel:** forward sight ≈ 1 s of travel ahead at speed (VX-01), camera lags on turns, dips on impact; never inside a hull.

## 2. Guns

Guns are for mowing fodder and finishing; physics makes the big kills. Every gun family needs its
own **look** (tracer colour/shape), **sound** and **push**.

| Family | Fantasy | Feel targets (≈) | Look | Sound |
|---|---|---|---|---|
| Pulse laser [EXISTS] | reliable starter | 5–6 shots/s, light push; kills Swarm fodder in ≤ 0.5 s (feel profile) | short cyan-white bolts | crisp "tik" |
| Autocannon [EXISTS] | heavy chatter | 4 shots/s, solid push, heat builds | orange tracers, shell casings flicker | thudding chatter |
| Bank stream [EXISTS] | bullet hose that ricochets | 14 shots/s, bounces off plates/rocks | thin gold stream, sparks on banks | buzzsaw |
| Concussion cannon [EXISTS] | shove gun | 1 shot/s, huge push, little damage | fat blue slug, shockwave ring | deep "whump" |
| Railgun [EXISTS] | sniper | 0.7 shots/s, pierces, 1 s charge | white line, lingering trail | charge whine + crack |
| Missiles [EXISTS] | lock-on burst | 4-missile salvo, 1 s lock | smoke trails | hiss + thumps |

- **Every hit:** directional spark + push + a hit sound per material (shield, hull, rock).
- **Fails if:** all guns feel the same; tracers hide enemies; guns out-kill physics against heavies (heavies should shrug guns and fear rams/throws).

## 3. The Line (the Massline) — the signature verb

The Line is a white-hot rope fired from the ship that latches to anything with mass. It is the most
important verb in the game. **It must feel like Spider-Man's web-swing crossed with a tow truck.**

### Fire and latch [EXISTS]
- **Input:** RMB (Swarm) / Space (Adventure today) — aim with the mouse.
- **Feel:** the rope shoots out fast (≈ 0.12 s to max range), latches with a clunk and a flash; range ≈ 0.6–0.8 screens; a miss reels back with a whip.
- **Look:** brightest thing on screen; taut = straight, slack = curves; strain shows as colour (white → orange → red at overload).

### Swing [EXISTS → tune]
- **Feel:** latched to a heavy anchor, your momentum converts to orbit; holding thrust tightens the swing; the rope barely stretches (stiffness scales with load — FEEL_CONTRACT A9).
- **Fails if:** bungee feel; swing loses speed; the ship hits the anchor.

### Release (slingshot) [EXISTS → tune]
- **Feel:** release keeps 100% of tangential speed; snap sound, flash at the anchor, rope whips away; camera widens; earned speed isn't braked away (A1–A3).
- **Target:** a good swing releases at ≥ 1.5× cruise (M1).

### Winch [EXISTS]
- **Input:** hold to reel in / out.
- **Feel:** reeling a heavy body toward you pulls *you* toward it if it's heavier (mass decides who moves); a small body flies to you.

### Tow [EXISTS → deepen]
- **Feel:** the load swings behind you, changes your turn and acceleration by mass; it can hit things on the swing (a swung load is a weapon); dropping it is a lurch of freedom (M2).
- **Muscle stat:** a ship can tow up to its class limit; over the limit, the rope strains red and you're dragged.

### Throw [EXISTS → deepen]
- **Input:** swing and release while holding a light body.
- **Feel:** the body flies off at the swing's tangential speed, tumbles, and kills what it hits (bowling-pin rule, SWARM AUDIT P2) (M7).

### Cut [NEW]
- **Input:** a second press while latched with no tension, or shooting the rope.
- **Use:** drop a tow instantly; cut an enemy's tether (police tow, CH-22); cut cargo-train lines (CH-32).

### Line heads [EXISTS in data — W-HEADS]
Later progression: Coupler (link two bodies to each other), Barb (latches and damages), Magnet (grabs
small metal from range), Weld (permanently fuses two bodies), Breaker (rips plates off). Each changes
what you *do*, not numbers.

## 4. The five powers (keys 1–5)

| Key | Power | What it is | Feel targets (≈) | Look | Sound |
|---|---|---|---|---|---|
| 1 | **Pull** (gravity well) | drop a well at the aim point that drags bodies and bends shots | **yank** 1.2 s at high strength (bodies converge ≈ 150 WU/s and collide hard), then **hold** 2 s; cooldown 6 s; radius ≈ 190 | a lensing distortion ring that contracts; debris spirals | deep rising hum, a "suck" on yank |
| 2 | **Shove** (repulsor) | a punch that blasts everything away from you | **punch** 0.35 s at ×3 strength (lights leave ≥ 90 WU/s and tumble), then a 1.5 s fading berm; cooldown 5 s; radius ≈ 170 | an expanding ribbed shockwave | a bass "whoomp" |
| 3 | **Pin** (mass seed / anchor) | fire a seed that locks a body in place as an anchor | travel ≈ 260 WU/s for 1.6 s; locks the first body for 4 s; locked bodies are perfect Line anchors and walls | a glowing nail with a lock ring | a "chunk" lock |
| 4 | **Bomb** | drop or throw a charge | tap: drop frag behind you; hold: charge a throw; detonation shoves and damages in a radius; sticks to hulls and rocks | a blinking charge, then a ring + debris + light (never a full-screen flash) | beep cadence, then boom with tail |
| 5 | **Rig** (cone / sluice) | a held forward wedge that clears a lane | sustained while held; pushes bodies out of a forward cone; drains energy | a translucent wedge with flowing streaks | a rushing wind |

**Hold-to-preview** [EXISTS, row 493]: holding a power key shows what it will move before release.
Keep it; it's the Into the Breach rule (show consequences before commitment).

**Fails if:** powers are long-lasting ambient fields (they must be punchy events); effects are pretty
but bodies barely move; preview and result disagree.

## 5. The Conjurer's specials (drafted in Swarm, fitted in Adventure)

| Special | What it does | Feel |
|---|---|---|
| **Web (Snarl)** [EXISTS as a card] | hits stitch nearby enemies together with glowing strands; their thrust fights each other | the knot wobbles; one explosive hit pops the whole knot (M3) |
| **Black hole** [NEW as an evolution — Graviton Heart + gravity tag] | a short-lived singularity that drags everything in and then **bursts**, flinging the pile outward | 2 s inhale, a dark core with a bright rim, then an outward ring that throws bodies at high speed — the Katamari-into-supernova moment |
| **Gyre** [EXISTS: "gathers rocks"] | a vortex that gathers loose rocks into an orbiting shield around you | rocks orbit you and smash anything they hit; release flings them all outward |
| **Mines / trap** [EXISTS: repulsion trap, sticky detonator] | leave explosives behind | visible blink; proximity tell; chain with volatiles |
| **Domino** [EXISTS legendary] | every credited kill shoves the room outward from the body | kills cascade |
| **Graviton Heart** [EXISTS legendary] | a weak well that follows your ship | you become a moving Katamari |

## 6. Ram and hijack (the Juggernaut and the thief)

### Ram [EXTEND — CHAOS CH-01/02]
- **Feel:** closing speed × mass ratio decides damage; a heavy hull plows through lights with a crunch and barely slows; equals both crumple; a light bounces off a heavy, hurt.
- **Look:** spark spray at contact, parts torn off the victim, victim tumbles.
- **Sound:** metal crunch scaled by mass; the heavy's engine groans and recovers.

### Hijack [EXTEND — CHAOS CH-30]
- **Input:** Line onto a ship below your class limit → hold the interact key 1.5 s → the pilot pod ejects.
- **Feel:** ≤ 5 s total; the camera swings to the new ship; its handling is immediately different.

## 7. The combo table (what the verbs make together)

These must all work, because these are the stunts players will tell friends about. Each one is a
test case for SWARM F, CHAOS C1 and the route walkers.

| A | + B | = Result | Moment |
|---|---|---|---|
| Line swing | release near enemies | slingshot ram through a formation | M1, M5 |
| Line latch on light enemy | swing + release | enemy thrown into another enemy | M7 |
| Pull (well) | Bomb into the pile | one bomb kills the whole clump | M4, M25 |
| Pull | Shove right after | a crushed clump blasted outward like shrapnel | M25 |
| Web | Bomb or any explosive hit | the knot pops in a chain | M3 |
| Pin a heavy rock | Line swing around it | a custom anchor anywhere | M1 |
| Pin an enemy | Line-throw a rock at it | a staked target | M7 |
| Shove | toward arena hazard | bowling the horde into the crusher | M24 |
| Tow a volatile pod | release into a pirate nest | delivered bomb | CH-04 |
| Ram (heavy) | docking queue | bowling strike | M6 |
| Gyre (rock shield) | Shove | rock shotgun | M25 |
| Black hole | its burst near a hazard | everything flung into the hazard | M24, M25 |
| Hijack a freighter | Ram with it | a stolen battering ram | M15, M5 |
| Line cut | an enemy's tow on you | escape the police tow | M14 |
| Dash | through a charger's line | it hits whatever was behind you | M24 |

**Done for the combo table:** every row captured in ordinary play (Swarm or Adventure) and reviewed;
rows that can't happen are either fixed or deliberately removed with a reason.

## 8. Controls (Swarm set; Adventure extends it with contexts)

| Input | Swarm | Adventure (flight context) |
|---|---|---|
| WASD | move | move |
| Mouse | aim | aim |
| LMB | fire | fire |
| RMB | Line fire / release | Line fire / release |
| 1–5 | Pull / Shove / Pin / Bomb / Rig | same |
| Space | boost (tap + direction = dash) | same |
| Q | call-in | quick radial (hold) |
| E / F | interact (depot pad, Fortify socket) | interact / hijack (hold) |
| \ | — | chase camera toggle |
| M | — | map |
| Tab | scoreboard | contacts |
| Esc | pause | pause |

Everything else on the keyboard is inert in Swarm and moved into contexts in Adventure (master plan
X5). Gamepad mirrors this.
