# IMPORT — particles-idle-commit-skip

## What

Portable CPU cut for quiet `_integrateParticles` under prepareFrame → VFX after
#89: `vfx.update` always called integrate even when `liveCount===0`, re-asserting
and `commitDynamicBufferOwner(0)` every frame. After the first idle publish,
`mesh.count` is already 0 — skip until the next spawn. Picture unchanged.

## Live path (later, by owner)

- `src/render/vfx.js` — `_integrateParticles`, `_activateParticle`,
  `_syncParticleQuality`, pool init (`_particlesPublishedIdle`)

## Apply

```bash
git am design/program/vm-drop/particles-idle-commit-skip/patches/*.patch
```

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
