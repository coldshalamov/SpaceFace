# PQ-174.07 — Wave difficulty cannot override hull values

<!-- LIFETIME: ACTIVE_RECEIPT -->

The recipe validator previously accepted an injected `hpScale: 2`. It now rejects raw hull/health overrides and nested health multipliers, with the ruling in the failure message. The planner continues to select catalog enemy identities, composition and geometry; authored enemy hull values are unchanged.

The arc check now includes all thirty waves, both survival and swarm rulesets, every registered arena, and seeds 47/4242/7777. Fifteen focused arc/style tests pass. Injected doubled HP, raw hull replacement, and a nested health multiplier all fail validation.

This is the difficulty guard only. Pacing, kit score ordering, role counters, arena strategy, bosses and player return observations remain separate open leaves of PQ-174.
