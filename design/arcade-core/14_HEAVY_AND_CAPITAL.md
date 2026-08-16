<!-- LIFETIME: DURABLE -->
# 14 — HEAVIES AND CAPITALS (mass 60+): moving terrain

**A heavy is a level, not a health bar.** `weakPoints.js` and the subsystem model exist —
this doc makes them the rule.

## Heavy class (60–150)

| Entry | Mass | Fight shape | Tell |
|---|---|---|---|
| **Gunship** (exists) | 150 | Turret boat: 360° pressure, slow. Strip turrets (destructible, physical: they blow off and become debris), then it's a drifting barge you can shove, mine, or ignore | Wide hull, visible turret rings |
| **Ramscoop** | 90 | Wants to ram: heavy prow plating, big burns. Dodge → it overshoots into geometry; its own mass is its enemy. The joke that teaches heavies. | Reinforced wedge nose, oversized plume |
| **Carrier-lite** | 120 | Launches 3–5 motes/wasps; the launcher bays are destructible | Hangar slots, launch flashes |
| **Foundry** | 110 | Industrial combat hull: mining beams repurposed as close-range cutters, drops charged ore as mines | Industrial yellow, cargo spine, drill head |

Rules:

- Fields and concussion weapons produce **drift, never flight** (coupling floor ~0.05). The
  counter to a heavy is subsystem surgery + terrain, never a bigger shove.
- Every destructible part is a **physical object**: blown-off turrets tumble away with real
  momentum and can themselves smash things (free style-kill chains).
- A disabled heavy becomes a *physics asset*: tow it (Massline), park it as cover, shove it
  at its friends with stacked charges, or push it into atmosphere for the biggest burn-up in
  the non-capital game (02 ×2 + heavy loot spine).

## Capital class (150+)

Fights are phased setpieces (20_BOSSES): strip PD screen → kill drives → it becomes stationary
terrain → board-lite/salvage/destroy choice. A destroyed capital leaves a **persistent wreck
site** (25_LANDMARKS, 26_DERELICTS) — the world remembers the battle physically.

## Bans

- No heavy killable by sustained starter fire in under ~20 s; no heavy whose turrets can't be
  individually destroyed.
- No capital as a routine spawn. Capitals are events.

## Acceptance

- Bot route: gunship turret-strip → barge-shove into asteroid → style-kill multiplier fires.
- Metrics: turret destructibility, debris physics on blown-off parts, coupling floor honored.
