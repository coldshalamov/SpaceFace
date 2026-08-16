<!-- LIFETIME: DURABLE -->
# 36 — IMPACT & COLLISION FEEDBACK: mass you can feel

Collisions are a core weapon and currently under-dressed. `collisionConsequences.js` owns the
sim; this owns the read. Camera involvement is capped by 10 — the *world* sells the hit.

## Collision material language

| Impact | VFX | Audio |
|---|---|---|
| Ship × rock | Dust bloom + rock-chip scatter at contact; hull scrape sparks along the slide | Grinding crunch, pitch drops with mass |
| Ship × ship | Contact flash + both hulls' paint sparks; shielded side ripples instead | Metallic *crack-boom*, momentum-scaled |
| Ship × station | Deep thud, panel debris, emergency strobes nearby | Sub-bass, station klaxon if hard |
| Debris × anything | Small sparks, no drama | Tick/clatter |

## The momentum rule (GDD §4.5, finally wired)

Everything scales with **momentum exchanged**: flash size, debris count, sound weight, camera
trauma (within 10's hard caps), and the victim's hull ripple. A freighter shrugging a fighter
off its bow: tiny puff on the freighter, the fighter gets the full treatment. The asymmetry
IS the message.

## Damage-state handoff

Collisions feed 38's persistent states: a hard hit leaves a dent-scar decal + a fire if hull
dropped a band. Scrapes along surfaces produce continuous spark streams, not discrete puffs.

## Bans

- No invisible-damage collisions: if it hurt, it showed.
- No collision that changes player control response (I-2) — impulse only, through the kernel.

## Acceptance

- Metric: momentum→presentation scaling monotonic across a reference collision matrix.
- Human gate: truck-vs-bicycle capture reads exactly like it sounds.
