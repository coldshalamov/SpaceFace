# Grandee: consequences follow confirmed causes

## Change
The original Atlas and two escorts retain their arrival, hail, timing, formation release and rewards. This increment changes the consequence boundary:
- Observed hull loss records damage without assigning its author. Healing is neutral, including damage observed after healing above arrival hull.
- Only positive applied player damage to the original Grandee emits the harassment warning, once. Escort hits and zero-applied packets do not.
- Confirmed death of the original Grandee publishes one memorial and one loss receipt. Only a director-confirmed player kill applies the -8 MTS standing delta.
- Missing membership, removal, virtualization and teardown abort neutrally, with no obituary, loss deed or standing penalty.
- A terminal latch precedes outward callbacks, so synchronous news/reputation reentry cannot duplicate consequences.
- Damaged departure and station remembrance use neutral wording. The loss receipt remembers the ship and crew without assigning guilt or claiming escort survival.

No combat, director, Save, schema, generator, workflow or model assets change. This is a causal-script correction to the existing authored scene, not a new scene or rendered-art acceptance.

## Focused qualification
Command: `npm run check:grandee-causal-consequences`

The scene suite passed 17/17; the original scene passed only 5/17 against that regression suite. The separate conventional production-owner test passed 1/1, with zero failures or skips. Together these provide 18 passing focused tests. Source bytes and hashes were independently reviewed and reconstructed; this is not a claim that the reviewer independently reran all 18.

The owner test exercises actual `combat.onHit` and `projectile:hit`, combat damage-before-death ordering, director player/NPC/null attribution, accepted zero-applied heat packets, neutral nonlethal departure, removal/virtualization, and actual `save.serialize → JSON → loadEnvelope`. Neutral station deeds survive load without penalty replay; their TTL remains inclusive at 1800 seconds and expires at 1800.01.

The tests use forced authored encounter admission and a manually constructed player fixture. Relevant production owners were pinned to public source; the remaining dependency closure used an archive snapshot `34310c83` fallback. This was not an exact full-current-head native graph run, natural encounter admission, physics/flight simulation, browser playthrough, visual acceptance or performance qualification. Hosted PR-head-associated CI remains separately observable; GitHub may check out a synthetic merge rather than the bare PR head.

## CI registration
The new alias runs both explicit test files in one leaf, appended once to the existing `check` chain. It is reachable through `check:ci` and lands on static shard 2 at this parent. Existing command order, shard membership, workflows and prerequisites remain unchanged. No broad local suite was run; focused success is not an aggregate-green claim.

## Provenance
Publication parent: `ee049a838cff81446865cd8bbb46d056391f9965`. Fresh source and relevant owner pins match the qualification base `8810e2255aabbc7c01d8eeaf65d22f3f23cc3ee4`.
- Scene blob: `85f5849d0a3258700941622a425125164ceb4ab0`.
- Scene regression test blob: `1e5b0627448f782e9d2fb090b170a34d2145fdb8`.
- Station remembrance blob: `566d731a832516eeb731ed4dd748e90a3437d568`.
- Production-owner test blob: `caea6e5163544f1fdcb926c5d3ca5e2786a66236`.

Draft increment only. No merge or deployment.
