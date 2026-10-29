# Whole-game integration status

Updated 2026-10-29. This is the current cross-lane handoff for the Finish Program. Detailed packet
source coverage is summarized in [SOURCE_COVERAGE_2026-10-29.md](./SOURCE_COVERAGE_2026-10-29.md);
the attached design target and Swarm-specific gaps are in
[SWARM_RENAISSANCE_GAPS.md](./SWARM_RENAISSANCE_GAPS.md). The lane boards remain authoritative for
active assignments. A source read or focused test does not establish ordinary-route acceptance.

## Current player-facing evidence

| Area | Result | Remaining material outcome |
|---|---|---|
| Swarm spawn/motion observation | Published fix `4a5e683497e` corrected observer overflow and unmapped-player attribution. Corrected offline idle and active captures report zero anomalies without changing the 8 WU/s physics limit. | The original whole Swarm gate remains FAIL: the default pilot died in wave 2. Do not claim whole-mode acceptance. |
| Ordinary Foundry Fortify | Headed public run `24057` closed after 892 simulated seconds / 25 minutes: cleared waves 1–6, reached wave 7 alive, and used all four devices plus repair/rearm through public controls. | Verdict is FAIL solely for 15 offscreen-marker misses (`no living shooter` near sim 727.9). Other core controls, round resolution/transitions, spawn motion, ships, and VFX passed. Readability and frame time remain UNKNOWN. The ten-wave/boss journey is not accepted. Original verdict/artifacts: `.devshots/finish/integration-2026-10-29/foundry-ten-wave-route/`. |
| Hero Maneuvers | M02 public route banked, committed a bomb, and returned through phase alive; the target survived, an allowed miss. Pinball charged its physical dash and reported target lost with zero contacts; native contact behavior has separate focused coverage. | No public contact or complete three-ability experience is claimed. Boomerang/readout and readability remain under their owners. |
| Adventure | 300.9 simulated seconds reached; core route/control checks passed. | Overall verdict remains INCOMPLETE for readability and performance authority. |
| NPC weapon behavior | Published `a41981ae13a`: NPC fixed mounts and turrets aim from the actual muzzle; six focused cases pass. K1 measures actual disabled intervals; SG06 preserves real multi-ship convergence. Ladder totals preserve future history without counting it toward current unlocks. | These focused results do not establish broad combat-route acceptance. |
| Startup/rendering | Published fixes include required opening residency and shadow-batch retirement. The 414-package release-pin check passed on the candidate before later gameplay edits. | Current stable baseline and full opening performance remain to be checked after integration settles. |
| Whole game / final phase | Source packets are tracked below; targeted repairs have landed or are being integrated. | Final build-map closure, final stable checks, remaining gameplay routes, and the requested last-300-commit review remain open. Do not mark the game finished. |

## Current integration follow-up

The Fortify, Hero Maneuvers, Borrowed Sun registration/save, and main-lane presentation changes
remain a local integration candidate. Their dependencies must ship together; they are not yet
available to cloud agents from master. The current bundle builds all 414 shipping render packages.
A duplicate Hero readout property reported by the bundler was removed.

- `c2f5714f570` fixes the offscreen observer: lit detonator fuses and their danger bands are
  intentionally marker-eligible. Its seven focused cases pass; the earlier route verdict remains
  the original FAIL. The same commit coalesces callout seating and rejects unrelated NPC impacts.
- The same-flight callout ABBA showed 24,077 immediate seat requests versus 202 coalesced requests
  in its first wave-one pair. Wave/event load changed in later blocks, so this does not establish
  an isolated whole-frame FPS gain. Latest player-impact filtering still needs current budget
  measurement. Fresh integrated-GPU profiles currently receive a suggestion, not automatic quality
  selection; no unmeasured quality reduction was applied.
- `8f39f12dcb3` stops paused construction/refit overlays retaining duplicate flight bodies.
- `f5d1a0831dd` isolates Helix campaign consequences/deadlines from Swarm runs.
- Atlas query-array protection (`618983f7e9e`), forward-compatible motion profile stamps
  (`441a58ef6ce`), copy-owned fallback transport (`7e649f5274d`), and actual map station type
  symbols (`ff8d63cfb54`) are published with focused checks. The actual scrolled map was inspected.
- The Pallet Jack candidate now captures the original 60-WU/s dumped payload through the native
  clamp in a production runtime. The committed drift and objective identity survive its warning;
  player-changed motion remains an escape. The ordinary purchased-and-dumped cargo route also
  passes unchanged encounter pacing, two cold Continue restores, and nonlethal parley recovery.
- Fortify turrets now deliberately acquire live Brood targets through the existing spatial grid,
  then fire canonical projectiles. The new regression includes real collider occlusion and ammo.
- Hero combined fittings now refuse conflicting Veil/Pinball/Boomerang Shift ownership; the actual
  Hero-to-V3 input regression passes.

## Published changes relevant to integration

These SHAs are retained as navigation pointers, not as substitutes for current-tree review:

- `4a5e683497e`: observer capacity/RPC and player attribution corrections, live first-birth spawn
  checking, and hazard cleanup. Corrected offline idle/active traces passed; the original public
  Swarm failure is still open.
- `88474f40e9d`: world payment, refused-spawn, custody, lifetime, encounter-retirement, and touch
  release fixes; relevant focused suites passed.
- `a1291970946`: restored authored landmark GLBs to canonical loading and measured parts/station
  registration; atlas, manifest, wiring, and release-pin checks passed.
- `637f67c8d0b`: scoped first-flight residency to required opening subjects while retaining declared
  zero-count pools and mobile policy; focused checks passed. No causal performance improvement is
  claimed from the visible route alone.
- `742cc8ebf97`: station scroll ownership and service copy; native bottom-row reachability and
  desktop/touch activation were checked.
- `5d969ed4ff3`: disposed shadow-batch retirement and expected inactive-owner cancellation.
- `281feb86a2f`: admission deadlines/priorities and itinerary memo identity.
- `78c6370f974`: recycled presentation occupants, retired stage-load cancellation, warmup boundary.
- `1fd0cb94323`: authored VFX flash velocity.
- `4282a6bdbcc`: stale RCS action/node references.
- `6c8aaaee9f1`: mounted readmission residency.
- `d23c3aac5c8`, `8e2fedc8e01`, `2df8bb0d53c`, `c3315a4098c`, `f02310a2e96`, and
  `321e6d287a9` are earlier bounded loader, test-fixture, runtime identity, authored material,
  save/tutorial, and Swarm opening repairs recorded in the prior integration history.

## Source coverage state

The durable packet matrix is [SOURCE_COVERAGE_2026-10-29.md](./SOURCE_COVERAGE_2026-10-29.md).
Packets U001–U072 are reported source-complete in their source notes or prior integration record;
U049–U054 and U061–U066 have now closed with their owner notes. This is source coverage only;
packet completion does not imply gameplay acceptance.

The detailed packet notes and capture artifacts referenced by that matrix live under the ignored
local `.devshots/finish/integration-2026-10-29/` tree. They are not part of the repository and are
not visible to cloud agents; the current summary and acceptance status are recorded here.
