<!-- LIFETIME: DURABLE -->
# ARCADE CORE — the build-out program for the game SpaceFace is supposed to be

**Status: PRODUCT DIRECTION, from the owner (2026-08-16).** This folder converts the owner's
current direction into executable plans. It sits under `design/VISION.md` (fantasy/UVP) and
`design/GDD_2_0.md` (pillars) in the authority ladder, and it **overrides any older plan where
they disagree about moment-to-moment gameplay**. Where a doc in this folder conflicts with an
LLM-generated plan elsewhere in the repo, this folder wins until the owner says otherwise.

## The one-paragraph diagnosis

The repo contains an enormous breadth-first sim (10 sectors, 33 commodities, factions, missions,
bar rumors, heists) wrapped in process docs, while the *assembled 30 seconds of play* the owner
describes — fly fast, blast enemies with physics weapons into asteroids and atmospheres, watch
them burst into materials that stream into your hull, immediately re-engage — was never built.
Much of the machinery already exists in code (impulse-kernel weapons, a field kernel with
Well/Repulsor/Cone, kill loot shards, a magnet vacuum in mining, tumble states, a wave-equation
market engine). The work in this folder is largely **auditing, finishing, tuning, and wiring
together what exists — then fixing what was built wrong** — not inventing new subsystems.

## The 30-second acceptance test

Every plan here serves one loop, observable in ordinary play:

> See a group of enemies → engage within seconds → kill them *with the environment and physics
> as first-class weapons* → each kill erupts into a readable cause-specific spectacle →
> materials and credits burst out and accelerate into the player's ship → the player is already
> steering toward the next group. No menu. No waiting. No ball-chase.

If a unit of work does not measurably improve this loop, the world that surrounds it, or the
upgrade economy it feeds, it is not Arcade Core work.

## The plans (build order)

| # | Doc | Outcome | Depends on |
|---|---|---|---|
| 00 | [INVARIANTS](./00_INVARIANTS.md) | The rules agents keep forgetting. Read before any other task. | — |
| 01 | [KILL_ECONOMY](./01_KILL_ECONOMY.md) | Every kill bursts credits + materials that vacuum into the ship; unified earn model for credits/materials/XP. | 00 |
| 02 | [STYLE_KILLS](./02_STYLE_KILLS.md) | Silent, cause-specific kill spectacle (fireball, burn-up, tumble chains) that multiplies credits/XP — never materials, never text toasts. | 01 |
| 03 | [PHYSICS_ARSENAL](./03_PHYSICS_ARSENAL.md) | Audit + tune the existing impulse/field arsenal into a real gravity-weapon kit; honest tether mechanics. | 00 |
| 04 | [ATMOSPHERE_EXECUTION](./04_ATMOSPHERE_EXECUTION.md) | Planet atmospheres as execution zones: gravity gradient, drag, burn-up, feel standard. | 02, 03 |
| 05 | [COMBAT_PACING](./05_COMBAT_PACING.md) | Swarm density, time-to-contact, TTK, starter-ship feel, speed-class identity. | 01 |
| 06 | [MARKET_COHERENCE](./06_MARKET_COHERENCE.md) | Rebuild the price charts into smooth, learnable, plannable functions. | — |
| 07 | [LIVING_WORLD](./07_LIVING_WORLD.md) | Freelancer structure: empty space + populated islands; NPC jobs with visible intent; GTA-radius consequence memory. | 05 |
| 08 | [FACTORY_LOOP](./08_FACTORY_LOOP.md) | Mine → claim → refinery → factory → convoy traffic → raids → income that funds ships. | 01, 07 |
| 09 | [VALIDATION](./09_VALIDATION.md) | How agents prove "fun" without playing in real time: bot routes, metrics, tuning labs, human gates. | all |
| 10 | [JUICE_DISCIPLINE](./10_JUICE_DISCIPLINE.md) | Juice that cannot break control or camera readability. | 00 |

## Seeding rule

Plans 01–05 are the core loop and outrank everything. 06 is independent and can run in parallel.
07–08 build the strategic layer once killing things is fun. 09 is a standing obligation:
**no plan in this folder is "done" by code inspection or a screenshot — only by the metrics and
route evidence each plan names.**

Agents dispatched from this program still follow `CANONICAL_BUILD_MAP.md` §1 mechanics
(NOW.md rows, packet shape, receipts). These docs supply the *outcomes and bans*; the packet
shapes the smallest slice.
