# CLAIM — hitch-asteroid-cell-key

Claimed by remote SpaceFace performance machine (Grok Bot VM / Code Work).

- Job: `hitch-asteroid-cell-key` (replace `${cx}:${cz}` string grid keys in asteroidField with packed integer keys — kill per-query alloc in queryAsteroidField hot loop)
- Kind: patch
- Claimed: 2026-09-22 (America/New_York)
- Scratch: `vm-work/hitch-asteroid-cell-key` (local only; never pushed)
- Phase A cite: cpu-profile-flight `queryAsteroidField` 285 ms self; alloc-profile per-frame string churn family

Do not start a second copy.
