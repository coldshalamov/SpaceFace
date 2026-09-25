# #164 fresh cost map — quiet frame + admission (Picture ON, soft-GPU llvmpipe, seed 47)

Profiles:
- `settled-45s-master-164`: bare master `97c88f92b`
- `settled-45s-stack-164`: master + the full digest stack #31–#163, local
  `vm-work/stack-20260924u` (hillclimb-o minus trust-sleep, plus #156–#163,
  with the renderer/radar conflicts resolved by hand)

Both are 45 s of held thrust, sampled every 200 µs.

## Whole-window

| | bare master | full stack |
|---|---:|---:|
| idle | 54.8% | 70.1% |
| long tasks | 12 | 4 |
| settled sim (15–45 s) | ~1.23 ms/tick | ~0.86 ms/tick |

## Settled sim per 30 s (stack)

| owner | ms/30 s | ~µs/tick | note |
|---|---:|---:|---|
| physics sg02 | 377 | ~210 | Rapier wasm 92; **JS glue in `_stepFixed` ~145** (about 9 RawVector-allocating getter/setter calls per body per tick, ~250 ns each; census 9–13 dynamic bodies, all awake); classify-from-physics 86; `syncFromEntityLayers` 29 |
| flightV3 | 147 | ~80 | |
| tacticalAI | 137 | ~76 | ai.stack `liveFramesFor` → `entityContacts` / `_contactBaseFor` |
| fields | 86 | ~48 | `_applyForces` 35 |
| input | 74 | ~41 | gamepad `getGamepads` ~22 (~13 µs/call, every tick) |
| world | 70 | ~39 | `tickFarActors` 28 |
| tetherGameplay | 54 | ~30 | `_refreshAcquisitionPreview` 38 (~72 µs per refresh at 12.5 Hz) |
| masslineHud | 54 | ~30 | acquisition-preview DOM 31 |
| preStep / weapons / lifetimeSweep | 48 / 46 / 41 | | trust-sleep held; lifetime packaged |

## Early flight 0–10 s (stack)

The sim step costs 1711 ms. Of that, **tacticalAI is 572 ms (~0.95 ms/tick)**:
ai.stack `liveFramesFor` → `entityContacts` plus classify. This is the largest
remaining portable-sim spike.

## Presentation, settled 30 s (stack)

| owner | ms/30 s |
|---|---:|
| frame | 4672 |
| drawPreparedFrame | 1971 (three render CPU 1638; scene `updateMatrixWorld` 319) |
| prepareFrame | 404 |
| uiRoot | 302 (hud.frame 265: radar.draw 84, **updateShipCondition 28.5 → #164**) |
| vfx | 213 |
| **`get memory`** | 28.5 (**→ #165**) |

## Admission poles

- **Opening (stack):** a single ~1.0 s `getProgramParameter` link burst at
  ~10–15 s inside `rehearseScenePass`, the renderer opening first-draw shadow
  sweep behind the held gate. This is pole 2 (fewer program keys) and is
  soft-GPU dominated. It is not a quick VM latch.
- **Bare master:** `isProgram` in bloom `programHandleInvalid` / drain at 5.4 s.
- **Mid-flight:** no admission long task inside the settled window on the
  stack; 12 long tasks on bare master, which is mostly what the digest stack
  already removes.

## Verdict

**The portable-sim per-system latch vein is exhausted.** Every remaining
registry.step system probed (survivorPod: 0 promoted pods live; scanner;
bulletTime; fieldDepletion; masslineThreats) is ≤~0.44 µs/tick.

The largest remaining measured costs are:
1. three render CPU: ~55 ms/s
2. physics sg02: ~12.6 ms/s, of which JS glue is ~4.8 ms/s
3. early-flight tacticalAI spike: ~0.95 ms/tick for the first ~10 s
4. opening shadow-sweep program link: ~1 s once, soft-GPU
