# Reactive Matter live adapter

`reactiveMatter` is the single registered material-law pass after physics. Adventure yards in Helios, Ceres and Vesta use ordinary numeric entities and existing release selectors. The system receives the real `physics:impact` bus and reads the existing field system's public `kernelList()`; native owners and field kernels remain outside GameState.

Registration uses the same system in browser and Node. Save calls `serialize()` / `deserialize()` before sector entry. Serialization preserves derived shard mass and excludes transient observer bodies. Sector exit removes owned live bodies while retaining the material world.

Impulses use `queuePhysicsImpulse`, including one bounded recoil at anchored machinery. Fractured parents retire their collider; fragments receive stable material keys with fresh entity ids. Existing combat attachment `rebind` preserves live Massline custody. No second integrator, direct velocity write, or private state.physicsOwner/state.fieldsKernel hook is required.

Laboratory demo tapes are accepted only with the explicit `helpers.reactiveMatterLab` fixture port. Adventure never delivers those inputs to the player. Optional material marker rendering consumes the material cue data; cargo and yard equipment already select authored release models.
