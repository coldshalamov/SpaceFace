# Handoff — where the build stands (checkpoint 2026-11-11 ~04:40 UTC)

Read in this order: this page → `PLAYBOOK.md` (how the work runs, the four programs) → `QUEUE.md`
(every job and its state). Lead = the strongest model available; workers = Devin SWE-2 Max ×3
(`devin1..3`) and Gemini Flash (`flash`) via `node scripts/fleet/run.mjs <PACKET> <backend>`.

## 1. First thing to do in the next session (in order)

1. **Check the folder is clean.** `git status --short`. The machine was shut down while jobs ran; any
   dirty file is a half-finished job. Match it to the in-flight list in §2. If the job committed
   (`git log --oneline -15`), the dirt is someone else's. Otherwise preserve it on a `parked/` branch
   (recipe in `PLAYBOOK.md` §1 and the PARK-01 packet) and re-run that packet from the start.
   - **Already dirty at checkpoint and NOT from the fleet:** `index.html`, `src/ui/bootEntry.js`,
     `src/ui/bootMediaPlayback.js`, `styles/boot-visualizer.css`, `test/boot-media-playback.test.mjs`
     (an outside agent made the boot movie wait for in-memory playback; hold raised from 9 s to 20 s).
     Its owner is unknown. Do not commit it blind; park it and review it (a 20 s boot hold is long).
2. **Run the gate on a quiet machine** (no workers running): `npm run gate`. Then push master.
   **Pushed at checkpoint:** master is on origin at `c233f72a` (quick gate PASS before merging 38
   incoming UI-polish commits from origin; import lint PASS after; the full gate has not run since).
3. **Review the BUILT rows** in `QUEUE.md` that are visible on screen (lead looks before `DONE`):
   G19-01 class-up plate, G08-01 enemy colours/sizes, C01-01 win screen, G18-03/04 camera beats, boost
   ring, puffs, PERF-02a (fly it: does the ship still flick?), the plants. Use
   `npm run player-truth -- --mode=swarm --start-round=N --out=<dir>` for Swarm shots.
4. **Start PERF-01** (seven on/off experiments) on one Devin with nothing else running, then write
   PERF-03 from its numbers. Performance is the owner's biggest complaint after stability.

## 2. Jobs in flight at the checkpoint

| Packet | Worker | State at checkpoint |
|---|---|---|
| C01-03-keep-going | devin3 | started 04:25; if no `fleet(C01-03)` commit exists, re-run it |
| PLANT-NEXT | flash | running; check `git log` for a `plant:` commit and the plant list for a `CLAIMED flash` row with no `SHIPPED` (reset it to `OPEN`) |

## 3. What landed this session (all on master)

- **The fleet:** protocol, queue, runner with rate-limit resume, calibration, the playbook, recon
  drafts (`drafts/`), and this handoff.
- **Feel:** one feel in both doors (Pull yanks, Shove punches, thrown bodies hit ships; preview matches);
  camera beats on light kills and throws; boost to 2× cruise with a ring; redline shake; ignition cough;
  turn puffs; engine pitch with thrust.
- **Freeze/perf:** one clock (speed gauge, backdrop, parallax and post time follow the drawn world);
  the player ship's pose is error-smoothed (no backward snaps; forward jumps 3–5 → 0 per probe run).
- **Stability:** launchers 10/10 (save-list probe, invisible error box, double launch), `npm run gate`,
  import lint (`check:src-imports`), worker bundle retries instead of 503, the `.//` boot break fixed.
- **Swarm:** start at any round (`?swarmRound=N`), enemies drawn at sheet size/colour, thirty-round win
  (`THE PIT IS YOURS`, Forge Regent), tests follow the course; keep-going in flight (C01-03).
- **Progression:** the rope's class-up is an on-screen event.
- **World reactions (plants):** PL-05 road rage, PL-06 tailgater, PL-52 thrown ship into a station
  (radio), PL-03 rubberneckers (scavenger half still open), PL-01 near miss.
- **Parked:** overnight Lane B's uncommitted work on branch `parked/overnight-lane-b-2026-11-09`
  (origin); packet PARK-01 lands it once its `check:sim` drift is explained.

## 4. Decisions already made (do not re-ask)

- **Swarm:** winnable at round 30, then optional "Keep going" into the endless course (owner: "see how
  far you can go").
- **Art direction:** a busy working harbour at golden hour — warm, readable, deep blue shadows not
  black, neon only as accents, bloom as a budget, one grade for the whole game (`PLAYBOOK.md` §3D).
- **Mobile, answering the four questions in `drafts/MOB.md` §7:**
  1. Phone throw = **flick while latched** (drag and release in a direction while the Line holds a body
     throws it along the flick). New row MOB-05.
  2. HUD contrast on the phone is in **MOB-02**; the world's brightness is LOOK-01.
  3. "Desktop framing" = the phone's default **horizontal** field of view equals the desktop default's
     horizontal world width (aspect-aware default zoom, ≈2× today's horizontal glass); pinch ranges from
     that out to 1.5× wider and in to 0.6×.
  4. Phones default to the **`low` preset** ("High performance": native raster, 30 fps cap); the
     `integrated` bundle stays opt-in.
  Order (from the recon): MOB-04 → MOB-01 → MOB-02 → MOB-03 → MOB-05. The phone HUD currently covers
  ≈ 50 % of a 390×844 screen.
- **Performance:** judged by two numbers only — main-thread idle ≥ 30 % and simWallRatio ≥ 0.98, same
  session A/B on a quiet machine. Root cause and order are in `PLAYBOOK.md` §3B.
- **DeepSeek:** out of rotation (90 min, nothing produced).

## 5. Known reds on master (not caused by this session's work)

`deep-sky-plate-pipeline` #9, `performance-dirty-ranges` (4), `render-target-pipeline-warmup` #25,
`pq-204-advanced-perf` #13/#19, `anvil-orchard-motor`, `ceres-five-minute-acceptance` (2),
`physics-sandbox-routes` (2), `pq-163-04-cliff` (2), and 30 Swarm/survival failures listed in the
C01-02 receipt. Row `KNOWN-REDS` in `QUEUE.md`. One open question on the one-feel change: the race test
`al-race-1-contested-line-4242` lost its anchored-lap margin on two Hard circuits — row `G18-REVIEW`.
