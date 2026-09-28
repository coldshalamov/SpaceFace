---
name: spaceface-live-testing
description: How to run and live-verify SpaceFace gameplay in this environment — dev server env var, WebGL flags for Chrome, window.SF debug access, console-spawned combat squads, and the inspectAI response shape.
---

# SpaceFace live gameplay testing

## Running the game locally

- Node on this Linux box is at `~/.nvm/versions/node/v24.19.0/bin/node` (repo blueprint's `/c/hostedtoolcache/...` path is for a Windows runner; sim goldens are runtime-sensitive — use the same node24 for sim/probe work).
- Dev server: `SPACEFACE_PLAYER_STORE_DIR='' node server.js` from the repo root → http://localhost:8123. The env var is required for browser testing (repo rule); empty means ephemeral player store.
- Run ONE node process at a time (timing probes starve otherwise).
- `npm start` also works.

## Chrome on this box

- **Prefer the automation-attached Chrome for Testing** (the window the `computer`/`browser_console` tools see): `browser_console` runs arbitrary JS against it and WebGL boots fine — no DevTools-typing, no autocomplete mangling, no SwiftShader flags needed. Check first: `typeof window.SF` via `browser_console` — if it returns `"object"`, drive the entire harness through `browser_console` calls.
- `await` at top level of a `browser_console` eval fails (`CDP evaluation failed`). Use `import('/helper.js').then(m=>{window.QA=m})` (no await) then verify `typeof window.QA` in a second call. Return `JSON.stringify(...)` for readable results.
- Fallback (manually launched Chrome): `browser_console` cannot attach — use in-page DevTools (F12), launched with `google-chrome --enable-unsafe-swiftshader --use-gl=angle --use-angle=swiftshader http://localhost:8123`. DevTools console autocomplete corrupts long pasted expressions (`Object`→`NObject`, `JSON`→`J50`) — keep input to short bare calls; put real logic in an on-disk module served by the dev server (`/qa-live.js`) and `import()` it.

## Runtime debug surface

- `window.SF` exists in dev builds: `{state, bus, registry, ctx, helpers, THREE, loop}`.
- `SF.helpers.spawnEntity(spec)` — `spec` from `makeEnemySpawnSpec(typeId, lvl, {x,z}, {})` (importable from `/src/systems/combat.js` in the console). To make a hostile actually engage, stamp the same fields `aiEncounter._spawnDue` writes: `spec.data.ai.squadId`, `ai.roe='weapons_free'`, `ai.passive=false`, `ai.activity={kind:'attack_run',targetId:SF.state.playerId,anchor:{x,z},leashRadius:4000,startedTick:SF.state.tick}`, `spec.data.combat.targetId=SF.state.playerId`.
- `SF.helpers.inspectAI(query)` wraps the tactical stack — **the response is `{version, ok, method, result}`**; the inspect sections live at `res.result.{director,squads,perception,behavior,maneuver,combatDoctrine,enemyMind,trace}` (`res.result.maneuver` is the planner's `byEntity` map: per-entity `lastKind`, `lastReflex`, `reflex.burst`, `stationaryTicks`). `inspectAI({entityId})` scopes to one ship.
- `ai.squadFrame` stamp on engaged entities carries live choreography state: `phase`, `role`, `socket`, `fireAuthorized`, `integrity`, `slotError`, `cycle`.
- Reflex evaluation on squadded ships varies by branch: on the reflex-library build `lastReflex`/`reflex.burst` populate on formation-owned members (stances + bursts layer over `lastKind:'formation'`); on the earlier build a `!choreo` gate left them null — always check empirically before concluding reflexes are dead.
- A `watchAll` sampler (poll `inspectAI` every ~80ms, push `[tick,id,lastReflex,burst,hull]` rows) accumulates a kinds histogram over a whole fight — the definitive "what reflexes actually fired" evidence.
- `player.flags.invuln = true` (via `SF.state.entities.get(SF.state.playerId).flags`) lets you observe a long fight without dying. Player field is `flags`; hull is `e.hull`/`e.hullMax`.
- Teleport for QA positioning: set `p.pos.x/z`, `p.prevPos.x/z`, `p.vel=0`, `p.physicsBody.revision++`.

## Gotchas seen in practice

- sector_helios_prime has `enemyDensity: 0` — no ambient hostiles near spawn; the Helios station-exclusion bubble (~1200 WU) also makes live encounters claim console-spawned hostiles into `enc_*` squads with `roe:hold_fire`/`act:loiter`. Teleport the player ~2500+ WU out before spawning test squads.
- Ambient engagements: waiting isn't needed — console-spawned engaged squads exercise the identical `assignAutoSquadRecipes → squadFrame → reflexes → temperament` pipeline; the encounter director may ALSO spawn authored `squadRecipe` wings (`sg06_vael_wing_*`, `pincer_sweep`) mid-fight, giving free authored-path coverage.
- LMB fires along the ship nose, NOT toward the cursor — aim tests need `spawnAhead` or steering, not click-to-shoot.
- Pre-existing unrelated console noise: `vfx.js ... spawnStationSideEventStreak is not a function` (render-side) and `[GPU brick] bloom scene` dumps — not AI errors.
- Squad observation gotchas: squads dissolve (record leaves `inspectAI().result.squads`) when members hit `flee` — covering-retreat probes must catch the transition window, not the aftermath. Doctrines reassign mid-fight (`combatDoctrineId` drifts to shield_breaker/swarm_pack), which drops members' `squadRecipe`/`squadFrame` stamps — snapshot recipes early.
- **Scripted kills: `e.hull=0; e.alive=false` is a silent no-op** — hull/alive are re-synced from the damage/component authority every tick, so the fields revert and nothing dies. For a real kill use the damage router: `import('/src/combat/damage.js?x=N')` → `scalarHitToDamagePacket({damage:99999, damageType:'kinetic', pos})`, set `packet.flags={ignoreFriendlyFire:true, allowAnyTarget:true}`, then `SF.registry.get('combat').kernel.routeDamage({attackerId:SF.state.playerId, targetId, packet, origin:{kind:'qa',id:'x'}})` — verify `result.ok` AND `entities.get(id).alive===false`.
- **Entity ids recycle instantly** — a killed ship's slot refills within ticks (observed as `type:'projectile', hullMax:1` under the same id). Always check `e.type==='ship'` on the target right before killing, and don't trust an id captured seconds ago.
- **Verify the page is running the code you think it is** — after a new commit lands, the live page's module graph may still be stale (observed: live `reflexState` objects lacked `lossUntilTick`/`hitUntilTick` while the served file had them — every negative result on that page was invalid). Compare a live planner object's keys against a fresh `import('/src/ai/reflexes.js?x=N').then(m=>Object.keys(m.emptyReflexState()))`, or just hard-reload after pulls. `JSON.stringify(new Map())==="{}"` — read `.size`, never JSON, for `seenAllies` and similar.
- The wingmate-loss roster only feeds members with a live choreo/cohort plan (`squadMembers: choreo ? choreo.squadMates : null`); `kind:'intercept'` (non-choreo'd) members get `squadMembers:null` and rely on the contacts path, which instant id-recycling defeats. 2-ship squads can't verify grief — killing one dissolves the frame. Use ≥3-member squads and expect the survivor to die fast in a hot field; teleport to clean space (~6500,-6500 or farther) for controlled kills.
