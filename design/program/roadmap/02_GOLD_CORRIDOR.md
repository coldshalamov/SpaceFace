# G01–G20 — Helios → Ceres → Tethys Gold Corridor

## Goal

Make the first ninety minutes understandable, recoverable, economically meaningful, and worth replaying
without injected setup. The corridor must work for all three careers and survive Continue, loss,
resize/pause, browser, and Electron.

## Research anchors

- Scope: `design/vision/ALPHA_PROGRAM.md`, M1/M3/M4 rows in `../02_REMAINING_WORK.md`.
- Runtime: `src/main.js`, `src/core/registry.js`, Flight V3, missions, economy, world/stations, save/Continue.
- Content: live sector/station/mission registries and the generated system/event routing docs.
- Proof: public-route harnesses, deep-state ladder, sim compare, UI/a11y/perf, browser/Electron evidence.
- Map/render paths listed as occupied in `NOW.md` remain unavailable until that lease is integrated.

## First ready brief: G01

### Outcome

Create a reusable autonomous public-input pilot that starts from the title route and reports semantic
milestones rather than teleporting or mutating state: New Game, career choice, objective acquisition,
undock, travel, map use, first dock, service use, save, Continue, and clean teardown.

### Path budget

- Expected new files are `scripts/lib/goldCorridorPublicPilot.mjs`,
  `scripts/check-gold-corridor-public-pilot.mjs`, and
  `test/gold-corridor-public-pilot-contract.test.mjs`. If any exists or is dirty at claim time, stop and
  return the collision instead of choosing an unreviewed alternate path.
- Read `scripts/AGENTS.md` and `test/AGENTS.md`; follow
  `scripts/lib/professionalTravelPublicRoute.mjs`, the current career public-route harnesses, shared
  Playwright loader, and visual-probe cleanup as research anchors.
- Reuse the shared game server, Playwright loader, launch cleanup, and public-input helpers.
- Evidence goes under the designated ignored artifact tree.
- Do not edit save internals, map/render files, `gameState.js`, or launcher policy. Return interface gaps to
  the lead.

### Implementation sequence

1. Inspect current career/public-route harnesses and choose one shared input abstraction.
2. Write a contract test for milestone schema, timeout classification, route identity, and cleanup receipt.
3. Implement a browser pilot for the shortest Helios dock path with no state injection.
4. Emit a JSON receipt containing build/worktree identity, input actions, milestone times, failure stage,
   save slot, console/page errors, and artifact paths.
5. Run the same contract through Electron only after browser cleanup is proven.

### Acceptance

- `node --test test/gold-corridor-public-pilot-contract.test.mjs`
- `npm run check:launch-policy`
- `node scripts/check-gold-corridor-public-pilot.mjs --career=hauler --stop=first-station`
- Contract test and launch-policy check pass.
- A current browser run either reaches the first station or returns an exact semantic blocker.
- No direct state mutation, hidden flag, synthetic key dispatch bypass, port leak, or orphan process.
- A failed route is still a useful `FOCUSED_GREEN` harness result; corridor acceptance remains red.

## Packet registry

| ID | Depends | Outcome | Primary paths / mutex requests | Required proof |
|---|---|---|---|---|
| `G01` | `F05,F09,F13` | Public-input corridor pilot and semantic receipt. | New `scripts/lib/*publicRoute*`, new test; browser/Electron lease. | Harness contracts, launch policy, current browser diagnosis, cleanup receipt. |
| `G02` | `G01,F13` | Capture and restore `fresh-start` without support state. | Durable COMMITTED artifact + receipts under `test/fixtures/deep-state-ladder/` + manifest update via integrator (wording reconciled 2026-07-18: the F13 ladder validator re-hashes artifacts and requires receipt files on every checkout, which only tracked files satisfy; screenshots/run logs stay ignored under `.devshots/`); save paths read-only. | New Game route, save schema, Continue, semantic fixture claims. |
| `G03` | `G01,G02` | Capture and restore `first-station`; services and undock remain reachable. | Route harness; station UI only if defect proven; save mutex. | Dock/Continue/undock public route, station UI checks. |
| `G04` | `G01` | Repair ordinary Flight V3/autopilot approach so Helios dock prompt is reached and held. | `src/core/flight/`, autopilot owner, focused tests; no legacy flight edit. | Existing autopilot/flight checks, sim compare, repeated public dock route. |
| `G05` | `G01,G04` | One clear corridor objective, immediate action, and threat/navigation hierarchy. | Mission/nav presenters; shared HUD/map are mutexes. | UI/a11y/perf plus unassisted route observation. |
| `G06` | `G03,G05` | First contract teaches one trade loop with authored reason, terms, cargo, and receipt. | Mission/economy data and narrow presenter; credits/cargo remain single writers. | Mission preflight/cargo/navigation/receipt checks and public completion. |
| `G07` | `G04,G06` | Ceres arrival has a distinct visual, audio, traffic, hazard, and economic postcard. | World/content + render/audio lease; manifests via integrator. | Sector identity contract, assets/live/perf, current capture and route. |
| `G08` | `G07,A04,A05` | Natural Ceres asteroid operation: find, enter, survey, extract, exit, and sell. | Mining/asteroid route; Asteroid UI only after its lease; cargo/economy intents. | Mining/site checks, public operation, `asteroid-entry` fixture contract. |
| `G09` | `G06,G08` | Earn and fit a truthful first upgrade with visible handling or capability effect. | Economy/outfitting/ships; derived-stat and package mutex requests. | Buy/fit guidance, mass/handling, save/restore, `first-upgrade` fixture. |
| `G10` | `G09,W03,W04,W05,W06` | One readable naturally produced corridor combat encounter demonstrates doctrine and counterplay. | Encounter data/runtime and combat; no AI compatibility path. | Combat doctrine/trace/sim checks and public survive/fail routes. |
| `G11` | `G10` | Natural defeat or lawful loss resolves to a safe, comprehensible recovery loop. | Game Over/recovery systems; save and credits via intents. | Recovery copy/route, collision-clear berth, `post-recovery` fixture. |
| `G12` | `G09` | Engineering/ship preview renders the actual runtime hull, parts, loadout, and stats. | Preview renderer/UI; runtime asset pipeline mutex. | Preview contract, asset/live checks, browser/Electron comparison. |
| `G13` | `G07,G10` | Travel to Tethys and gate/jump transition are legible, interruptible, and recoverable. | World/travel/transition; map lane mutex. | Seamless-world/travel route, transition/save guard, browser/Electron. |
| `G14` | `G06,G13` | Market communicates known versus live prices, route risk, cargo capacity, and expected margin. | Market presenter; economy remains writer; map integration request only. | Market nav/loop, price-confidence checks, a11y and public trade. |
| `G15` | `G13,G14` | Route loss/abandonment has an explicit failed state and lawful navigation recovery. | Mission/navigation ownership; no marker mutation from UI. | Mission lifecycle tests, no orphan markers, `route-loss` fixture. |
| `G16` | `G02–G15` | Save/Continue works at corridor turning points with no duplicated reward, lost objective, or stale route. | Fixture capture harness; save mutex through integrator. | Thirteen-ladder subset, migrations/schema, browser/Electron Continue. |
| `G17` | `G16` | All three careers complete a held-out 30-minute corridor pilot with comparable clarity and viable earnings. | Pilot policy/data; balance code only for proven blocker. | Career origin/ladder/balance checks and three public receipts. |
| `G18` | `G17,G11,G15,T04` | All three careers complete held-out ninety-minute pilots including upgrade, combat, recovery, trade, and a real Massline capture/attach opportunity. | Long-run pilot and ignored evidence; runtime owners only for defects. | Seed/policy matrix, save/Continue, performance/memory, no assistance, Massline attach receipt. |
| `G19` | `G18` | Corridor visual/audio/feedback family is accepted at sparse, normal, and crowded loads with corridor-scoped accessibility and performance baselines. | Render/audio/assets under dedicated leases. | Current matched media, corridor a11y/contrast, asset/live/visual stability, frame metrics. |
| `G20` | `G01–G19` | Gold-corridor exit gate binds behavior, fixtures, evidence, performance, and browser/Electron parity. | Integration/evidence only; no feature changes inside the gate. | Every declared route/evidence row current at one revision; no unknown failure. |

## Parallelization

- After `G01`, `G04` flight diagnosis and `G02/G03` fixture capture can run separately.
- `G06` economy/content, `G07` sector identity, and `G12` preview research may overlap if shared registry,
  map, asset manifest, and package changes are returned to the integrator.
- `G08`, `G10`, and `G13` depend on signature/world interfaces but their route-harness work can start
  earlier.
- One owner at a time controls the browser/Electron profile and evidence port.

## Exit risks

- A scripted route that injects state is supporting evidence, never gold-corridor acceptance.
- Career balance cannot be inferred from one seed or compressed simulation alone.
- A current dirty map or render file invalidates visual/source-pin conclusions touching it.
- “Reached station” is insufficient if the prompt cannot be held, services cannot be used, or Continue
  cannot recover the state.
