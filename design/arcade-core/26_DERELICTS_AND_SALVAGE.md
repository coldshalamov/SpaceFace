<!-- LIFETIME: DURABLE -->
# 26 — DERELICTS & SALVAGE: the archaeology layer

`salvage.js`, `wreckClasses.js`, `survivorPod.js`, `aftermathWrecks.js` exist. Standard:
every wreck is a **small story with physical loot**, and salvage is a physics job.

## Wreck classes

| Class | Source | What's there | The job |
|---|---|---|---|
| **Fresh kill** | Any battle (yours or ambient) | Burst remnants + a hulk | Vacuum the burst; beam the hulk for bulk; watch for scavengers |
| **Cold derelict** | Seeded, old | Cargo still aboard, black box, maybe a survivor pod | Board-lite: tether-stabilize → cut hatch (industrial beam) → loot by hand-over-fist timer |
| **Hazard wreck** | Seeded near storms/eddies | Better loot, environmental risk | The environment is the timer |
| **Trapped wreck** | Pirate bait (it happens to you too — 49) | Loot + an ambush on a trigger | Scan first: the ambush is *detectable* |
| **Ancient hulk** | Rare, landmark-adjacent | Tech materials, codex lore (53) | Multi-visit: too big to strip in one run |

## The salvage verbs

- **Tether-stabilize**: stop its tumble before working (the Massline as a work tool — the
  fiction sells the mechanic).
- **Cut**: industrial beam on marked plates; cut plates become physical debris.
- **Extract**: cargo pods, black boxes (lore + bounty data), rare parts (salvage-only
  equipment exists — extend it), survivor pods.
- **Survivor pods** (survivorPod.js): rescue → station for rep/credits; or… don't. The game
  remembers within I-7 rules; rescue ships (18) will come if you wait.

## Rules

- No teleport-to-cargo loot: everything physical, everything through beam/tether/vacuum.
- Wrecks decay: fresh kills cool to hulks, hulks get picked by scavengers over ~20 min — the
  world cleans itself (19), and that *is* the timer.

## Acceptance

- Full derelict route: stabilize → cut → extract → a survivor-pod resolution branch each way.
