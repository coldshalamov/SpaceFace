# Entry baseline — "Make the Massline Work" chunk

Recorded at HEAD `7f7d030b`, working tree clean except the four untracked design docs
(`AGENT_EXECUTION_GUIDE.md`, `NEXT_CHUNK_KICKOFF.md`, `PHYSICAL_PLAY_BUILD_PLAN.md`,
`PHYSICAL_PLAY_GRAMMAR.md`) and three modified (`PLAN_REGISTRY.md`,
`00_EXECUTION_PROTOCOL.md`, `VALIDATION_WORKFLOW.md`).

Per `00_EXECUTION_PROTOCOL.md` §7: a check green here and red at exit is a defect.
A check red here is repaired or escalated — never inherited.

## Verified RED

| Check | Status | Detail |
|---|---|---|
| `npm run check` | **EXIT 1 — dies in the `precheck` npm lifecycle hook** | `package.json:464` `"precheck": "npm run check:m1:tether-mass && npm run check:sim:v3 && npm run check:sim:v3:compare"`. npm runs this automatically before `check`. `check:m1:tether-mass` passes, `check:sim:v3` fails. **Zero of the 97 chain links execute.** |
| `check:sim:v3` | RED, **deterministic** (3/3 identical) | golden `a6c96aad61fc4c185c070e0d9349e5d3e7a860cf47d86c0ffea190a20d9e0ff1` → actual `7d6dffeb11e8fb89596ed443450e889e13ad6cd86173aa4f78ed32c6a0e1ad8a` (`test/47a.telemetry.v3.expected.json`) |
| `check:sim` | RED, **deterministic** (3/3 identical) | golden `7f4ecb2d454de26248a263f3faa24cebcffd4640e7c0669ce5fb10be9eed4ea1` → actual `271605e7639ef3ec8519c42a9d8b227938fdac76aa72bd914a6c922f13588af1` (`test/47a.telemetry.expected.json`) |
| `check:massline` | RED | `scripts/check-massline-release-feedback.mjs:60` — "clean release should emit exactly one UI alert (no double-toast)", `0 !== 1`. The assertion name says *double*-toast; the actual count is **zero**. Clean release emits no player-facing cue at all. |

Both hash drifts are stable across repeated runs, so this is honest drift, not flake.
Rebaselining is mechanically safe; whether it is *correct* requires knowing what changed.

## Verified GREEN (do not break)

| Check | Detail |
|---|---|
| `check:sim:compare` | `"ok": true, "deterministic": true` — exit 0 |
| `check:save-schema` | `SAVE_SCHEMA.md OK (version 12, 274 paths)` — exit 0 |
| `check:flight:v3` | PASS, 15 brake-convergence cases |
| `check:m1:tether-mass` | PASS |

## Kickoff claims falsified by this baseline

`design/NEXT_CHUNK_KICKOFF.md` Lane 1 was written 2026-07-26 and four of its five bullets
have aged or were wrong:

1. ~~"dies around link 79 on `check:sim:compare`"~~ — `check:sim:compare` is **green**. The chain
   dies *before link 1* in the `precheck` hook. Not 18 gates unreachable: **all 97**.
2. ~~"`check:save-schema` is red"~~ — it is **green**. (It is still genuinely absent from the
   `check` chain, so the "add it" half of the item stands.)
3. ~~"`NOW.md:35` claims `check:sim:compare` is green"~~ — line 35 is a PQ-021 status row and says
   nothing about sim. No such claim found in `NOW.md`.
4. `check:massline` is red and the kickoff does not mention it at all.
5. **Stands, verified:** `GDD_2_0.md:45` "Control scheme — 'Helm Assist' (new default)" and `:54`
   "**Space** = **brake-to-stop**" are both false against `src/core/gameState.js:25`
   (`controlScheme: 'pilot'`), `src/systems/input.js:222` (`tether: ['Space','KeyF']`) and
   `:269` (`brake: ['Digit0']`).

## Source anchors re-verified at this HEAD (all exact)

- `src/systems/tetherGameplay.js:282` `_refreshAcquisitionPreview`, `:316` `_consumeAcquisitionReceipt` — **zero production callers**
- `src/ui/masslineHud.js:175` `_updateAcquisitionPreview` — **zero production callers**
- `src/combat/autoTargetMode.js:265` `pickMasslineAutoTarget` — exported, called only by its own check script
- `src/ai/combatDoctrine.js:406` `if (contact.tethered) return -100`
- `src/systems/mining.js:126-131` unconditional `delete beam.heat/heatRate/coolRate/overheated/_heat/heatMax`
- `src/systems/mining.js:37` `BULK_HAUL_MIN_U = 20`; `:46` `SEAM_YIELD_OFF = 0.35`
- `src/systems/mining.js:953` emits `danger:miningNoise` — **zero subscribers in `src/`**
- `src/render/thruster/systems/familyFleet.js:18` `FLEET_MAX_SHIPS = 10`, mirrored `src/render/vfx.js:391`
- `src/render/vfx.js:5088` `_bloomRadianceScale` returns `clamp(strength/0.35, 0, 1)`
- `src/systems/weapons.js:396-397` `if (!taut) return null`
- `src/systems/missions.js:533` `update()` — deadline only
