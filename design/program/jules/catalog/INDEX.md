<!-- GENERATED FROM task-bank.json; DO NOT EDIT BY HAND -->
# Jules task catalogs

The JSON bank is canonical. These files write out all 1,000 tasks for human browsing.

| Lane | Range | Tasks | Model mix | Catalog |
|---|---:|---:|---:|---|
| Deterministic test hardening | `JULES-0001`–`JULES-0170` | 170 | 170 Flash / 0 Pro | [test-hardening.md](./test-hardening.md) |
| Bounded bug hunts and surgical fixes | `JULES-0171`–`JULES-0320` | 150 | 120 Flash / 30 Pro | [bug-hunt.md](./bug-hunt.md) |
| Determinism, replay, save, and lifecycle | `JULES-0321`–`JULES-0410` | 90 | 72 Flash / 18 Pro | [determinism-save.md](./determinism-save.md) |
| Performance, allocation, residency, and disposal | `JULES-0411`–`JULES-0500` | 90 | 54 Flash / 36 Pro | [performance-lifecycle.md](./performance-lifecycle.md) |
| UI, UX, input reachability, and accessibility | `JULES-0501`–`JULES-0600` | 100 | 80 Flash / 20 Pro | [ui-ux-accessibility.md](./ui-ux-accessibility.md) |
| Flight, combat, AI, and game feel | `JULES-0601`–`JULES-0700` | 100 | 40 Flash / 60 Pro | [ai-combat-flight.md](./ai-combat-flight.md) |
| World, economy, missions, mining, and progression | `JULES-0701`–`JULES-0800` | 100 | 60 Flash / 40 Pro | [world-economy-missions-mining.md](./world-economy-missions-mining.md) |
| Rendering, assets, VFX, camera, and audio | `JULES-0801`–`JULES-0880` | 80 | 48 Flash / 32 Pro | [render-assets-vfx-audio.md](./render-assets-vfx-audio.md) |
| Tooling, data integrity, diagnostics, and documentation drift | `JULES-0881`–`JULES-0950` | 70 | 56 Flash / 14 Pro | [tooling-data-docs.md](./tooling-data-docs.md) |
| Small creative production slices | `JULES-0951`–`JULES-1000` | 50 | 0 Flash / 50 Pro | [creative-expansion.md](./creative-expansion.md) |

Render a copy-ready prompt with:

```bash
node scripts/jules-dispatch.mjs --id JULES-0001 --format prompt
```
