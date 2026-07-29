<!-- LIFETIME: EPHEMERAL --><!-- One-use verification receipt for MAKE_THE_GAME_FAST.md Lead 5. Diagnostic, not policy. -->
# Lead 5 heap verification — LAZY_GC_NOT_LEAK

Verification of the claim in `design/program/roadmap/MAKE_THE_GAME_FAST.md` "Lead 5": a prior
capture saw `performance.memory` grow ~2.15 GB monotonically to ~2.19 GB over 1499 samples with
ZERO observed collections. That was the first heap measurement here, with no positive control.
This report either confirms or refutes it using two cross-validating instruments and a forced GC.

- **Probe:** `scripts/probe-heap-verify.mjs` (throwaway; zero `src/` changes)
- **Raw samples + events:** `.devshots/perf/heap-verify.json`
- **Generated:** 2026-07-29T15:10:48.962Z
- **Renderer:** ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)
- **GPU tier:** software (software=true); **heap limit:** 3.76 GB
- **Window:** headless=true; 120.0s per phase, sampled every 500 ms

## Positive control (evaluated before any verdict)

A heap instrument has the same silent-failure mode as a zero-budget counter: a dead sampler and a
stable heap both report "no change". So the verdict is withheld unless the sampler demonstrably moves.

- **Sampler alive:** YES — 205/205 consecutive 
  `Runtime.getHeapUsage` readings had nonzero deltas.
- **Game alive:** YES — sim tick advanced by 6972 ticks in phase 1.

## (a) Does the heap grow monotonically during idle flight?

| phase | start MB | end MB | net growth | duration | rate (endpoints) | slope (least-sq) | inc/dec/flat |
|---|---:|---:|---:|---:|---:|---:|---:|
| phase 1 (pre-GC) | 55.4 | 67.1 | +11.6 | 2.00 min | 5.8 MB/min | -9.1 MB/min | 129/76/0 |
| phase 2 (post-GC1) | 59.7 | 78.3 | +18.6 | 1.99 min | 9.4 MB/min | 8.2 MB/min | 106/99/0 |

Phase 1 is **NOT strictly monotone** (decreases=76). Phase 2 is **NOT strictly monotone** (decreases=99).
Idle-flight growth rate (phase 1 slope): **-9.1 MB/min**.

## (b) Does forced GC reclaim the growth (lazy GC) or leave it (leak)?

| forced GC | before MB | after MB | reclaimed MB | reclaim of growth | floor vs phase start |
|---|---:|---:|---:|---:|---:|
| GC #1 | 78.6 | 60.3 | 18.3 | 79% | 4.9 MB |
| GC #2 | 89.2 | 62.7 | 26.5 | 90% | 3.0 MB |

Mean reclaim-of-growth across both forced GCs: **84%**.

**Interpretation:** forced GC reclaimed ~84% of the growth — the heap was reclaimable, consistent with V8 lazy collection on a large-RAM machine, not hard retention

## (c) Do natural collections ever appear in the samples?

- `Runtime.getHeapUsage` (unquantised): 175 sample intervals contained a collection (172 dropped > 1 MB).
- `performance.memory` (quantised, Lead 5's instrument): 0 sample intervals showed a decrease.

**Runtime.getHeapUsage shows collections that performance.memory does not — this is the quantisation explanation for Lead 5's "0 collections".**

A drop between two `Runtime.getHeapUsage` samples can only mean a GC ran in that interval (without GC,
live heap never shrinks). So this is a direct test of Lead 5's "0 collections" claim under an instrument
that is not quantised.

## Verdict

**LAZY_GC_NOT_LEAK**

- forced GC reclaimed ~84% of the growth — the heap was reclaimable, consistent with V8 lazy collection on a large-RAM machine, not hard retention
- natural collections WERE observed in Runtime.getHeapUsage — Lead 5's "0 collections" does not hold under an unquantised instrument

## Caveats

- This run is a **4-minute idle-flight window** in a (likely headless, software-rendering) probe. Lead
  5's 2.15 GB was accumulated over a full long probe run; this probe measures the *rate* and the
  *reclaimability*, not the absolute peak. Do not expect to see 2.19 GB here.
- `performance.memory` is quantised; `Runtime.getHeapUsage` is not. Where they disagree on collections,
  the unquantised reading is authoritative.
- V8 is lazy on a large-RAM machine: it will hold a heap far above the live set before collecting. A
  reclaimable big heap is still **GC pressure** (a 2 GB heap means long major-GC pauses when they do
  fire), so "lazy GC, not a leak" does NOT mean "harmless" — it means the fix shape is different.

## What should happen next

1. **Re-run headed on the real GPU.** Step 0 of MAKE_THE_GAME_FAST.md first: confirm `software=false`
   on a real headed browser (`--headed`). The headless software-rendering environment measured here is
   comparable to Lead 5's original capture but is not the player's machine.
2. **The growth is reclaimable, so this is GC pressure, not a retained leak.** The first-rank action is
   to cut *per-frame allocation* (the thing inflating the heap and triggering long major GCs): Leads 1,
   3 and 4 (sprite-material dispose/relink, bufferFullUploads spikes, and the 13.6 DOM attribute
   mutations/frame) are exactly the allocation sources that bloat a heap like this.
3. **Confirm the floor is stable, not creeping.** Run the probe for 20-30 minutes (raise `--phase-ms`)
   and force several GC cycles: if each post-GC floor is higher than the last, there IS a slow leak
   hiding under the lazy-GC behaviour, and a heap-snapshot diff (DevTools Memory → snapshot before/after)
   is the next step. If the floors plateau, there is no leak.
4. **Do not ship a `--expose-gc` / periodic forced-GC hack.** Forcing GC on a schedule trades the big
   lazy pauses for more frequent smaller ones and does not reduce allocation.
