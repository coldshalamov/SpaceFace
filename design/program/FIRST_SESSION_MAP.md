<!-- LIFETIME: EVOLVES — re-verify against live data before citing numbers; owned by the first-session experience lane -->
# The First Session — playtime map and design law

Status: working design document for the new-player experience, opened 2026-10-13 after a full
census (placed assets, content systems, minute-by-minute play map — three audit passes, all
numbers below verified against live data the same day). This file is the map of what a new
player actually does and the law for changing it. It supports, never overrides, `VISION.md`.

## 1. The route as it plays today (minutes 0–60)

| When | What happens | Authored by |
|---|---|---|
| 0:00 | Spawn at (0,0), Helios Prime. The 47-A tableau is already around you: evidence spindle 92 WU, hauler on the freight leg 186 WU, rescue pod, staging pod, tally post. | `47aLiveScene.js`, `sectorAnchors.js` |
| 0:00–12:30 | The 12-beat rail: tether → raid (swing the raider into the rock) → claimed salvage (real WANTED choice) → thrust → brake → trainer → burst → disengage → mine → dock → choose. One verb per beat, ≥4 s silence. | `onboarding.js` BEATS |
| ~1–3 min | Guaranteed day-0 raid: pirates hit the working ore barge. Defend / rob / fly on — each leaves a real story. | `344-opening-hauler-raid` |
| ~9–13 min | Guaranteed day-0 wonder: the Candle Relighting — the Fleet tenders walk 24 lamps past you toward the memorial. Follow and the dark plinth introduces itself. | `585-candle-relighting` |
| ~12:30 | First dock. B0 pays +400 cr; the hub opens (8 tabs); board shows starter job + 3 choice offers + first trade + one moral-trap row. | `missions.js`, `economyContracts.js` |
| ~15–35 min | The Ceres run: first trade (760 cr, tolls 440 — net +320), refinery corridor placements, fuel-cell glut at Ceres. | `first_trade_loop` |
| ~35–60 min | Work loop: seam iron (~30.8/u at the Helios shortage), story set pieces B1–B3 (+600/+800/+1000), board jobs. Bank ≈ 8.5–13k cr; first big module (12k ring) or the Pelican (12k) is 2–3 h out. | `starterJobs.js`, story beats |
| Day 2 | Guaranteed yard towout — the claim cracker's intake, a dying hauler, the tow verb. | `346-yard-towout` |
| Any shift | Bar lead at Helios names the Fleet shift and the drift line past it. | `frontierRumors.js` |

Speeds: starter cruise ≈ 140 WU/s, V-cruise ≈ 560, travel lanes ≈ 1100. **Nothing in Helios is
more than ~35 s away.** Dead time is content-shaped, not time-shaped: every chord now carries
something (see §3 placement table).

## 2. The ladders (guaranteed experience, seeded, never random-deprived)

1. **Verb ladder** (the rail): tether → swing → claim → thrust → brake → flyby → burst →
   disengage → mine → dock. One new verb per beat; the rescue-verb gates route swaps.
2. **Encounter ladder** (day-0..2 guarantees): raid `344` d0 [60,170] → relighting `585` d0
   [540,810] → salvage tail `367` d1 [180,420] → yard towout `346` d2 [420,780]. Every pinned
   window sits clear of every organic ceiling (~530 s) and of the other windows — two pinned
   windows must never overlap-adjacent within a sector-day, or the 45 s spacing pass wedges
   (this was a real bug; the windows above are proven clear, `test/first-session-places`).
3. **Story spine**: B0 cold start → B1 wrecking ball → B2 pod rescue → B3 long tow → B4 pick a
   side → B5–B7 faction chains. B0–B3 land inside the first hour; B4+ is hour two.
4. **Mystery ladder**: the fleet shift (wonder) → the dark plinth (quest) → the Pit Line (the
   answer, a place) — each rung reachable from the last, each taught by the previous one.

## 3. Placement law — every chord carries something

Chords a new player flies, and what stands on them now:

| Chord | Length | On it |
|---|---|---|
| spawn → tutorial beacon → seam → station | 0.4–1.3k wu | the furnished corridor (10 POIs, lane furniture) |
| station → Ceres gate | 4.2k wu | lane beacons, ambush segment, `the margin` radio |
| Ceres arrival gate → refinery | 4.7k wu | Refinery Flare Rack, Inbound Weigh Pin, Kettle Line, RU-7 |
| station → Coalition HQ | 2.7k wu | Checkpoint Niner (customs waypoint) |
| memorial → Pit Line | 1.1k wu | Smear Marker 7 (the procession walks this bearing) |

Law: **no chord a new player must fly may be bare.** A bare chord is a bug, not whitespace.
New placements follow `PLACE_REGISTRATION.md`: manifest-listed GLB only, authored anchor,
discovery plate, atlas green.

## 4. The teaching trades (economy law)

- The first trade must **clear its own tolls with a worker's margin** (authored 760 vs 440
  tolls; the old 307-vs-440 taught "trade loses" — fixed 2026-10-13).
- The starter loops are authored truth: seam iron → Helios shortage (0.09); cells → Ceres
  glut (2.4) → Hyperion Cut claim shortage (0.1), taught by its own bar lead; rations → Drift
  glut (2.4) → Belt Outpost shortage (0.1), taught by the Drift bar lead (new).
- Every station a new player can reach in hour one posts **work** (Ceres gained the refinery
  contracts desk — the first gate destination was a market with no jobs).
- Rumors name real places, never vapor: an authored dock rumor is a promise that the thing is
  flyable from that dock.

## 5. Known gaps, ranked (the next units)

1. **First-dock hub dump** — 8 tabs and one one-time hint; the code itself names it the
   biggest cliff (`onboarding.js:649`). Candidate: staged tab reveal keyed to the B12 choice.
2. **Beat unlock flags have no reader** — B0 "unlocks" `mod_mining_laser_s` (price 0, already
   fitted) and B2 `wpn_pulse_laser_s` (already fitted); `_advanceStory` writes
   `story.flags['unlock_<id>']` and **nothing in ships/tech/outfitting ever reads it**
   (verified by grep 2026-10-13). Either wire outfitting gating to the flags or re-purpose
   the reward; changing the id alone is cosmetic. `missions.js` is hot — checkpoint first.
3. **B0 grants a dead unlock** — folded into (2): the reward needs the reader decision first.
3. **Broke-at-the-gate cliff** — the gate hard-rejects without credits and Ceres was the only
   toll neighbor; mitigations (hardship rescue, dry-tank grant) are invisible. Candidate: the
   gate rejection line names the hardship rescue.
4. **`place_asteroid_graffiti`** — authored painted rock, never placed. Needs per-instance
   authored-asteroid pinning (a new mechanism) or a new asteroid type (galaxy-wide). Not wired
   casually.
5. **Dock interiors** — `place_dock_interior_{grit,military}` orphans; fill
   `DOCK_INTERIOR_BY_ARCHETYPE` (`src/ui/shipPreviewMount.js:60`) so mining/military stations
   stop showing the generic bay.
6. **Sector identity pass** — 13 sectors have zero authored machinery, 19 no optic structure;
   `sker_haven` and `veil_nebula` are the hollowest core sectors. The per-sector pocket
   program (CR-HOLLOW-4) gives every sector a shift; machinery/optics give them a face.
7. **Vesper has no second act** — the richest character stops at `encore`. A chronicler line
   or rumor on `performances > 0` would close it.

## 6. Verification contract for this lane

- `npm run check:atlas-integrity` after any placement.
- `node scripts/check-encounter-director.mjs` after any trigger change (the 45 s spacing law
  bites here first).
- `test/first-session-places.test.mjs` pins the ladder, the chords, the rumors, the trade.
- `test/first-trade-contract.test.mjs` pins the corridor rate (760).
- player-truth `--mode=adventure --gate` before landing anything that touches the played
  route; on this shared box treat software-GL frame-time deltas as noise and say so.
