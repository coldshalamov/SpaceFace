# STAB-09 — Consume a Swarm repair cell only when it heals the player

The real supply and economy pickup handlers currently consume a cell on full-hull player contact,
full-hull mining scoop, and NPC contact. Supply retires its ledger entry before checking whether
the collector can be healed. Once a live repair cell is recognized, publish explicit refusal
through the existing pickup receipt unless the eligible player gets a real heal. Commit the
ledger and publish one acceptance and supply cue only on success.

Owned files: `src/systems/swarmSupply.js` and `test/crucible-swarm-supply.test.mjs`.
Use the real pickup methods for the three refusals and a later successful wounded-player pickup.
Run `node --test test/crucible-swarm-supply.test.mjs`. No browser run by the worker.
