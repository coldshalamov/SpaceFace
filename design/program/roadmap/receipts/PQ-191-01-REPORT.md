<!-- LIFETIME: ACTIVE_RECEIPT -->
# PQ-191.01 — Senior taste review of the 2026-09-06 flash batch

```text
DONE  PQ-191.01 — all six taste calls from the flash batch are ratified with their owner-word justifications, verified against focused test suites, and logged with senior-review lines in each of the five batch receipts.
WHAT I FOUND     Five fast units landed with six explicit taste choices left open for a second pair of eyes: reporting UI grammar debt rather than failing red, fixing the Cinder Run Courier to a deterministic traffic slot, dressing one-offs with packaged assets, corkscrew wave parameters on plumes, polarity in feel-bar assertions, and prose-with-guards for density layers.
WHAT I CHANGED   Ratified each of the six taste calls in owner words with causal grounding; verified the live contracts, scenario checks, and budget tables without weakening any assertion; and recorded senior review lines across all five flash-batch receipts.
WHAT YOU WILL FEEL   When you play, the starter route has distinct landmarks and an express courier streaking past at nearly five times normal convoy speed; tumbling ships corkscrew their exhaust trails proportionally to their spin; feel bars fail loudly quoting their own sentences if damaged; and UI grammar debt remains an honest, tracked list that has already been driven down from twenty-four surfaces to one.
THE NUMBERS      taste calls ratified | 6 of 6 · flash batch receipts annotated | 5 of 5 · focused scenario & unit tests verified | 11/11 hitstun, 3/3 world reaction, 14/14 perf-budget contract, 6/6 plume wobble, 2/2 contrail corkscrew, 24/24 dynamic buffer ranges, 6/6 world one-offs
THE FRAMES       none — this unit is an independent taste review and verification of landed work; GPU/browser ban observed.
NEXT             PQ-191.00 or campaign dispatch
```

## The six taste call verdicts

### 1. Grammar debt is reported, not fatal (PQ-184.00)
- **Verdict: RATIFIED.**
- **Owner sentence:** Reporting grammar debt as named debt rather than fatal failure allowed the instrument to establish and guide optimization without breaking the build; the debt table was actively read by subsequent leaves (reducing debt from 24 surfaces to 1), and `--strict` is owned as the terminal gate for PQ-184.
- **Record:** If PQ-184.00 had gated immediately on the grammar budget, the build would have gone red for 24 surfaces across the entire application while the instrument was still being established. As subsequent leaves landed (PQ-184.01 virtualized long lists, PQ-184.02 bounded hot surfaces), the debt table was actively read by the controller and implementers, driving debt down from 24 surfaces to a single remaining surface (`asteroid-works` at 2.875 ms mean). The teeth remain in `--strict`, which is owned as the final gate to close PQ-184 once `asteroid-works` is brought under 2 ms.

### 2. The Cinder Run Courier is a deterministic traffic fixture (PQ-143.02)
- **Verdict: RATIFIED.**
- **Owner sentence:** The Cinder Run Courier as a dedicated deterministic express traffic fixture (`_ensureCinderRunCourierFixture` at 247 WU/s) provides reliable starter-route whimsy and scale without seed lotteries or disrupting Ceres's authored cast.
- **Record:** Spawning the courier as a pick-pool candidate was rejected in review because it diluted Ceres's authored seam miner on certain seeds and made her presence a ~25% seed lottery in Helios. The dedicated `_ensureCinderRunCourierFixture` seam stamps an express freighter in the start sector every pass, ignoring the single-contact cap so the sector's picked ambient contact still appears alongside. Her 247 WU/s V3 boost intent vs 52 WU/s courier cruise (4.7× speed) gives every player flying the default route an unforgettable taste of high-speed convoy traffic.

### 3. One-off set-piece art reuses packaged props (PQ-143.02)
- **Verdict: RATIFIED.**
- **Owner sentence:** Reusing packaged props (`place_dead_hulk`, `place_memorial_array`, `place_aftermath_wreck_ore_freighter_bow__derelict`) with unique sector placement, cluster arrangement, and dedicated rotation tick (the tug's 0.32 rad/s spin) creates specific landmark identity without asset bloat or unauthorized hull release.
- **Record:** Fielding held-back hulls (`yard_tug`, `volatiles_tanker`) without owner sign-off was rightly rejected. The set pieces achieve memorable individuality through placement and physics: the abandoned tug slowly turns at 0.32 rad/s off Ceres Refinery; the strut shrine is unique in Ceres Belt across the approach lane; the Grey Family Pods cluster 8 distinct habitat and cargo shells; and the massive freighter-bow hero dwarfs Helios Station. They read as specific local history rather than recycled dressing.

### 4. The plume corkscrew numbers (PQ-139.04)
- **Verdict: RATIFIED.**
- **Owner sentence:** Plume corkscrew parameters (4.5 WU enemy amplitude, 2.0 rad/s saturation, 0.35 rad/WU wavenumber; 6.0 WU player contrail offset; 0.35 reduce-motion scale) correctly match hull dimensions, plume lengths, camera perspective, and accessibility standards.
- **Record:** The 4.5 WU maximum lateral swing matches the physical width of typical enemy combat hulls, reading as a clean 1-hull-width oscillation at chase distance without detaching from the nozzle. The 2.0 rad/s saturation reflects the boundary between controlled maneuvers and violent tumble. The 0.35 rad/WU wavenumber produces ~1 full corkscrew turn across an 18 WU visible plume length. The 6.0 WU player contrail offset provides clear lateral spiral at the player's close chase camera, and 0.35 reduce-motion scale preserves the directional information while softening vestibular stimulus by 65%.

### 5. The bars-as-checks polarity (PQ-186.00)
- **Verdict: RATIFIED.**
- **Owner sentence:** B11 correctly avoids pinning the owed collision-source defect red to prevent freezing it against repair while guarding against any second unmet clause; B10 separates the PQ-138.03 wreck-momentum rider into its own assertion to preserve causal attribution in failure messages.
- **Record:** Pinning a known defect red freezes it just as pinning it green does (repairing the defect would cause a test failure). B11 pins that at most one clause may be unmet and it must match the owed collision source; any new defect immediately fails red, while fixing collision allows the suite to pass cleanly. B10 separates its three contract clauses from the PQ-138.03 wreck-momentum rider so a wreck physics regression cannot masquerade as an ambient NPC reaction failure.

### 6. PQ-144.00's budget table lives in PERF_BUDGET §8 (PQ-144.00)
- **Verdict: RATIFIED.**
- **Owner sentence:** §8 budget table and honest boundary live in `design/PERF_BUDGET.md` guarded by per-§13C-packet runtime witness evidence rather than brittle static thresholds in code.
- **Record:** The 21 rows across foreground, midground, and background define architectural invariants and honesty boundaries across disparate subsystems (sim, AI, VFX, culling, sector lifecycle) that cannot be reduced to a single scalar in code. Placing them in `PERF_BUDGET.md` §8 makes them part of the core performance contract alongside §§1–7, enforced empirically by runtime witness reports (`npm run probe:runtime-witness` before and after every §13C packet).

## Verification evidence

- `node scripts/check-perf-budget-contract.mjs` → PASS (10 required, 4 forbidden checks OK).
- `node --test test/hitstun-curve.test.mjs` → PASS (11/11 tests green, including B11 contract sentence and real-path SG-02 physics).
- `node --test test/world-reaction-bars.test.mjs` → PASS (3/3 tests green, including B10 three contract clauses and PQ-138.03 rider).
- `node --test test/plume-spin-wobble.test.mjs` → PASS (6/6 tests green, amplitude 4.5 WU, saturation 2 rad/s, wavenumber 0.35, reduce-motion 0.35).
- `node --test test/dynamic-buffer-ranges.test.mjs` → PASS (24/24 tests green, stride 20, instanceSpin at offset 18/19).
- `node --test test/contrail-corkscrew.test.mjs` → PASS (2/2 tests green, 6.0 WU player amplitude, 2 rad/s saturation).
- `node --test test/feel-bars-contract.test.mjs` → PASS (4/4 tests green, 12 checked bars wired into smoke, verbatim contract sentences).
- `node --test test/feel-shove-bars.test.mjs` → PASS (4/4 tests green, real-path Rapier shove bars).
- `npm run check:baseline` → ran at candidate base; 13/15 green (2 pre-existing failures documented: `render-package-plan` missing `assets` in this sparse checkout, `massline` auto-target missing active `src/ui/kit/palette.js` from concurrent kit mutation row).

## Controller verification — 2026-09-07

Re-ran on primary master: hitstun-curve + world-reaction-bars + plume-spin-wobble + contrail-corkscrew + feel-bars-contract = 26/26; `check-perf-budget-contract` OK. Courier fixture and 247 WU/s express speed are live in `traffic.js`; tug spin 0.32 is live in `worldOneOffs.js`. Remaining grammar debt named by PQ-184.02 is Asteroid Works, not a silent shrink of the original 24. All-ratify accepted: the six calls were real taste forks, not defects, so no owning-code edit was required.
