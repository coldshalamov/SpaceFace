# CLAIM — classify-signature-prune-membership

Quiet incremental `classifyWorld` residual after pinFacts-cache + #37 closedFormMovers:
walking `signaturesById` every tick (O(live world)) just to prove liveness.

Gate the prune on `entityIndex.version` (sanctioned spawn/despawn already bumps it).
