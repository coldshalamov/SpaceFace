# Player-truth FAIL · Swarm launch on debe715c8a

Renderer: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) (software GL). Seed 4242. Ricochet Foundry. Headless 960x540 unless noted. Commit measured: 256a39e208, on origin/master debe715c8a.

## Verdict

FAIL route. `Open armory` never opens `crucibleDraft`. The run stays `kind=adventure` `phase=inactive` `top=none`. The last telemetry sample puts the ship at **(-1900, -2200)**, the `helios_core` arena spawn (`src/data/combatLabSetups.js`). The door relocated the player. Survival did not begin. The failure frame is the Adventure training derelict HUD, not a Swarm round.

Owner: local integration (`requestCrucibleRun` → `applySandboxSetup` relocates; `runSession` leaves `state.run` as adventure). Lane 6's room, station toy, and LOD do not run until a survival run exists.

## Combos with the same ending

| run | samples in flight/adventure/inactive | last position |
|---|---|---|
| idle `--gate` seed4242-debe715 | 3844 | -1900, -2200 |
| active `--gate` seed4242-debe715 | 3911 | -1900, -2200 |
| ricochet_runner 960x540 | 3825 | -1900, -2200 |
| energy_baseline 960x540 | 3933 | -1900, -2200 |
| kinetic_baseline 960x540 | 3300 | -1900, -2200 |
| mirror_demonstrator 960x540 | 4077 | -1900, -2200 |
| ricochet_runner 1280x720 | 3052 | -1900, -2200 |

1920 and the other 1280 hulls were not run. The miss is before a Swarm ship is on screen, so no combo shows a rectangle or an invisible Swarm hull.

Contact sheet: `contact-sheet.jpg` (idle pass: main menu, then the Adventure HUD).

Command: `npm run player-truth -- --mode=swarm --arena="Ricochet Foundry" --seed=4242 --gate`
