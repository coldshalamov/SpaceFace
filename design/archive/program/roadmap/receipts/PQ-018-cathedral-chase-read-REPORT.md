# PQ-018.cathedral-chase-read — REPORT (Wave 1 partial)

Status: PARTIAL — corridor half specified, wired, and tested green; hull-shell + approach
activation remain for a follow-up with GLB/manifest/traffic-pin ownership.
Date: 2026-09-17. Implementer replaces stalled predecessor. No commits, no staging, no queue
flip, no NOW.md edits (controller lands).

## Targets (DONE WHEN)
- [~] Arrival pose at 144 WU → Cathedral covers ≥25% of frame, every roster hull keeps
  world-site-map-traffic proxy clearance — CORRIDOR PROVEN, NOT ACTIVATED (see below).
- [ ] 144 WU cavity view reads as plated sections not lattice — needs GLB shell authoring.
- [~] Cathedral tests + Ceres topology gate + corridor asset gate green — 11/11 traffic,
  9/9 cathedral, topology PASS; admission file + corridor gate ENV-BLOCKED (see Checks).

## Defect analysis (measured, live chase camera: fixed heading south, 60° tilt, 50° FOV, D=144)
- Arrival frame at coursePos P0=(+437.6,-46.0 rel C): x-window [318.6,556.6] vs hull proxy
  edge x=+332 → only the far-corner sliver shows. Measured proxy-envelope screen coverage
  at P0: 0.03% (exact pinhole projection, 160×90 NDC grid, 7 solid proxies).
- The camera looks south, so only the hull's NORTH face can fill the frame; the east
  approach looks down the hull's long axis (foreshortened + out of frame).

## Fix delivered (approach half): proxy-clear framing corridor
- `CERES_WRECK_CATHEDRAL_CHASE_READ_CORRIDOR` (new frozen export) + `chaseRead` key on the
  cathedral manifest. Autopilot still targets coursePos (440 pins untouched, per additive-only
  traffic-test constraint); the corridor is the proven keep-clear path and activation target.
- Waypoints (global_v1, rel C in parens): P0 arrival (+437.59,-45.99) → W1 (P0.x,-300) →
  W2 (0,-300) → hold H (0,-240). Reservation envelope (620) untouched; corridor inside it.
- Clearance (min over 7 solid proxies, 14 roster hulls, asserted per leg/hull/proxy in-test):
  leg0 Leviathan ≥60.5, leg1 ≥37.0, leg2 ≥12.1; small hulls (r≤16) ≥41.1 everywhere;
  hold static: Leviathan +12.18, Hornet +41.18. Two-tier bar mirrors the existing
  all-hull-arrival / Hornet-transit split: small hulls >20 WU, every hull >0 (safe).
- Framing (same exact pinhole metric): hold H proxy-envelope screen coverage 26.85%
  (≥25% ✓), arrival 0.03%. Candidate sweep: z=-230: 31.45%/Lev+5.19; -240: 26.85%/+12.18;
  -250: 22.29%/+19.55; -260: 17.81%/+27.25. Ground-area estimates overstate coverage by
  ~2× (perspective); screen fraction is the honest metric and is what the test asserts.

## Files changed (owned paths only)
- `src/data/worldSiteManifests.js`: +corridor export, +`chaseRead` manifest key. No existing
  value touched (coursePos/radius/proxies/placement/visualRadius/ops all byte-identical).
- `test/world-site-map-traffic.test.mjs`: +106 lines appended (projection helper + 1 test);
  all existing pins preserved exactly (440/bearing/gaps green).
- This receipt (new).
- Deliberately untouched: cathedral .blend/source GLB/release GLB (byte changes would desync
  parts_manifest.json + release_manifest.json, which are dirty-foreign under PQ-195.00 and
  outside my paths — rebind must happen in one transaction with those files owned);
  `src/data/worldSiteAssetBindings.js` (no GLB change → no rebind; +34 foreign dirt preserved);
  `test/pq018-wreck-cathedral-admission.test.mjs` (hash pins stay 7c2f3fcd/32094bcd).

## Checks (each tried once; shell worked, no approval stalls)
- Baseline (pre-edit): `node --test` trio → 26/26 PASS (9 cathedral + 7 admission + 10 traffic).
- Post-edit trio: 20 pass (9 cathedral + 11 traffic incl. new corridor test ✓) + admission
  FILE errors: `Cannot find package 'three'` — environment regressed mid-session (three
  resolved at baseline; `node_modules/three/package.json` now missing; another lane's
  doing). Admission file is byte-identical to baseline and outside my import graph. Seeds:
  repo fixed seed 47 where used; new test is deterministic geometry, no RNG.
- `npm run check:pq020:ceres-topology` → PASS (exit 0) with manifest change; itinerary names
  Wreck Cathedral; structural cost / agreement / course-target rows hold.
- `npm run check:pq022:corridor-assets` → ENV-BLOCKED (same missing `three` via
  partsLibrary.js). Tried once. Re-run in a healthy env at land time.

## Done-when numbers
- Before: arrival coverage 0.03% of frame (corner sliver); cavity reads as dark bars (GLB).
- After: corridor hold coverage 26.85% (proxy envelope); arrival pose itself unchanged
  (activation needs traffic-pin ownership); cavity read unchanged (needs shell authoring).

## Remaining work (exact)
1. Shell authoring (defect 2): plate the chase-visible faces — especially UPPER-ROW NORTH
   faces (what the hold sees) + cavity-mouth surrounds. Material-truth preflight required.
   Keep: coordinate, 12 markers/sockets, LOD strict order, materials, transforms. Keep new
   shell out of the corridor keep-clear volume (legs above) or extend proxies with pin
   ownership. One in-session D=144 still from hold + cavity, then deleted.
2. Rebind in ONE transaction: source GLB + release GLB (sanctioned build only — it rewrites
   release_manifest.json, currently dirty-foreign) + parts_manifest row + release_manifest
   row + bindings.js cathedral hashes + admission test pins. Coordinate with PQ-195.00.
3. Approach activation (defect 1 full close): re-point coursePos at H (or staged approach)
   + update traffic-test 440/bearing/gap pins. NOTE: H as an autopilot target is unsafe for
   big hulls (Leviathan arrival disk would overlap proxies); activation may need per-hull
   targets or a staged approach. Brief allows shell-only close via the manual corridor.
4. Re-run in healthy env: trio + `check:pq022:corridor-assets` (both blocked today by
   missing `three`, not by this diff).

## Unfinished (one sentence)
Hull-shell authoring, the hash-rebind transaction, and approach activation remain because
they need GLB bytes + manifest JSONs + traffic pins outside this unit's owned paths.

## FIX RECORD (controller close 2026-09-17)

- Exact pins landed (reviewer gap): new test `Cathedral chase-read corridor pins
  exact minima, coverage, and visualCenterXZ` in `test/world-site-map-traffic.test.mjs`
  (+1 import, +1 test, zero existing lines touched). Per-leg all-hull minima
  60.58963396203944 / 37 / 12.175876270150383 and small-hull minima
  89.58963396203944 / 66 / 41.17587627015038 (all Leviathan / Pelican argmins —
  the Wave 1 receipt's "Hornet +41.18" named the wrong small hull; Pelican is the
  binding minimum), hold 12.175876270150383 / 41.17587627015038, frame fractions
  0.2685416666666667 (3867/14400 cells) at the hold vs 0.0002777777777777778
  (4/14400) at arrival, `visualCenterXZ` deep-pinned to `{ x: 16.00636548,
  z: -12.99468677 }`. Wave 1's rounded numbers (60.5/37.0/12.1, 26.85%, 0.03%)
  all check out as floors of these exact values. Traffic file now 12/12 green.
- ACTIVATION ANALYSIS (clause (a) close — why no naive coursePos retarget): the
  map resolves `coursePos` into a single-pos `ui:setCourse` waypoint
  (`galaxyMap.js:1908-1936`), and the autopilot flies DIRECT lines. Re-pointing
  `coursePos` at hold H would send every hull down the unproven straight segment
  P0→H, cutting across the corridor the Wave 1 test proves — worse than today's
  safe arrival. A data-only retarget is therefore UNSAFE and was deliberately not
  done. Correct activation is a staged approach owned by the map/autopilot lane:
  consume `CERES_WRECK_CATHEDRAL_CHASE_READ_CORRIDOR.waypoints` as ordered
  `setCourse` legs (P0→W1→W2→H), with per-hull gating (r≤16 full corridor to H;
  big hulls hold at W2 or a wider offset — H's +12.18 Leviathan gap is static-only
  and the 48 WU arrival disk needs owner analysis). The corridor test above is the
  acceptance contract for that lane: legs stay clear, hold frames ≥25%.
- Residual (exact, unchanged + activation spec): shell authoring (UPPER-ROW NORTH
  faces + cavity mouth, preflight, keep-clear volume, `visualCenterXZ`
  byte-identical) → one-transaction rebind (sanctioned release build + both
  manifests + bindings + admission pins, coordinated with PQ-195.00's manifest
  ownership) → staged-approach activation per the spec above (map/autopilot
  owner). Shell-only close via the manual corridor remains brief-allowed.
