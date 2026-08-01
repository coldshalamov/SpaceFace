<!-- LIFETIME: ACTIVE_PACKET -->
# Active implementation packets

These files translate queue intent into current, bounded implementation instructions. They are the handoff an implementation agent should receive after reading the canonical map and live lease board.

## Recommended dependency order

The queue priority numbers remain stable identities, not permission to ignore current entry gates.

```text
PQ-018 Wreck Cathedral runtime promotion
  └─> PQ-020 Ceres topology consumes the accepted Cathedral placement

PQ-019A physical launcher/capsule/catcher/fence
  └─> PQ-019B owner seams and outcome arbiter
        └─> PQ-019C authored heist route

PQ-022 visual-family leaf packets ──> PQ-024 exterior claim visual
PQ-017 World Site + PQ-024 survey/claim lifecycle

PQ-023 presentation leaf packets may run between these only when renderer/HUD/GPU mutexes are free.

PQ-019 through PQ-024 integrated
  └─> PQ-025 held-out Gold Corridor qualification

PQ-034 PERF-00 equivalence and attribution harness
  ├─> PQ-035 PERF-01 lifecycle correctness
  │     ├─> PQ-036 PERF-02 scheduler/presentation seam
  │     │     └─> PQ-038 PERF-04 dense PresentationWorld
  │     └─> PQ-041 PERF-07 supported Electron runtime
  ├─> PQ-037 PERF-03 offline render compiler
  ├─> PQ-039 PERF-05 deterministic hot-query service
  └─> PQ-040 PERF-06 dirty-range GPU uploads

PQ-034 through PQ-041 accepted
  └─> PQ-042 PERF-08 evidence-selected GPU correction
        ├─> PQ-043 PERF-09 simulation Worker (deferred unless triggered)
        └─> PQ-044 PERF-10 WebGPU/TSL slice (deferred unless triggered)
```

PQ-021 and PQ-034 are checked off and retained under `../retired/`. PQ-018, PQ-019, PQ-020, PQ-022, PQ-023, and
PQ-024 have their headless implementation layers integrated. Current corridor
work is exact acceptance repair, headed capture, evidence-bound integrator review, performance
evidence, and promotion;
run `node scripts/program-dispatch.mjs --ready` and claim the returned unit rather than redispatching
a parent implementation. PQ-022 and PQ-023 remain portfolio containers, but their current leaf units
are explicit in the queue.

PQ-034 is route-accepted and retired after selective candidate audit, source-paired Browser/Electron
qualification, exact cleanup, and enabled-overhead proof. PQ-035 through PQ-041 have focused
implementation on master and their native continuation units are now dispatchable in dependency
order. PQ-042 remains dependency-gated on terminal PERF-01–07 acceptance. PQ-043 and PQ-044 remain
deferred and intentionally have no active packet until their evidence triggers are proved.

## Packet index

| Packet | Executable interpretation | Entry summary |
|---|---|---|
| [`PQ-018.md`](./PQ-018.md) | release, register, place, wire, and accept the Wreck Cathedral through the integrated World Site substrate | PQ-017 current contract; asset/renderer/GPU lane free |
| [`PQ-019.md`](./PQ-019.md) | split the heist into physical facilities, owner seams, and one authored route | stable ID correction; facility phase precedes mission phase |
| [`PQ-020.md`](./PQ-020.md) | bounded Ceres topology/data slice, one existing-owner local condition, and route proof | consume PQ-018 placement without relocation; Atlas/data lease |
| [`PQ-022.md`](./PQ-022.md) | run asset/family leaf packets through source→release→route→perf | exact leaf selected; relevant asset/renderer mutex free |
| [`PQ-023.md`](./PQ-023.md) | implement physics-readable presentation as separate cue-family leaves | current owner events and shared presentation lease |
| [`PQ-024.md`](./PQ-024.md) | one transient survey target, Core commitment, real-output producing receipt, one exterior consequence | PQ-017 seam rebound; one accepted exterior visual |
| [`PQ-025.md`](./PQ-025.md) | observational held-out qualification, not a feature branch | PQ-019–024 exact integrated receipts and frozen owner evidence map |
| [`PQ-035.md`](./PQ-035.md) | foreground/background lifecycle correctness | focused implementation on master; native acceptance is unblocked by terminal PERF-00 |
| [`PQ-036.md`](./PQ-036.md) | main-thread simulation/presentation ownership plus journals | focused implementation on master; native attribution acceptance remains |
| [`PQ-037.md`](./PQ-037.md) | compile deterministic render packages outside gameplay | foundation on master; bounded production pilot and native acceptance remain |
| [`PQ-038.md`](./PQ-038.md) | dense generation-safe PresentationWorld | focused implementation on master; native dense-route acceptance remains |
| [`PQ-039.md`](./PQ-039.md) | deterministic batched NPC hostile query | focused implementation on master; native scale acceptance remains |
| [`PQ-040.md`](./PQ-040.md) | upload only changed GPU attribute/matrix component ranges | focused implementation on master; native GPU acceptance remains |
| [`PQ-041.md`](./PQ-041.md) | supported Electron 43.2 runtime | focused implementation on master; H1 harness repair plus exact-package/native acceptance remain |
| [`PQ-042.md`](./PQ-042.md) | select one GPU correction—or no GPU change—from valid pass evidence | PQ-034–041 accepted; clean trace selects A/B/C/D |

PQ-043 and PQ-044 are admitted queue identities but remain deferred and packet-less until their
conditional triggers are proved.

## How to use a packet

1. Rebase its “live seams” against current source before editing.
2. Satisfy entry conditions and record the lease.
3. Implement one phase at a time; stop at declared owner boundaries.
4. Check boxes only when the cited proof exists at the candidate revision.
5. Use the packet's verification budget; do not add broad gates merely to appear thorough.
6. Return a receipt and let the integrator update global state.

If a packet is materially wrong because an upstream owner changed, revise the packet first. Do not work around a stale contract in code.

## Creating another packet

Copy [`PACKET_TEMPLATE.md`](./PACKET_TEMPLATE.md). Keep source-plan archaeology out of the executable core; link it under “References.” The packet should fit in an agent's active context together with the owner modules and focused tests.
