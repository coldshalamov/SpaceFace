<!-- LIFETIME: ACTIVE_PROGRAM -->
# FEEL — the layer that makes it feel real

**Owner, 2026-11-06:** "all the ships feel like they have real mass, and when you are redlining the
engines the ship shakes a bit or something, all those little things that make the game actually feel
real."

Professional games feel real because of **dozens of small, honest cues** stacked together: every one
tells the player something true about mass, force, strain or damage. Each cue below is small; the sum
is the difference between a toy and a machine. Owners: SWARM S / CHAOS / VERBS / audio / camera —
whoever owns the system the cue reads from. Every cue reads **real simulation state** (throttle,
acceleration, strain, damage, contact impulse) — never a timer pretending.

**Accessibility:** every shake, wobble and camera cue respects the reduced-motion and shake settings
(it's attenuated or replaced by a sound/visual), and nothing flashes beyond the flash rule.

**Done for the layer:** every cue below implemented, each with a capture; an independent reviewer flies
a Skater and a Juggernaut for 5 minutes each and scores R1 ≥ 4 and R9 ≥ 4; a blind check: with the HUD
hidden and the sound on, the reviewer can tell when the ship is boosting, braking, towing over its
limit, damaged, and colliding — from feel alone.

---

## 1. Mass you can see

| Cue | What happens | Reads from | Numbers (≈) | Tag |
|---|---|---|---|---|
| **Pitch on thrust** | the nose lifts slightly under hard acceleration, dips under braking | longitudinal acceleration | ≤ 6° light, ≤ 3° heavy; eased | NEW |
| **Bank into turns** | the hull leans by actual yaw rate | yaw rate × speed | exists (bank law) | EXISTS |
| **Settle** | after a hard stop the hull overshoots and settles (a damped wobble) | jerk at stop | 1 overshoot, 0.4 s | NEW |
| **Heavy inertia lag** | a Juggernaut's hull visibly "commits" — turn input shows on the RCS first, the hull follows | class mass | 0.15–0.35 s visual lag (visual only, never input lag) | NEW |
| **Load sway** | a towed or carried load swings and tugs the hull | tether tension vector | exists in physics; add hull yaw nudge | EXTEND |

## 2. Engines that work

| Cue | What happens | Reads from | Numbers (≈) | Tag |
|---|---|---|---|---|
| **Plume ∝ throttle** | main plume length and brightness follow throttle | throttle | 0 → 100% length | EXTEND |
| **Ignition** | engines flicker and cough for 0.2 s on first thrust from idle | throttle edge from 0 | | NEW |
| **RCS puffs** | small side jets fire on the correct side when turning or strafing | angular/strafe command | short white puffs, 0.1 s | NEW |
| **Retro burn** | braking fires forward retro jets | brake command | | EXTEND |
| **Boost kick** | white-hot flare, a shockwave ring behind the ship, camera stretch | boost edge | exists (pre-kick); add the ring | EXTEND |
| **Redline shake** | **at full throttle + boost for > 1 s, the hull shakes (high-frequency, small amplitude), vents spark, the engine note saturates and a strain whine rises** | throttle + boost duration + heat | shake 0.3–0.8 WU amplitude, 18–25 Hz; grows with heat; stops instantly on release | NEW |
| **Overheat** | past the heat limit: vent glow red, sputter, a warning tone; performance drops | heat | exists (heat); add visuals | EXTEND |
| **Dying drive** | a dying hull's exhaust cools and sputters | hull fraction | exists (inf-dying-drive) | EXISTS |

## 3. Strain and load

| Cue | What happens | Reads from | Tag |
|---|---|---|---|
| **Rope strain colour** | the Line goes white → orange → red with tension | tether strain | EXISTS — verify readable |
| **Rope creak** | creak and twang sounds rise with strain; a snap if it breaks | tether strain | NEW |
| **Hull groan** | towing over your class limit: the hull groans, shakes low-frequency, engines strain | load vs muscle | NEW |
| **Winch whine** | reeling in has a motor whine pitched by speed | winch rate | NEW |

## 4. Impacts

| Cue | What happens | Reads from | Tag |
|---|---|---|---|
| **Hit-stop** | brief freeze scaled by exchanged momentum (presentation only) | collision consequence | EXISTS (PQ-139) — tune |
| **Camera trauma** | shake scaled by momentum; heavy hits are low-frequency thumps, light ones sharp ticks | impulse | EXISTS — tune by mass |
| **Spark spray** | directional sparks at the contact point along the tangent | contact point + normal | EXISTS (spall) — verify |
| **Scrape** | continuous contact = a sustained spark trail and a grinding sound | sustained contact | NEW |
| **Crumple** | a hard hit leaves a dent decal / missing panel (KIT K6) | damage + impact point | NEW |
| **Debris** | chips inherit velocity and tumble; big hits shed parts | impulse | EXISTS — verify inheritance |

## 5. Damage you can feel

| Cue | What happens | Reads from | Tag |
|---|---|---|---|
| **Smoke and sparks** | below 50% hull: smoke trail; below 25%: sparks and flicker | hull fraction | EXISTS (wound smoke) |
| **Wobble** | a damaged hull drifts off-line slightly; the player feels it in steering | hull fraction + subsystem damage | NEW (subtle; never uncontrollable) |
| **Creak** | low hull: occasional metal creaks and alarm chirps | hull fraction | NEW |
| **Shield** | shield hits ripple; a break shatters with a crack; re-knit breathes | shield events | EXISTS (inf-shield-reknit) |

## 6. Camera that has weight

| Cue | What happens | Tag |
|---|---|---|
| **Mass-scaled lag** | the camera trails a heavy ship more than a light one | NEW |
| **Speed framing** | pulls back with speed (more look-ahead in the direction of travel) | EXTEND (Velocity VX-01) |
| **Boost stretch** | brief FOV/zoom kick on boost | EXISTS (FOV punch) |
| **Impact framing** | a big impact nudges the camera toward the impact direction | NEW |
| **Chase camera** | dips and rolls slightly with the hull in stern view | EXTEND (Velocity) |

## 7. Sound that has weight (with the audio lane)

| Cue | What happens | Tag |
|---|---|---|
| **Engine voice by class** | Skater whine, Mid growl, Hauler drone, Juggernaut rumble (sub-bass) | EXTEND |
| **Pitch ∝ speed, load ∝ throttle** | engine pitch follows speed; harmonics thicken with throttle | EXTEND |
| **Doppler** | passing ships pitch-shift | NEW |
| **Distance and occlusion** | far things muffled; a rock between you and an explosion muffles it | NEW |
| **Mass in impacts** | a scout thumps, a freighter crunches (mass term exists for collisions) | EXTEND |
| **Haptics** | gamepad rumble: engine at redline, impacts by mass, rope strain | EXTEND |

## 8. Things that must never happen (they break the illusion instantly)

- A body teleports or snaps (the playout buffer, master plan E1, must hide sim delivery jitter).
- A ship freezes while the world moves.
- A part floats off the hull or clips through it (KIT §3).
- Debris appears without inheriting the velocity of what it came from.
- An effect plays with no cause (a spark with no contact, a shake with no impulse).
- A shake that the player can't attribute to something.

## 9. Order

1. Redline shake, RCS puffs, retro burn, ignition (the engine set) — the owner's example; huge feel
   for little cost.
2. Pitch, settle, heavy inertia lag, mass-scaled camera (the mass set).
3. Strain set (rope creak, hull groan, winch whine).
4. Impact set tuning (scrape, crumple, impact framing).
5. Damage set (wobble, creak).
6. Sound set with the audio lane.
