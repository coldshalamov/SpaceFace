# The playbook — how SpaceFace gets finished

Owner, 2026-11-10: "a beautiful, performant, fun and intuitive game with the tools we have … make sure
we know how to produce the optimal game so it doesn't die if this session does."

This is the operating manual. The **design** is written (docs 10–19 on branch EC-G13, the plant list,
the EC commission briefs). This page is **how the work runs**, what each program must reach, and what
to do next. If you are an agent resuming this: read this page, then `QUEUE.md`, then act.

---

## 1. The loop (every piece of work)

1. **Packet.** One job, written in `packets/`: exact names and numbers from the design, the seam in the
   code, the files allowed, a check the worker can run, a plain "done". No packet → run `RECON-NEXT`
   (a worker drafts the code facts into `drafts/`) and the lead adds the design decisions.
2. **Worker.** `node scripts/fleet/run.mjs <PACKET> <devin1|devin2|devin3|flash>`. Workers follow
   `PROTOCOL.md`: exact-path commits, never push, honest receipt.
3. **Review (lead).** Read the receipt and the diff. **Anything visible gets looked at** — a ui-bench
   shot, a player-truth contact sheet (`--start-round=N` for Swarm), or a clip. Workers never see the
   screen; "tested" is not "seen". Then `DONE`, or `REDO <one sentence>`.
4. **Gate.** After a batch, with the machine quiet: `npm run gate` (import lint → Adventure boot →
   Swarm boot → deterministic replay). Red gate: fix or revert the batch before anything else lands.
5. **Publish.** `git fetch`, merge (never rebase/reset), `npm run gate -- --quick`, push.

**The two rules that stop regressions** (the owner's "it breaks and regresses constantly"):
- **Nothing lands that has not booted.** The gate, not a unit test, is the bar.
- **No half-finished work lives in the shared folder.** Uncommitted work from a stopped agent breaks
  everyone's boot and replay. A lead who finds it preserves it on a `parked/<name>` branch (byte-for-
  byte, pushed), clears it from the folder, and queues a `PARK-` packet to land it properly.

## 1b. Machine safety (owner, 2026-11-11)

The owner's laptop (Dell Latitude 3550, integrated graphics) crashed hard twice this week while many
game copies, browsers and agents ran at once; Windows also logs corrected PCIe errors on the SSD's
root port. So: **at most four workers at once** (the runner refuses a fifth — `FLEET_MAX_ACTIVE`),
**one game/browser/Electron at a time** (`scripts/fleet/game-lock.mjs`; `npm run gate` takes it
itself), no whole-suite test runs, and push to origin after every batch so a crash loses nothing.

## 2. Who does what (calibrated 2026-11-10)

Work is assigned by **lane** (`QUEUE.md`): Lane 1 = taste, creative, 3D, architecture, review; Lane 2
= large engineering; Lane 3 = fully specified medium jobs; Lane 4 = mechanical. The table below says
which model fits which lane.

| Who | Good for | Not for |
|---|---|---|
| **Lead (Claude, strongest model)** | diagnosis, architecture, feel and look decisions, reviewing, writing packets | grunt edits a worker can do |
**Owner rule (2026-11-11): Devin is bad at frontend.** Any screen, HUD, popup, menu, map, layout, CSS or
visual job goes to **Sonnet sub-agents** (spawned by the lead, judged from screenshots) when it matters, or
**Gemini Flash** for routine visual chores. Devin takes systems, gameplay logic, data and backend. Every
frontend change is looked at on screen by the lead before `DONE`.

| **Devin SWE-2 Max** (3 accounts, free) | systems, gameplay logic, data, backend: medium–large packets that name the seam (2–6 files + test); recon drafts; running probes and reporting numbers | **any frontend/visual work** (owner: not acceptable); judging what looks or feels good; 3D modelling |
| **Gemini 3.8 Flash** (agy) | routine frontend chores (labels, a CSS fix, a plate), one written plant at a time, small data rows | anything unreviewed; open design |
| **Sonnet sub-agents** (spawned by the lead) | frontend that matters (screens, HUD, popups, layout), deep review-and-fix passes on any feature, with screenshots | running unattended without a lead reading the diff |
| **Codex, GPT 6.1 Sol high** (senior, occasional) | hard backend/architecture reviews, batched reviews (`REVIEW-BATCH`), 3D/Blender, image generation (concept art, textures, mockups, transparent PNGs, GIFs) | final sign-off — it can make odd assumptions; the lead verifies every finding |
| **DeepSeek (OpenCode Go)** | — produced nothing in 90 min headless; not in rotation | |

Run at most three Devins + one Flash at once, never two on the same files. Devin hits short rate
limits when three start together; the runner resumes automatically.

## 3. The programs and their finish lines

Each program has a measurable finish. Work that does not move its number does not count.

### A. Stability — "it loads every time and stops regressing"
Done when: both launchers reach the menu 10/10 (STAB-01 ✔), the gate is green on master for a week of
merges, and no file in the shared folder is dirty at the end of any session.
Built: launchers (STAB-01), the gate (STAB-02), import lint (STAB-03), worker bundle never 503s
(STAB-04), the `.//` boot break fixed. Next: `KNOWN-REDS` (tests already failing on master).

### B. Performance — "smooth like a modern game on this machine"
**Diagnosis so far (2026-11-10, measured):**
- The GPU is **not** overloaded by geometry: ~134 draw calls, ~186 k triangles per frame (opening
  flight). Destiny-class games draw far more. "Too many things drawn" is not the root.
- **The main thread is saturated:** 0.4 % idle in steady flight. 34 % is browser-native work
  (`(program)`: driver calls, style/layout/compositing), ~24 % is three.js submitting the frame,
  then renderer/vfx/HUD JavaScript. 101 long tasks in 15 s. 134 shader programs; 3 compiled mid-flight.
- **The simulation runs at 0.62× real time even in the quiet opening** (9.4 sim-s per 15 wall-s).
  It lives in a worker, but its pace is coupled to the main thread (replies/ACK backpressure), so a
  saturated main thread starves the world's motion while decor keeps animating — **the owner's freeze
  symptom has this structural root.**
- Earlier lanes measured the worker step itself: p95 ≈ 58 ms, 74 % in JS per-body passes, 1.55 MB
  allocated per tick.

- **The ship flicks forward and back** (owner: "a snake's tongue"; same on the iPhone): the player's own
  ship is drawn only from late worker snapshots; the fence extrapolates ahead, then the real snapshot
  lands behind and the pose jumps back. The game treats its own worker like a distant, laggy server —
  but has none of the client-side prediction and error smoothing every online game uses for the
  player's own ship. Fix in two steps: PERF-02a error smoothing, PERF-02b local prediction.

**Why a hundred "improve performance" asks failed:** each one tuned a constant inside an architecture
whose budget was already spent twice over (main thread and worker both saturated), and none had a
number that defined done. Fixes must be structural and judged by the two numbers below.

**The two numbers (measured on a quiet machine, same session A/B):**
1. **Main-thread idle ≥ 30 %** in steady flight and in Swarm round 20 (`node scripts/probe-main-thread-profile.mjs --ms=15000`).
2. **simWallRatio ≥ 0.98** in the same windows (the "game cadence" line of the same probe).

**Order:** PERF-01 (decisive experiments: which part of the main thread is the waste) → decouple the
sim's pace from the main thread → cut the biggest main-thread owner the experiments name → the worker's
per-body passes and per-tick allocations (EC-G11 step 3). Each step: one change, matched A/B, keep
what moves the two numbers, revert what does not. The decor-follows-the-world fix (G11 one clock) is
already in, so remaining stalls no longer *look* like freezes while this lands.
Tools already in the repo: `perf:renderer-info`, `probe:main-thread`, `probe:crucible-cpu`,
`perf:spector` (one frame's WebGL calls), `stats-gl`, `perf:memlab`, `perf:gltf` / `perf:assets`,
gltf-transform + meshoptimizer + KTX2 (asset compression).

### C. Mobile — "plays on an iPhone"
Owner, 2026-11-10: cannot pinch to zoom out; the HUD covers most of the screen; slow and hitchy; unclear
what tapping does; too dark to read. Done when, on a 390×844 phone viewport (`ui-bench --phone`) and the
owner's iPhone: pinch zooms out to the desktop framing; the flight HUD covers ≤ 25 % of the screen;
every touch control has a visible label on first use; the first throw is reachable in 30 s; 30 fps
steady in the opening (mobile gets the low quality tier by default). Packets: `MOB-01..04` (recon
first). Performance program B lifts mobile too — the same main-thread waste hurts a phone more.

### D. The look — "bright, warm, readable; not bleak"
Owner, 2026-11-10: much of the game is too dark to read, with sudden over-blooming neon strips; the
overall mood is depressing and bleak; it feels pulled in different directions by different agents.
**Lead decision (art direction):** the game is lit like a busy working harbour at golden hour, not a
tomb. Readability first: every hull, rock and pickup reads against the background at a glance;
light is warm (amber, cream, teal accents), shadows are deep blue, not black; neon is an accent on
signage and engines only, never a wash; bloom is a budget (only emissive marks above a threshold),
not a filter on everything. One grade for the whole game, set in one place, with per-sector tints as
small offsets. Packet `LOOK-01` (lead): one global exposure/grade/bloom pass judged by side-by-side
shots of five places. Then `LOOK-02` (D): every sector's lights and palette brought onto that grade.

### E. The game itself — fun, specific, finished
Build order and acceptance stay as `10_THE_GAME.md` §6 and `18_SOUND_LOOK_AND_DONE.md` (the owner's
ten-minute card). Swarm finished first, then the first hour, then the five towns. Plants (`PLANT-NEXT`)
run continuously on Flash.

## 4. If the lead is gone

Any Devin pane can run the loop on `D` and `S` rows by itself (see `README.md`). Without a lead, do not
take `L` rows, and do not mark anything `DONE` — leave it `BUILT` for the next lead. Run `npm run gate`
before any push; if red, stop and leave a note at the top of `QUEUE.md`.
