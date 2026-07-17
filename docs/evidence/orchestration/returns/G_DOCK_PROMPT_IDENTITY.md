# G_DOCK_PROMPT_IDENTITY — named dock-range prompt (first-hour polish)

**Owning check:** `npm run check:dock-prompt-identity`  
**Expansion vs Steam bar:** Freelancer/Rebel Galaxy name the berth on approach; generic "DOCK AT STATION" erased place identity.

## Change

- `src/ui/alerts.js`: `formatDockRangePromptText` + `resolveDockStationLabel`
- `dock:range` handler reads `stationId` from physics payload and names the place (e.g. Helios)
- Fallback remains `STATION` when id missing

## Evidence

| Artifact | Path |
|---|---|
| Check log | `{SCRATCH}/dock-prompt-identity.log` |
| NAV-HUD still green | `{SCRATCH}/nav-hud-after-dock-prompt.log` |

## PLAN DRIFT

none — dual-platform residual untouched; graphics fence clean.
