<!-- LIFETIME: ACTIVE_RECEIPT -->
# PQ-137.11 — the visible-jitter clause, measured from the pictures (bar B13)

```text
NOT DONE  PQ-137.11 — the visible-jitter clause is now measured from the pictures and fed into the bar, and the bar answers honestly: on the live build the player's hull is still knocked around in the Crucible (a heading change on ordinary contact in seven of nine cells; the rope-kit cells far over the budget), so B13 is not met on either bench.
WHAT I FOUND     B13's last unmeasured clause, "never produces visible jitter", could not be closed headless: the earlier lane measured a wobble proxy (lateral velocity sign flips) beside the bar and rightly refused to call it what a viewer sees.
WHAT I CHANGED   The headed strip now measures the clause from its own frames — after every contact the player was in, does the hull's heading or its movement on the glass turn back on itself within half a second — and the measurer can attach that reading to the headless Crucible run of the same fight, so the bar can finally be decided with the pictures as the witness.
WHAT YOU WILL FEEL   Nothing new in play from this unit; the contact rule that stopped bumps from stealing your heading landed earlier today. What changes is that "no visible jitter" is now a number read off frames, not a note saying nobody looked.
THE NUMBERS      B13, Crucible bench, seed 4242, worst of nine cells | contact knocks per minute 73.3 (budget ≤ 2) · largest knock 8.1 % of cruise (≤ 10 %, met) · contacts that changed heading 96 (must be 0) · visible jitter, the one photographed cell | 1 wobble window in 13 (must be 0)
THE FRAMES       manifests/crucible/b025ed3a/swarm_piloted-physics_toolkit-s4242 (live build, seed 4242, real time 0.63, 131 frames, 11 shots): thirteen half-second windows after contacts the player was in, at 7.2 fps or better; the one wobble is the craft slam at half a second that spun the hull
NEXT             PQ-139.04 tumbling ships corkscrew their trail
```

## The instrument

- `scripts/lib/bench/frameStripCapture.mjs` `measureVisibleJitter(frames, momentsInSpan)`: for each
  contact the player was in inside the photographed span, the frames in the next half second; a
  heading reversal is the hull's yaw changing direction between consecutive frames; a motion
  reversal is the hull's movement on the glass turning back on itself. Every frame now carries
  `playerRot`. Fewer than three frames in a window is "unmeasured", never a pass. The manifest
  records `visibleJitter` with the window count, the reversal counts, the number of windows with a
  reversal (`events`), and the lowest cadence any window had.
- `scripts/measure-fun-loop.mjs --knock-strip <manifest>`: attaches a strip's jitter reading to the
  headless Crucible run of the same cell (arena, loadout, seed), and only when the strip ran at
  normal speed. A slow strip attaches nothing and the clause stays unmeasured.
- `scripts/lib/bench/feelBars.mjs` B13: with jitter measured, "visible jitter events after contact"
  is a value row (worst run decides, zero is the clause) instead of a note saying the pass is
  impossible.

## What stays open, honestly

The flight bench's `feel.knock_budget` corridor has no browser route, so its jitter clause has no
frames to read and stays unmeasured; the earlier lane's sign-flip proxy is reported beside it, not
folded in (the handoff's ruling stands). B13 on the flight bench is therefore still partial by its
own contract, and the done-when's "flight bench" half is not claimed here.

## Results (live build `b025ed3a`, Crucible bench, seed 4242, three waves per cell)

| cell | knocks/min (≤ 2) | largest knock, of cruise (≤ 0.10) | contacts that changed heading (0) | visible jitter |
|---|---|---|---|---|
| Helios Core · starter | 0.0 | 0.000 | 0 | unmeasured (no strip) |
| Helios Core · physics kit | 0.7 | 0.051 | **1** | **1 window of 13** (measured from the strip) |
| Helios Core · rope kit | 14.0 | 0.067 | **20** | unmeasured |
| Lagrange · starter | 4.7 | 0.081 | **6** | unmeasured |
| Lagrange · physics kit | 2.7 | 0.051 | **3** | unmeasured |
| Lagrange · rope kit | 36.7 | 0.067 | **38** | unmeasured |
| Cinder Sluice · starter | 0.7 | 0.019 | **1** | unmeasured |
| Cinder Sluice · physics kit | 2.0 | 0.051 | 0 | unmeasured |
| Cinder Sluice · rope kit | 73.3 | 0.067 | **96** | unmeasured |

B13 reads **not met** on the Crucible bench. The largest-knock clause is met everywhere; the rate
clause fails in five cells; the heading clause fails in seven; the jitter clause fails on the one
cell that has frames. The flight bench (`feel.knock_budget`) is unchanged and its jitter clause has
no frames to read (no browser route for the corridor).

The rope-kit cells are a story of their own: the stiff line (PQ-137.07) reels the bench's pilot
into whatever it latched, and every one of those contacts changes the heading. Both rope cells were
already over budget on the unmodified head (17 and 4 per minute); they are worse now, and that is
recorded in the rope receipt as a consequence, not hidden.

## What the next cycle should fix (the fundamental, in the §A format)

- Rule in the live code: `src/core/sg02DynamicBodyOwner.js` — the CONTACT rule that restores the
  player's yaw to its no-contact prediction (a3bd740d) covers the pose kick; the heading the
  bench counts is the **velocity** heading after the contact impulse, which that rule does not
  touch, and a craft slam above the tumble floor still spins the player outright (the knock strip's
  first contact).
- What it does: ordinary craft and rock contacts leave the player's velocity heading changed by
  more than the instrument's floor, one to six times in a 25 s wave.
- Effect on the fantasy: "my ship keeps getting knocked around" — a bump still turns you.
- Vision sentence broken: "Turn NOW when I twitch." "A controllable mass, not a cursor."
- Bar it should move: B13 — zero contacts that change the heading; no visible jitter.
- Status: OPEN → PQ-137.11, next cycle (a velocity-heading restore on the player for sub-tumble
  contacts, or a lower contact bound on the player hull; never a clamp on given momentum).

## Evidence

- `node scripts/measure-fun-loop.mjs --crucible --seeds=4242 --knock-strip <the knock strip>`:
  `knock-strip: visible jitter attached to helios_core/physics_toolkit/s4242`; the nine-cell
  receipt with B13 `no`.
- `test/frame-strip.test.mjs` (20) and `test/fun-measurer.test.mjs` (38): the jitter measurement,
  the strip attachment, and the B13 clause row.

