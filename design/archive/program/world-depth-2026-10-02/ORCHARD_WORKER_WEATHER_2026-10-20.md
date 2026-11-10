<!-- LIFETIME: DURABLE -->
# Orchard local worker weather response

20 October 2026, 20:14 UTC. Implemented and locally tested; not accepted or published.

Original SF20-14 requires NPC skimmers to read the same forecast and wait or retreat. Existing machinery already admits finite pod production only in calm. The missing behavior is the original collector's physical response to a local corridor warning, not permission to harvest during gusts.

Pre-fix reproduction uses the real authored frame and a deliberately disturbed original collector 180 WU in front of it, before native admission. At phaseAnchorTick+600 the shared forecast has120ticks remaining and the collector is inside the actual authored cone, but remains outbound and aims inward (-2.205744379 radians). No claim is made that the undisturbed route normally occupies that location.

The candidate reads existing phase and frame geometry. A safe outbound collector whose intended path crosses the local cone holds; a collector already exposed, or a collecting worker whose next leg enters it, uses the existing physical clear-band and return route. Cone side planes and radius are conservatively expanded by the actual hull radius. No global storm flag, force change, new cargo, price, reward, clock arrival or separate weather record. Normal physical berth arrival remains required before restarting work.

Owned paths: src/systems/anvilWork.js; src/world/anvilOrchardWorkWeather.js; src/data/contactHail.js; test/anvil-work-rematerialization.test.mjs; this handoff. Other source owners are untouched.

The existing target WORK line and collector Hail ROUTE now explain local forecast/gust holds and current corridor clearing. Ordinary heat/capacity clearance remains CLEARING BAND, not an invented weather cause. Current stable record identity, duplicates, replacement and foreign job ownership are checked; this projection never authorizes movement or changes saved state.

## Evidence

Two focused regression cases fail against unchanged public a8a9500 owner source: the exposed worker remains outbound; a safely positioned, inward-facing worker thrusts toward the forecast corridor instead of holding. The disturbed-worker pre-fix probe and failure logs are retained.

Production-profile, production-relative-order weather, native, Continue and Hail cases pass. The original six rematerialization cases are retained in the same existing CI-selected file, so no workflow change is required. This includes both actual native flight and real Save/Continue mid-retreat. Existing machinery registers the unchanged gust during each measured flight. No worker position, velocity, phase or cargo is edited during measured flight.

- No reload: actual cone exit15.5167s, physical berth65.4000s, resumed collect103.3833s.
- Native Save/Continue at120 measured ticks: cone exit15.5833s, physical berth65.4167s, resumed collect103.4167s. This is a restored simulation, not a bit-identical trace claim.
- Both retain the one original collector, hull200 and empty finite manifest. They start from explicit disturbed-worker setup at10simseconds. These tests do not prove that ordinary undisturbed flight always meets this corridor.
- Save/load also preserves the existing clear-band phase and safe outbound hold, unchanged finite Orchard ledger and worker manifest. Missing or stale planet-cache pointers retain warnings from the live authored frame, matching the force owner. Only genuinely removed/destroyed/away-sector sources suppress the local warning.
- Adjacent original normal-work/hardware checks14/14 pass. Unchanged original undisturbed native route transfers5units to the real receiver at123.9167s; no actor pose or phase edits during that measured delivery. Existing manifest capacity, once-only transfer, claimed movement ownership and hardware restoration assertions remain intact.

- Short native safe-hold check: through the actual forecast/gust boundary the worker remains outside the cone and departs on calm at17.0333simseconds. It drifts43.9735WU under existing forces; this is a bounded safe hold, not position lock or weather immunity. Three actual native model-pose snapshots are retained for an honestly labeled offline reconstruction, not game-camera acceptance.

Immutable public projection on freshly verified a8a9500ab87e1bcff91c407e96f744a52202a134:29/29 native/work/weather/asset-census cases,21/21 original Hail cases and9/9 ordinary player input, field-arrival and residency cases pass. Actual source/release GLBs are read from public Git blobs; an earlier local census ENOENT was a sparse local-file issue, not absence from GitHub. Final short hold case is validated on the final tree separately; runtime source blob identities remain identical. Only five new Hail lines are projected over public source; canonical unrelated world additions are excluded.

Independent review caught and resolved stale planet-cache lookup divergence: the worker now uses the same live exact-authored-frame fallback as the force owner. An adversarial in-place identity test caught cached entity-index reuse; the status projection now additionally checks the current stable record ID. Earlier failed tests and WIP are preserved.

The normal-flight fixture contains the relevant production owners, not the whole game, rendered UI, or a physical device. Browser/live-camera, full player-truth acceptance and whole SF20-14 completion remain unproven. Source, exported, reviewed, published, integrated and accepted are separate states. All eight larger goals stay open.

Next: independently review and validate the exact public-tree projection, then integration approval before draft publication. No pending model or archive approval operation is retried. No browser/live-camera or target-device acceptance is claimed.
