# CLAIM — sprites-idle-commit-skip

Quiet Grok Bot VM hillclimb package **#116**.

Pole: prepareFrame / renderUpdate / `_integrateSprites` residual after #115
(4 sprite buckets still paid `resetInstancedSpriteBuckets` +
`commitInstancedSpriteBuckets` every tick while `liveSpriteCount===0`).
Soft-GPU fps not a KPI.

Picture contract ON. Quiet idle-publish latch + `_activateSprite` dirty-wake.
