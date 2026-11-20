# STREAM-BUILD-1 — a ship that arrives wears its real model in under three seconds

**For:** a careful engineer in the renderer. **Kind:** asset admission. **One commit per part.**

## Why

The owner: "things load too late on screen and I crash into nothing and then a model appears."
An investigation found the causes. Its condensed report is
`.devshots/director/fable/streaming/REPORT.md` — read it first; it gives file and line for
everything below. Its probes and data are in the same folder (`run-idle/`, `run-tree/`).

A ship that spawns near the player in mid-flight stays an abstract octahedron or a flat untextured
stand-in for 19 seconds or more. Four causes stack; this packet removes them.

## Part A — an instrument that tells the truth

1. The flags `no-resident-record` / `admissionStandInPending` are copied onto the boundary object
   with the substrate's `userData` (`src/render/partsLibrary.js` near :3056) and never cleared when
   the real model commits (near :10874-10878); `syncResolvingMarker` then exits early
   (`src/render/renderer.js` near :4664-4671). Clear them at commit so a committed hull never reports
   itself pending.
2. Publish a small renderer census the game and probes can read (for example on `state.render` or
   the existing diagnostics object — follow how neighbouring diagnostics are published): bodies on
   screen drawn as a stand-in or octahedron; solid bodies inside 600 world units with no mesh; for
   each ship, seconds from spawn to its real model. Counting only: no behaviour change.
3. Copy `.devshots/director/fable/streaming/stream-probe.mjs` (or whichever probe in that folder
   produced `run-idle/`) to `scripts/probe-streaming.mjs`, make it read the census, and make it exit
   non-zero when any on-screen body is still a stand-in 3 s after it spawned. Run it through the lock
   (`node scripts/fleet/game-lock.mjs run -- node scripts/probe-streaming.mjs`) and save the
   **before** numbers.

## Part B — unblock the queue

1. **End the first-flight hold at first paint for ships and solid bodies.**
   `holdAuthoredUpgradeQueueForFirstFlight` (`partsLibrary.js` near :6485-6500, released at
   `renderer.js` near :15124-15127) blocks the upgrade queue for about 22 s after the first picture.
   Swarm already releases at first paint (`renderer.js` near :36534): do the same for ships and solid
   bodies in Adventure. Dressing may keep waiting.
2. **Order the queue by what the player can hit.** Today station furniture grades the same rung as an
   inbound ship (`partsLibrary.js` near :6605-6608) and ties break by enqueue order (near
   :8159-8170), so twenty dressing jobs queued during loading run before any new ship. New order:
   solid and closing on the player first, then solid by distance, then ships by distance, then
   dressing.
3. **More than one lane when the frame can afford it.** `AUTHORED_UPGRADE_STEADY_LIMIT = 1`
   (`src/render/authoredUpgradePolicy.js` near :19). Allow two concurrent jobs when the last second's
   frame time has headroom (follow the existing frame-budget signal the policy already reads; if
   there is none, use a simple rule: two lanes unless the previous frame exceeded 20 ms).
4. **Repeated files must hit the cache.** The investigation saw every decode miss, even for a file
   decoded seconds earlier. Find why (key includes something per-instance? the cache is cleared?)
   and fix it so a second ship of the same kind mounts from the first one's decoded data.

## Prove

- The probe **after**: every ship that spawns within 600 units shows its real textured model in under
  3 s, and no on-screen stand-in older than 3 s. Report before and after.
- Shader-compile hitches must not come back: the probe's worst frame time after must not be worse
  than before by more than 10 %. If it is, keep the ordering fix and the cache fix and say what the
  lane change cost.
- `npm run check:playable` passes (through the lock). Run the tests that mention the files you
  touched (`grep -rln "authoredUpgradePolicy\|holdAuthoredUpgradeQueue" test | head -20`).

## Files

`src/render/partsLibrary.js`, `src/render/authoredUpgradePolicy.js`, `src/render/renderer.js` (only
the regions named above), their tests, `scripts/probe-streaming.mjs`. **`renderer.js` is shared and
carries another agent's uncommitted lines right now:** run
`bash scripts/fleet/own-commit.sh begin src/render/renderer.js` before editing it and commit with
`bash scripts/fleet/own-commit.sh commit "<message>" <files>` so only your lines land. Do not touch
the pose/snapshot code in it.
