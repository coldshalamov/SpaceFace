# W01–W20 and R01–R18 — Embodied World, Story, UX, and Release

## Goal

Convert declared content into things the player naturally encounters, reads, acts on, remembers, and can
resume. Then close the interface, accessibility, performance, platform, and evidence work needed for a
credible release candidate.

An entry in a registry is not embodied content. Each `W` packet needs a producer, runtime carrier,
consequence, save behavior, and public route. Each `R` packet must preserve useful information and
authored quality while proving reachability and measured behavior.

## W01 ready brief — encounter phase dispatch

### Outcome

Give the live encounter runtime a direct deterministic contract for phase entry, action dispatch,
completion/failure, repeated initialization, stale phase data, and save/resume. The contract must prove
one owner dispatches each phase action once.

### Path budget

- Expected test is `test/e1-encounter-phase-dispatch.test.mjs`. If extraction is required, the only
  provisional new runtime path is `src/systems/e1EncounterPhases.js`; do not extract until the failing
  ownership seam proves it necessary.
- Read `src/systems/AGENTS.md`, `test/AGENTS.md`, `src/systems/e1EncounterRuntime.js`, the Depth encounter
  loader tests, and the existing encounter index/director commands.
- Use existing encounter loader/catalog fixtures; do not add encounter prose or edit catalogs in W01.
- Do not modify registry order, global save normalization, tactical AI, HUD, or map.
- If the seam is too entangled, extract a pure phase-transition helper in the owning subsystem only.

### Acceptance

- `node --test test/e1-encounter-phase-dispatch.test.mjs`
- `npm run check:encounter-index`
- `npm run check:encounter-director`
- Red characterization exposes at least one unowned/untested edge or, if current behavior is already
  correct, the receipt explicitly says coverage-only.
- Covers start, repeated start, legal next phase, illegal/stale phase, terminal phase, save/resume, and
  duplicate event protection.
- Deterministic event order and no wall-time dependence.

Terminal state: `FOCUSED_GREEN`; content consumers follow W03–W06.

## World/content/story packets

| ID | Depends | Outcome | Primary paths / mutex requests | Required proof |
|---|---|---|---|---|
| `W01` | `F05,F15` | Direct encounter phase-dispatch/resume contract described above. | Encounter runtime test/helper only. | Transition/duplicate/stale/save matrix. |
| `W02` | `F14,F15,W01` | Direct combat-trace append/order/reset/save contract so pilot evidence has a trustworthy digest. | `src/combat/trace.js` test; save integration only if proven. | Canonical vectors, event order, reset/resume, repeated-run equality. |
| `W03` | `W01,W02` | Actualize mine-layer doctrine with physical mines, telegraph, placement intent, limits, and counterplay. | Encounter/AI/combat ports; physics through commands. | Natural spawn, mine ownership/lifecycle, survive/clear routes. |
| `W04` | `W01,W02` | Actualize point-defense screen with visible protection geometry, target policy, saturation, and player response. | AI/weapons/effects; render later under lease. | Target/priority/cap contracts, doctrine distinction, public encounter. |
| `W05` | `W01,W02` | Actualize sensor-ghost encounter with uncertain contact, reveal logic, deception consequence, and escape. | Scanner/sensor/encounter systems; HUD/map mutex. | Known-vs-live state, deterministic reveal, reduced-flash route. |
| `W06` | `F10,W03–W05` | Prove catalog entries have valid natural producers, carriers, weights/guards, and reachable sectors. | Encounter director/data checks. | Census occurrence column, held-out seed cohort, no forced injection. |
| `W07` | `G01` | Helios postcard: landmark, station/traffic ecology, workaday voice, economy, and one memorable event. | World identity/content/assets leases. | Public arrival/dock/task route, current media/audio, save. |
| `W08` | `G07,A03` | Ceres postcard: formation identity, extraction economy, hazard, worker culture, and site story. | World content + Asteroid integration. | Public arrival/operation/recovery route and visual/perf evidence. |
| `W09` | `G13` | Tethys postcard: junction topology, gate traffic, competing interests, and route decision. | World/travel/content; map later through owner. | Arrival/gate/contract route, save/Continue and current capture. |
| `W10` | `W07–W09,F10` | Second sector-postcard wave uses a reusable contract without cloning the corridor aesthetic. | World-identity specs/data and separate asset lanes. | Three distinct held-out sector routes and census reachability. |
| `W11` | `W01,W06–W10` | Mission producer/carrier contract binds authored brief, trigger, actor/place, consequence, failure, and receipt. | Mission data/runtime; UI presentation request. | Generator/reference tests and ordinary accept/succeed/fail routes. |
| `W12` | `W11,G16` | Embody B0–B2 through actors, places, actions, and recoverable consequences. | Story/mission/contact data and runtime. | Held-out saves, no debug advance, public continuity. |
| `W13` | `W12` | Embody B3–B5 with faction/world changes visible outside dialogue. | Story/faction/world intents; faction writer remains owner. | Branch/save matrix and public consequence review. |
| `W14` | `W13` | Embody B6–B7 and ending setup with explicit prerequisites and no continuity gaps. | Story/mission/world ownership. | All legal branch paths, pre-ending fixture, public route. |
| `W15` | `W06,W11` | Rumor → bearing → scan → decision → salvage makes unique wrecks naturally discoverable. | Rumor/contact/wreck/salvage systems. | Natural lead cohort, unique-loot leak audit, discovered-wreck fixture. |
| `W16` | `W11,G14` | Faction threshold produces visible service, traffic, law, price, or mission consequence. | Faction intents + consumers; no direct reputation write. | Threshold matrix, restore, faction fixture and public observation. |
| `W17` | `W16,A15` | Three outpost specializations have visible construction, economy, assets, and strategic use. | Ownership/economy/station/assets. | Ordinary claim/build/use routes, save/offline receipts. |
| `W18` | `W12–W17` | Thirteen role progressions remain coherent through career, faction, ownership, recovery, and Continue. | Role/career/story integration; no isolated status claims. | Role-continuity checks and held-out long pilots. |
| `W19` | `W14,W16–W18` | All five endings are reachable from lawful state, distinct, receipted, and resume correctly. | Story/ending/save integration mutex. | Ending save matrix and public final decisions. |
| `W20` | `W19` | Post-ending sandbox preserves travel, economy, ownership, encounters, and future play. | Story state + existing systems; no parallel “sandbox game.” | Post-ending fixture, long Continue route, no disabled core loop. |

## UX/accessibility/release packets

| ID | Depends | Outcome | Primary paths / mutex requests | Required proof |
|---|---|---|---|---|
| `R01` | `G01,W05` | Target/contact roster exposes identity, threat, lock, range, and uncertainty without steering the ship. | HUD lease after current agent; targeting remains separate. | Keyboard/gamepad routes, clutter exact-target tests, UI perf. |
| `R02` | `G05,R01` | Flight HUD shows one objective, immediate action, and threat while preserving radar/roster/station/nav value. | HUD/styles exclusive lease. | UI/a11y/contrast/perf and unassisted corridor review. |
| `R03` | `G13` | Finish one live map cutover and retire legacy route ambiguity without losing information. | Current `MAP-2026-07-18` lease must be integrated and released; current map owner only; generated docs via owner. | `check:m2:map-cutover` all green, browser/Electron parity, current captures. |
| `R04` | `R03,W11` | Author mission briefs, remembered-contact decay, and multi-point mission geometry consumed by the map. | `MAP_DATA_HANDOFF` data owners; map reader unchanged unless contract gap. | Player-label/data refs, map route and save semantics. |
| `R05` | `G14,R03` | Market makes price confidence, capacity, fees, legality, and route consequence scannable. | Market UI/styles; economy read-only presentation. | Market checks, a11y/contrast, public buy/travel/sell. |
| `R06` | `W11,W16` | Activity/ledger explains causes and receipts for missions, faction, economy, loss, and recovery. | Activity/cause ledger UI; writer systems emit events. | Deterministic ordering, localization, screen/perf checks. |
| `R07` | `T16,R01–R06` | Rebindable keyboard/mouse/trackpad/gamepad control reaches every critical action and screen. | Input/settings exclusive lease. | Input modalities, rebind persistence, pause/modal/focus routes. |
| `R08` | `G20,T15,A17,W03,W04,W05,R01–R07` | Reduced-motion and reduced-flash modes preserve semantic cues for flight, Massline, Asteroid Ops, combat, map, and menus. | Settings/effects/styles under coordinated leases. | Automated mode checks plus matched current media. |
| `R09` | `G20,T15,A17,R01–R08` | Contrast, text scale, focus, non-color cues, and crowded legibility work across representative screens. | UI/styles/accessibility owners. | WCAG/contrast, keyboard focus, screenshots at scale/forced colors. |
| `R10` | `G12,R09` | Ship/module/weapon/ownership previews use actual runtime assets, silhouettes, loadouts, and state. | Preview/render/assets; manifest mutex. | Asset/load parity, browser/Electron media, no fabricated preview. |
| `R11` | `R01–R10,W20` | Localize all release-critical copy and ensure layout survives expansion and missing keys. | Localization catalogs/build + UI owners. | Localization inventory/reachability and representative pseudo-locale route. |
| `R12` | `G20,T17,A19,W20,R01–R11` | Repair cross-feature frame pacing, callback/sim cost, and startup without removing authored visuals or lowering defaults. | Measured owners identified by profiles. | Sparse/normal/crowded headed profiles on target/floor hardware. |
| `R13` | `R10,R12` | Asset residency, loaders/decoders, disposal, and heap trajectories remain bounded across travel, menus, and Continue. | Asset loader/material/renderer ownership; no visual downgrade. | Residency/refcount, memory soak, repeated route and teardown. |
| `R14` | `G20,R12,R13` | Browser, Electron, and packaged build share the same route, assets, settings, saves, and player outcomes. | Launcher/package owner; no gameplay fork. | Launch policy, parity routes, clean teardown. |
| `R15` | `G16,W19,W20` | Migrations, corrupt saves, interrupted autosaves, slots, and Continue fail safely with clear recovery. | Save/migration exclusive lease. | Version matrix, corruption/fault injection, browser/Electron Continue. |
| `R16` | `R08–R15` | Resize, alt-tab, pause/resume, input-device swap, long soak, and platform matrix are stable. | Platform/release harness only; fix owners from evidence. | Target platform sessions, logs, memory/perf, no orphan process. |
| `R17` | `R11–R16` | Produce honest store captures and copy from the current accepted build, with license/provenance receipts. | Release capture/assets/docs; no staged feature edits. | Hash-bound browser/Electron/package media and provenance. |
| `R18` | `F01–F17,G01–G20,T01–T18,A01–A20,W01–W20,R01–R17` | Release gate binds current revision, complete CI diagnoses, public routes, fixtures, accessibility, performance, assets, and store evidence. | Integration/evidence only. | No unknown red, stale pin, missing evidence, unowned lease, or unreviewed workaround. |

## Parallelization

- `W01` and `W02` are pure/focused foundation consumers; `W03–W05` may then run as separate doctrine
  lanes if they avoid shared AI/weapon/effect writers.
- `W07–W09` can author identity/content in parallel, but manifests, registry wiring, and player captures
  serialize through owners.
- Story packets remain sequential at branch boundaries; world/faction consumers can research in parallel.
- UX packets may follow each visible feature. They must respect the user-confirmed active HUD and
  visual-asset leases and cannot start by rewriting shared styles.
- `R12/R13` fix measured owners, not whichever render file is convenient. `R14–R18` run after feature
  churn slows and never absorb unrelated gameplay work.

## Exit rule

Release readiness is a current revision with repeatable player outcomes. It is not a large registry, a
green source-pattern suite, a gallery of unbound screenshots, or a prose claim that content is present.
