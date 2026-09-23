<!-- GENERATED FROM task-bank.json; DO NOT EDIT BY HAND -->

# Jules task catalogs

The JSON bank is canonical. These files write out all 171 tasks for human browsing.

| Lane | Range | Tasks | Model mix | Catalog |
|---|---:|---:|---:|---|
| Deterministic test hardening | `JULES-0001`–`JULES-0040` | 40 | 40 Flash / 0 Pro | [test-hardening.md](./test-hardening.md) |
| Bounded bug hunts and surgical fixes | `JULES-0041`–`JULES-0090` | 50 | 50 Flash / 0 Pro | [bug-hunt.md](./bug-hunt.md) |
| Determinism, replay, save, and lifecycle | `JULES-0091`–`JULES-0095` | 5 | 5 Flash / 0 Pro | [determinism-save.md](./determinism-save.md) |
| Performance, allocation, residency, and disposal | `JULES-0096`–`JULES-0096` | 1 | 1 Flash / 0 Pro | [performance-lifecycle.md](./performance-lifecycle.md) |
| UI, UX, input reachability, and accessibility | `JULES-0097`–`JULES-0111` | 15 | 15 Flash / 0 Pro | [ui-ux-accessibility.md](./ui-ux-accessibility.md) |
| Flight, combat, AI, and game feel | `JULES-0112`–`JULES-0133` | 22 | 22 Flash / 0 Pro | [ai-combat-flight.md](./ai-combat-flight.md) |
| World, economy, missions, mining, and progression | `JULES-0134`–`JULES-0150` | 17 | 17 Flash / 0 Pro | [world-economy-missions-mining.md](./world-economy-missions-mining.md) |
| Rendering, assets, VFX, camera, and audio | `JULES-0151`–`JULES-0155` | 5 | 5 Flash / 0 Pro | [render-assets-vfx-audio.md](./render-assets-vfx-audio.md) |
| Tooling, data integrity, diagnostics, and documentation drift | `JULES-0156`–`JULES-0162` | 7 | 7 Flash / 0 Pro | [tooling-data-docs.md](./tooling-data-docs.md) |
| Small creative production slices | `JULES-0163`–`JULES-0171` | 9 | 0 Flash / 9 Pro | [creative-expansion.md](./creative-expansion.md) |

Render a copy-ready prompt with:

```bash
node scripts/jules-dispatch.mjs --id JULES-0001 --format prompt
```
