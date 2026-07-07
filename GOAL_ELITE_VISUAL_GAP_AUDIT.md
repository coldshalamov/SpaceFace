# Elite Visual Gap Audit (living — update after each lane milestone)

**Date:** 2026-07-07 · **Target:** every lane **≥4/5** before goal complete

| Lane | Score | Gap vs Elite | Remediation owner |
|---|---:|---|---|
| Modular parts (108 manifest) | **5** | `check:elite:evidence` PASS 108/108; iter4/5 lit + ≥10 techniques + story maps | Lane A+B complete |
| Code-native ships (`kestrelHero.js`, faction builders) | **4** | `shipKit.applyEliteWearShell` on Concord/Reaver; shared PBR hull kit | Monitor kestrel hero parity |
| Procedural fallbacks (`visualFactory.js`) | **4** | `buildFallback` panel+normal+wear PBR; live `failureCount:0` | Keep fallback rate at zero |
| Stations/places in flight | **5** | 25 place GLBs Elite + 5 new/category; live loader PASS | — |
| HUD/UI chrome | **4** | Clean non-diegetic HUD meets taste; icon atlas latent | Optional icon atlas pass |
| World backdrop (`spaceBackground.js`) | **4** | +20% star/flare density; 2 visible hero planets; L4/L5 parallax live | Optional L2.5 dust ribbon |
| VFX (`vfx.js`) | **4** | 8 families × ≥3 variants; `capture-vfx-elite-frames.mjs` CDP captures (~600KB PNGs); `check:vfx:elite` PASS |
| Portraits/cinematics | **4** | Bar portraits live; flight correctly excludes them | No flight HUD violation |

**Lanes below 4:** none (2026-07-07 gate sweep).

**Gate evidence (SCRATCH):** `check-assets-live.log` (failureCount:0), `visual-stability.log` (ok:true), `per-id-elite-audit.txt` (108/108), `vfx-elite-audit.txt`.