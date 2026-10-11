# Kinetic League adapter (not applied)

The playable circuit lives in this folder and does not edit BRACKET, the registry, or the save system. Those files are shared with other campaigns. Apply the hunks below only when those paths are free.

Conflicting paths:

- `src/systems/bracket.js`
- `src/save/saveSystem.js`
- `src/core/registry.js`
- `src/runtime/nodeSystemFactoryTable.js`
- `src/runtime/authoritativeSystemManifest.js`

Do not call `runMatch` from the live scan. `runMatch` replays an exhibit thrust trace for tests. The live tick is `createKineticLeague().beginMatch` plus `update(dt)`, which reads `state.input.moveX` / `moveZ`, `state.input.brake`, and `state.input.actions.massline`.

## 1. `src/systems/bracket.js`

Discover the league when a scrapball match finishes. A scan taken on the league gate (closer to the gate than to the keeper) emits `kinetic-league:enter` and does not start another five-shot match.

```diff
--- a/src/systems/bracket.js
+++ b/src/systems/bracket.js
@@ -3,6 +3,7 @@
 import { BRACKET as C, BRACKET_LINES, freshBracketMemory, normalizeBracketMemory } from '../data/bracket.js';
 import { clamp, finiteXZ, goalCrossing, predictKeeperTarget, legalShot, keeperControl } from '../characters/bracketRules.js';
 import { writePhysicsControl, queuePhysicsImpulse } from '../core/physicsAuthority.js';
+import { maybeEnterLeague, noteBracketDiscovery } from '../sports/kineticLeague/discover.js';
 
 const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
 const ACTIVE = new Set(['serve', 'play', 'result']);
@@ -133,6 +134,10 @@ export function createBracket() {
       if (this._scanSource === player && p.seq <= this._seq) return;
       this._scanSource = player; this._seq = p.seq;
       if (distance(player.pos, this._center) > Math.min(p.radius, C.hailRadius)) return;
+      if (maybeEnterLeague(this.state, player.pos)) {
+        this.bus?.emit('kinetic-league:enter', { pos: { x: player.pos.x, z: player.pos.z } });
+        return;
+      }
       if (this.state.simTime < this._closedUntil) { this._say('hurt'); return; }
       if (ACTIVE.has(this._phase)) { this._cancel(true); return; }
       const first = !this.state.bracket.met;
@@ -237,6 +242,7 @@ export function createBracket() {
       this._gestureAt = this.state.simTime;
       this._say(this._score === C.rounds ? 'perfect' : won ? 'win' : 'lose', true);
       this.bus?.emit('bracket:matchFinished', { score: this._score, rounds: C.rounds, won, best: m.best, title: won ? 'Keeper of the Unreasonable Goal' : null });
+      noteBracketDiscovery(this.state, { via: 'match-finished' });
     },
     update(dt, state = this.state) {
```

`noteBracketDiscovery` writes `state.kineticLeague` only. It does not write bracket memory, credits, cargo, or hull.

## 2. `src/save/saveSystem.js`

League memory is not the credit wallet. Persist it beside bracket.

```diff
--- a/src/save/saveSystem.js
+++ b/src/save/saveSystem.js
@@ -784,6 +784,7 @@
     data.morrow = this._callSerialize('morrow') || {};
     data.vesper = this._callSerialize('vesper') || {};
     data.bracket = this._callSerialize('bracket') || {};
+    data.kineticLeague = this._callSerialize('kineticLeague') || {};
     data.ravel = this._callSerialize('ravel') || {};
@@ -4978,6 +4979,8 @@
       yield 'vesper-restored';
       this._callDeserialize('bracket', data.bracket);
       yield 'bracket-restored';
+      this._callDeserialize('kineticLeague', data.kineticLeague);
+      yield 'kinetic-league-restored';
       this._callDeserialize('ravel', data.ravel);
```

`createKineticLeague().serialize()` / `deserialize()` already speak this shape (`{ memory, session }`).

## 3. Registration

Add `kineticLeague` to the factory table and both production orders, immediately after `bracket` and before `physics`, matching the bracket clock. The system update spawns nothing until `beginMatch`. `worldFootprint` is 0 while idle.

- `src/runtime/nodeSystemFactoryTable.js`: import `{ createKineticLeague }` from `../sports/kineticLeague/system.js` and register `['kineticLeague', createKineticLeague()]`.
- `src/core/registry.js`: the same pair next to `['bracket', bracket]`.
- `src/runtime/authoritativeSystemManifest.js`: insert `'kineticLeague'` after `'bracket'` in the init list, the update list, and the phase list that already names `bracket`.

On `kinetic-league:enter`, call `beginMatch(nextUnlockedEvent(state.kineticLeague).id)`. Do not call `runMatch`.
