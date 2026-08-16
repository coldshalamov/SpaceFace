<!-- LIFETIME: DURABLE -->
# 11 — ENEMY ARCHITECTURE: the mass ladder and the design grammar

Every enemy in the game is built from one recipe, stored in data (`src/data/enemies.js`) and
executed by the live SG-06 tactical stack (`src/systems/tacticalAI.js`, `src/ai/`, `aiPorts.js`).
`src/systems/ai.js` is compatibility-only. New enemies are **data entries plus bounded extensions
to the live tactical stack, not a parallel AI framework**. This doc is
the grammar all bestiary docs (12–16, 20) follow.

## The mass ladder (the game's load-bearing idea)

| Class | Mass band | Role in the physics game | How it dies |
|---|---|---|---|
| **Light / swarm** | ≤ 20 | *Ammunition.* Shoved, chained, burned, bowled. Screen-fill and dopamine fodder. | A burst, one good shove into terrain, or being hit by another body |
| **Medium** | 20–60 | *Setup targets.* Too heavy to flick, light enough to work: mark → disrupt → shove → smash. | Commitment: a prepared physics sequence or focused fire |
| **Heavy** | 60–150 | *Moving terrain.* Shrugs fields and shoves (coupling floor only). Weak points, not HP. | Subsystem strip: turrets, drives, then the kill |
| **Capital** | 150+ | *A place, not a target.* You fight its parts, fly its surface, use it as cover. | Phased setpiece (20_BOSSES) |

Rules:

- Mass is destiny and mass is honest. No light ship that "acts heavy," no heavy that flinches
  from a shove. The coupling contract in `src/data/fields.js` is the reference.
- Every enemy answers: **"what does it do to the player's physics, and what can the player's
  physics do to it?"** An enemy that is only a gun with HP is a defect.
- Every enemy has a **readable tell** (silhouette + one behavior + one VFX/audio cue) at
  default zoom. If you can't tell what it is in one glance, it's not done (GDD pillar 2).

## The archetype FSM palette (existing, extend)

Swarmer / sniper / brawler / pirate / trader / capital behaviors exist across the data and tactical
stack. Bestiary entries may compose these and add bounded tactical policies (flee-dump,
orbit-anchor, screen-allies). New default-route behavior goes through `tacticalAI` + `src/ai/`;
compatibility parity is explicit and never makes legacy `ai.js` the owner (I-9).

## Fleet composition grammar (how groups are authored)

Encounters are recipes, not spawn tables:

- **Pack** — 3–7 of one light family. The baseline dopamine unit.
- **Wing** — lights + one medium leader. Kill the leader → 8 s morale scatter (GDD §6.2).
- **Screen** — mediums around a heavy/specialist. The specialist is the puzzle; the screen is
  the ammo you use against it.
- **Convoy-raid** — civilians + attackers, already in motion. The player arrives mid-event
  (07_LIVING_WORLD).

## Difficulty policy (locks 05 and 56)

Harder content = different *composition* (more specialists, nastier geometry, tighter
timing), never HP/damage inflation on the same hull. A Wasp is a Wasp everywhere; a hard
sector sends Wasps with a jammer and a minelayer.

## Acceptance

- Every shipped enemy: data entry + tell checklist + mass-class test (reference impulse
  sources produce the ladder-correct Δv) + one bot route where its intended counter works.
