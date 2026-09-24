# CLAIM — hud-credits-pulse-no-reflow

Lane: early-flight HUD hitch — credits chip pulse restart without forced sync layout.

- Owns: `src/ui/hud.js` (`restartCreditsChipPulse`, `refreshCredits` pulse path) + focused test
- Stay off: dummy prewarm, bloom/shadows/picture defaults, other `offsetWidth` restarts (lock ring / death banner / captions), flight-propulsion-scratch
