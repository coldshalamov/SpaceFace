<!-- LIFETIME: RECEIPT -->
# PQ-143.01 — Ordinary-life rhythm

```yaml
queueId: PQ-143.01
state: implemented
acceptance: route_evidence
date: 2026-09-06
integratedCommits:
  - 71c8ef50   # tug moves a real load on the Ceres route
  - ec5241ec   # ordinary-life capture, telemetry and the two defects it found
  - c546f346   # yard tug working deck, published and released
```

## Outcome

Routine traffic, waiting, cargo transfer, repair, travel and a slow tug with a real load are visible
at the shipping camera on the Ceres reference route without HUD text, and the rhythm is measured
rather than asserted.

## What the leaf actually needed, and what was there

A towing seam existed as uncommitted candidate work and its focused test passed. The test was honest
— real `rapier-dynamic` backend, SG-02 constraint count, load displacement, no teleport, delivery and
destruction cleanup — but it spawned its own payload and set its own target. **It proved the seam,
not the route.**

A probe of the real route (production node-safe runtime, `sector_ceres_belt`, seed 47, 180 simulated
seconds) found:

- **zero tugs.** The role carried 3.32 % of the weighted ambient draw, so on the fixed acceptance
  seed it effectively never rolled. The packet asks for deterministic visibility.
- **nothing towable.** All nineteen loose "wrecks" standing in the pocket are `world_site_*`
  collision proxies and components owned by `worldSiteKernel`, at mass 1e9 — authored places, not
  freight. Towing one would have drawn a line to an immovable object and dismantled a site.

## What was built

**The tug is dispatched, not rolled.** `trafficRoleMixForSector` holds `out.tug = 0`, exactly as it
holds `out.salvor = 0`, and `_dispatchYardTugs` hires a tug against a real body. This is the existing
cleanup-profession doctrine, and it has a second payoff: the weighted draw is byte-identical to the
pre-tug distribution, which is why the sim and massline goldens never moved.

**Both towable gates refuse authored structure and pinned mass** (`data.worldSiteId`,
`data.worldObjectId`, `mass >= 1e6`), from the traffic side and the runtime side. The runtime's
390 WU fallback scan runs inside a pocket holding nineteen such proxies, so this is a correctness
gate, not a taste one. `test/npc-jobs-runtime-towing.test.mjs` pins it.

**The load is a real body.** With no loose freight in a quiet window, the yard's own outbound lot is
the tow: a berth books a finite manifest, traffic spawns it wearing the authored `pod_cargo_container`
(the body the PQ-019 capsule already uses, so it is admitted by `presentationAdmission` and is never
a billboard), and npcJobsRuntime binds it through the existing combat attachment service. Its
`salvagePool` **is** the booked manifest, so a player who cracks it open takes exactly the freight the
tug was hired to move — the load is interruptible, which is what the senior direction asked for.
Delivery and abandonment retire the lot; concurrent peak is one.

**Tugs work the berth nearest the player.** Ordinary life the player never flies past is not ordinary
life, and SG-02 only gives a Rapier body to what is inside the player's physics reach — a far-side
tow is a line to a body with no dynamic authority. Measured: dispatching from `stations[0]` produced a
booked lot that did not move for a whole five-minute capture.

## Evidence

**Sim, live route, seed 47, 300 s** (`.tmp-pq143/probe-tug-live.mjs`, diagnostic):
one tug, one attachment, `sg02Attachments` peak 1 (the dynamic owner reports the live constraint),
141 s under tow, load displaced **2976 WU** at a maximum 1.3 WU per tick — continuous physical
motion, not a teleport. Two lots created, concurrent peak one.

**Player route, five minutes** — `node scripts/capture-ordinary-life.mjs --seconds=300`, public
Main Menu → Sandbox → Ceres Reference Pocket, seed 47, default shipping camera, HUD text swept off,
**98.8 % of normal speed**, zero page errors, 301 one-second samples, 8 active workers:

| Quiet behaviour | Seconds seen | Share of window |
|---|---:|---:|
| work | 284 | 0.94 |
| waiting | 301 | 1.00 |
| transfer | 87 | 0.29 |
| repair | 301 | 1.00 |
| travel | 301 | 1.00 |
| **tug with a load on the line** | **16** | 0.05 |

Verdict `all-quiet-behaviours-observed`; the load travelled 1507 WU during the window. The capture
exits non-zero when any behaviour never happened, so this cannot be reported as a pass by reading
only the last line.

## Two defects the capture found

1. **The observer could not see most of the life.** It sampled only entities carrying
   `activityActorSlotId` — the Ceres acceptance census key — so ambient traffic, which is most of the
   ordinary life on the route, was invisible to it, and so was the demand-dispatched tug, which has
   no cast slot at all. It also ended by recommending a human read the trace, which is not a verdict.
   It now samples every hull holding a job or a traffic role, samples the loads as bodies, and scores
   the six behaviours in code.
2. **The tug's tow markers were written once and never again.** `deserialize` deletes them by design
   and a rematerialized hull arrives with a fresh `data`, so a capture found the load reporting
   `npcTowedByJobId` for 33 samples while the tug towing it reported no attachment at all. The live
   paths re-stamp both ends now. The capture judges the tow from the **load** — `towedByJobId` names
   the exact job doing the towing and is stamped on a body the physics owner is moving — so it is a
   join, not a proximity guess.

## Checks

`npm run check:baseline` 15/15 green at the integrated commits; sim, sim-v3 and both compares green
after every change (the goldens are untouched by construction — see the zero ambient weight above).
`npm run check:asset-reachability` green. Focused: `test/npc-jobs-runtime-towing.test.mjs` (3),
`test/unused-model-live-wire.test.mjs` (6), `test/npc-jobs-runtime-wiring.test.mjs` (17).

## Not claimed

`npm run check:playable` is **red on this machine** and it is a boot-budget edge, not a broken game.
Measured directly: the main menu appears at **29.1 s against the check's 30 s budget**; the driver
reports no `KHR_parallel_shader_compile`, so shader compiles serialize. CLEAN, SHADER, ASSETS and
AUTHORED HULL all pass with zero uncaught errors, and the five-minute capture above booted through
menu → sandbox → flight and ran at 98.8 % of normal speed. Boot at 97 % of budget is worth watching:
any regression tips it over.

`.02` (texture one-offs) is already done and is not re-litigated here. `.00` (sector identity) still
owes its blind-naming record and is untouched by this leaf.
