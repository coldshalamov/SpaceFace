// check-wingmen.mjs — guards the player-wingman contract (goal P1-8).
//
// Before P1-8, fleet ships (state.automation.fleet) were passive ledger entries — they had hp/order
// but never spawned as live objects and couldn't be commanded in combat. This check pins the contract
// that wingmen are now LIVE flyable entities:
//   1. systems/wingmen.js exists + exports the system.
//   2. The system spawns live entities from the fleet ledger (team: 0 = player-aligned) on sector enter.
//   3. Live hull syncs back to the fleet ledger each tick; death routes through onHitAsset.
//   4. Order changes (ui:fleetOrder) update the live entity's AI archetype.
//   5. The system is registered in UPDATE_ORDER.
//   6. automation.serialize strips the transient _liveId so it doesn't leak into saves.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// 1. The wingman system exists + exports correctly.
assert.ok(existsSync(join(ROOT, 'src/systems/wingmen.js')), 'src/systems/wingmen.js must exist (wingman spawn/lifecycle system)');
const wmSrc = read('src/systems/wingmen.js');
assert.match(wmSrc, /export const wingmen/, 'wingmen.js must export the wingmen system');
assert.match(wmSrc, /makeShipEntitySpec/, 'wingmen.js must build live entities via makeShipEntitySpec');
assert.match(wmSrc, /team: 0/, 'wingmen must spawn as team: 0 (player-aligned — AI auto-targets team-1 hostiles)');
assert.match(wmSrc, /_liveId/, 'wingmen must track the live entity id on the fleet entry (_liveId)');

// 2. Spawns on sector enter + despawns on sector leave (re-spawn at next sector).
assert.match(wmSrc, /bus\.on\('sector:enter'/, 'wingmen must spawn on sector:enter');
assert.match(wmSrc, /bus\.on\('sector:leave'/, 'wingmen must despawn on sector:leave');

// 3. Death routes through the existing onHitAsset path (ledger stays the source of truth).
assert.match(wmSrc, /combat:hitAsset/, 'wingman death must emit combat:hitAsset (so automation.onHitAsset removes the fleet entry)');

// 4. Order changes update the live entity's AI archetype (escort/guard/attack behave differently).
assert.match(wmSrc, /bus\.on\('ui:fleetOrder'/, 'wingmen must listen for ui:fleetOrder (order changes from the AutomationPanel)');
assert.match(wmSrc, /WINGMAN_ARCHETYPE_BY_ORDER/, 'wingmen must map orders → AI archetypes (escort/guard/attack)');

// 5. Registered in the registry (SYSTEMS + UPDATE_ORDER).
const regSrc = read('src/core/registry.js');
assert.match(regSrc, /import \{ wingmen \}/, 'registry must import wingmen');
assert.match(regSrc, /wingmen/, 'wingmen must appear in the SYSTEMS + UPDATE_ORDER lists');

// 6. automation.serialize strips the transient _liveId (doesn't leak into saves).
const autoSrc = read('src/systems/automation.js');
assert.match(autoSrc, /_liveId/, 'automation.serialize must strip the transient _liveId from fleet entries (per-session entity id)');

console.log('Wingmen OK — fleet ledger spawns as live team-0 entities, death → onHitAsset, orders update AI, _liveId stripped on save.');
