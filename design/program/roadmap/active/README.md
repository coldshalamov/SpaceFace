<!-- LIFETIME: ACTIVE_PACKET -->
# Active implementation packets

These files translate queue intent into current, bounded implementation instructions. They are the handoff an implementation agent should receive after reading the canonical map and live lease board.

## Recommended dependency order

The queue priority numbers remain stable identities, not permission to ignore current entry gates.

```text
PQ-018 Wreck Cathedral runtime promotion
  ├─> PQ-020 Ceres topology and final Cathedral placement
  └─> PQ-021 Ship's Ledger receipt/catalog wiring

PQ-019A physical launcher/capsule/catcher/fence
  └─> PQ-019B owner seams and outcome arbiter
        └─> PQ-019C authored heist route

PQ-022 visual-family leaf packets ──> PQ-024 exterior claim visual
PQ-017 World Site + PQ-024 survey/claim lifecycle

PQ-023 presentation leaf packets may run between these only when renderer/HUD/GPU mutexes are free.

PQ-019 through PQ-024 integrated
  └─> PQ-025 held-out Gold Corridor qualification
```

PQ-018 is the current dependency root. PQ-019's facility prerequisite can be prepared in parallel only in a non-colliding world/asset lane. PQ-022 and PQ-023 are portfolio containers: select one leaf packet with one owner/write surface and one acceptance route; never assign the entire umbrella to one worker.

## Packet index

| Packet | Executable interpretation | Entry summary |
|---|---|---|
| [`PQ-018.md`](./PQ-018.md) | release, register, place, wire, and accept the Wreck Cathedral through the integrated World Site substrate | PQ-017 current contract; asset/renderer/GPU lane free |
| [`PQ-019.md`](./PQ-019.md) | split the heist into physical facilities, owner seams, and one authored route | stable ID correction; facility phase precedes mission phase |
| [`PQ-020.md`](./PQ-020.md) | five-path Ceres topology/data slice plus route proof | PQ-018 placement contract and Atlas/data lease |
| [`PQ-021.md`](./PQ-021.md) | reuse one pure projector and one panel in station + Codex | PQ-018 direct-keyed receipts/catalog/media integrated |
| [`PQ-022.md`](./PQ-022.md) | run asset/family leaf packets through source→release→route→perf | exact leaf selected; relevant asset/renderer mutex free |
| [`PQ-023.md`](./PQ-023.md) | implement physics-readable presentation as separate cue-family leaves | current owner events and shared presentation lease |
| [`PQ-024.md`](./PQ-024.md) | one transient survey target, Core commitment, real-output producing receipt, one exterior consequence | PQ-017 seam rebound; one accepted exterior visual |
| [`PQ-025.md`](./PQ-025.md) | observational held-out qualification, not a feature branch | PQ-019–024 exact integrated receipts and frozen owner evidence map |

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
