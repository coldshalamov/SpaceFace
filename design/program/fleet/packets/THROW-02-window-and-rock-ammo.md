# THROW-02 — A release window a player can see, and Swarm rocks that throw

Evidence: `.devshots/fleet/runs/BOT-01-swarm-release-on-cue.devin2.*/RECEIPT.md` and `.devshots/fleet/demo/bot01/`.

## 1. The release window is sub-frame in Swarm
22 `massline:releaseWindow` events fired with `open:true`, and every one closed on the **same tick**, so the lit
`RMB · THROW` cue (masslineHud.js, the OPENING-1b pulse) can never be seen by a player in Swarm. In the Adventure
opening the window was visible. Find where the window opens/closes (`src/systems/masslineThrow.js`, the
`releaseWindow` emitter, and whatever drives `enterS` / `data-window`) and why Swarm's closes on the same tick
(e.g. a swing-speed or angle band that a fast Swarm swing crosses in one 1/60 s step).
**Lead decision:** once open, the window stays open for at least **0.20 s** of sim time (or until the swing leaves
the band by a clear margin, whichever is later), so the cue is readable and a well-timed tap earns the window's
grade. Taps outside the window still throw as today (buffering stays). Test: a fast swing that crosses the band in
one tick still reports a window ≥ 0.20 s; the grade logic still distinguishes in-window vs out-of-window taps.
`npm run check:sim` must stay green; if its reference changes only because the window lasts longer in the 47-A
replay, report it — do not edit the golden.

## 2. Swarm arena rocks are ammunition
Design: `design/game/12_SWARM_THE_PIT.md` ("they are ammunition"; R7 "Rocks appear for cover"; "cut a container loose —
the heaviest throwable") and doc 10 ("Grab anything. Swing it. Throw it into everything else."). Today loose
Swarm arena rocks latch but `isThrowArmPayload` refuses them unless they are fracture chunks or flagged throwable,
so the release is a plain cut (`tether_cut`). The THROW-01 agent already made the Foundry conveyor workpiece
throwable by flagging it. **Make every loose free-floating rock in a Swarm arena (the `swarmArenaDebris` rocks and
any arena-spawned asteroid not anchored to a structure) throwable** by the same flag at spawn, as long as it is
within the line-class weight rule (heavier ones say TOO HEAVY as today). Adventure asteroids are unchanged.
Test: a Swarm arena debris rock under the class limit arms a throw on release; an Adventure field asteroid still cuts.

Exact-path commits per the protocol; tests before/after for each touched file.
