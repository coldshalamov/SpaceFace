# CLAIM — roster-retain-stable

Quiet `registry.step` → tacticalAI → `ai.stack` residual after #66:
`liveListSquads` rebuilds the full roster (member alloc + rosterSignature
strings) every tick even when membership/identity is unchanged. Retain the
live roster and refresh only mutable fields (pos/activity/alive/authority)
when a cheap membership key matches.

Scratch: `vm-work/hillclimb-20260924h`
Profile cite: `settled-45s-stacked-20260924ac`; liveListSquads under ai.stack.
