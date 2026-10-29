# Whole-game integration coverage

Owner request, 2026-10-29: finish the whole game autonomously, preserve its intended UX, replace
broken implementations and obsolete agent assumptions, consolidate navigation, and integrate the
other agents' landings. This is the integration record for that request; the three lane boards
remain the detailed work lists. An inventory, audit report or passing fixture does not close a
player experience.

## Coverage and remaining work

| Area | Current examination | Required closure |
|---|---|---|
| Boot, loading, renderer, graphics recovery | Existing Lane 1 audit reused; reproduced two readiness/recovery defects and executable syntax diagnostics | Finish Lane 1 packets and findings; successful launch, context recovery, representative visual inspection, measured frame/load budgets |
| Flight, physics, AI, combat, weapons | Production V3/tactical/Rapier ownership checked; Lane 2 audit findings being repaired | Finish Lane 2 review and stress work; ordinary inputs, death/retry, damage/kill/reward chains and all affected modes |
| Swarm / Crucible | Run lifecycle and Circuit integration examined; full attached report extracted; headed gate started | Resolve core report gaps, complete the Foundry build/fight/repair loop, prove both population objectives and progression on the default route |
| Adventure, world, missions, economy, careers, story | Registry/route inventory started; existing Lane 3 audit is the source for further repairs | Review actual implementations and connections, including first dock/trade/mission, travel, persistent consequences and recovery |
| Fleet / automation | Confirmed wingman death payload did not match automation's damage consumer | Behavior fixture covers death and one loss receipt; preserve healthy ships across travel; remaining automation review stays on Lane 3 |
| UI, controls, accessibility, localization | Concurrent UI/units changes protected; navigation consolidation in progress | Exercise screens and controls at desktop/mobile sizes, remapping, reduced motion/flash, missing strings, cross-mode leakage |
| Audio and presentation | Repaired exact-audio relevance for runtime-pinned bodies and partial active sets | Review cues and voices through their real consumers; mix/readability and pooled lifetime work remains |
| Saves / resume / new game | Concurrent save changes protected; save-schema baseline passed | Review landed save changes; slot isolation, mid-run policies, reload, malformed imports and repeat initialization |
| Assets / units / dormant systems | Player-truth environment matched 8,654 asset blobs to HEAD before its run | Review useful assets through runtime maps, visible use and residency; integrate unused useful systems rather than assume presence means reachability |
| Build, packaging, browser / Electron | One Electron runtime-witness attempt timed out before flight | Repair/recheck launch; retail build and browser/Electron routes, applicable mobile routes and clean process teardown |
| Documents / policy | Finish routing conflicts identified; full PDF core and technical appendices read | Consolidate active entry points; retain owner UX/technical constraints; remove superseded agent process claims |
| Final build-map and recent commits | Pending, deliberately after other agents land and production gaps close | Read remaining build-map work; review the last 300 commits in coherent system groups and repair material misses |

The live system inventory is `src/runtime/authoritativeSystemManifest.js`; module ownership is in
`docs/MODULE_MAP.md`. Existing lane audit manifests enumerate the source chunks already assigned.
Reuse completed findings and do not start parallel reviews of chunks still being examined.

## Verified repair batch

Graphics/boot/audio repairs below were published in `90731639f61`; gameplay repairs remain
unpublished until their affected route can pass the batch gate.

- A second renderer joining graphics refill stayed hidden forever. Reproduced with two renderers;
  all waiters now leave the orientation hold. Package-detach and orientation tests: 15 passed.
- A hidden retired fallback falsely made a resident hull unready; alternate quality geometries
  were omitted from the same readiness query. The consult now matches admission eligibility and
  checks swappable geometries. Geometry-residency tests: 27 passed.
- Startup syntax diagnosis imported healthy candidate code and could execute it. A deliberately
  unresolved static dependency now prevents candidate evaluation while preserving syntax errors.
  Startup-failure diagnostics tests: 10 passed.
- Wingman death used `dmg` while automation reads `damage`, leaving a dead ship in the fleet
  ledger. The producer now uses the canonical field. Lifecycle tests: 2 passed.
- Audio residency ignored `activity.pinnedExact` and treated a partial active-set miss as a final
  denial. Exact relevant voices now survive those cases. Focused pin tests: 2 passed.

## Integration observations

- Baseline attempt: 10 of 17 checks passed; 7 timed out under heavy concurrent host load. No
  passing whole-baseline claim. Do not increase deadlines or discard checks to turn this green.
- Runtime witness attempt: Electron page load exceeded 180 seconds; no flight samples, so launch
  and gameplay remain unverified. See `.devshots/runtime-witness/report.md` for that attempt.
- Headed Swarm gate: both idle and active passes FAILED before the main menu. No gameplay frames
  were observed. Active pass recorded harness-process freezes of 122 and 39 seconds; idle pass
  ended with 909 MiB free memory. Screenshot remained at the 18.1% opening boot stage. This does
  not distinguish stalled startup from host scheduling pressure; do not claim either is fixed.
- Existing source review inventories currently enumerate 2,756 JS/TS source files. Lane 1 has
  112 reports for 135 assigned chunks and Lane 3 has 154 for 303 chunks. A report is an input to
  triage, not an approval. Local snapshot: `.devshots/finish/integration-2026-10-29/coverage-inventory.json`.
- Concurrent Git synchronization briefly removed dirty/new files, including `src/ui/units.js`,
  while an autostash was active. They returned after the merge. A missing module observed during
  that interval is not a new source deletion; recheck a dependent failed test on the stable tree.
- Keep finished repairs in exact-path commits and publish them; preserve other agents' staged and
  unstaged work. Never use a broad stash/reset to make integration convenient.

## Attached design report

`SpaceFace_Swarm_Renaissance_Extended_Design_Bible.pdf` (171 pages, 2026-10-28) is requested design
input. Its core is Parts I–X; its catalogs explicitly form an optional design bank. Full extraction
is under `.devshots/finish/integration-2026-10-29/docs/`. The implementation gap map belongs beside
this record as `SWARM_RENAISSANCE_GAPS.md`. Preserve existing owners for movement, physics, damage,
wallet and run phase. Fortify, maneuver and stealth work must compose those owners rather than
create parallel writers. Do not treat a one-device prototype as the PDF's complete Fortify pilot.
