# Faction Sheet — Solar Concord Navy (Concord)

```yaml
id: faction_scn
name: Solar Concord Navy
short: Concord
color: "#3A78FF"
primary_function: customs enforcement and jump-gate control
betrayal_pattern: |
  A patrol accepts a bribe to overlook contraband, logs the payment as
  evidence, then fines the same ship at the next gate for the identical cargo.
hud_graffiti_lie: Scan tags read "cleared — no contraband" on vessels that still carry sealed crates the Concord later claims as seized.
spacer_superstition: Never speak a dead officer's name inside a Concord beacon radius; the logs will attribute any nearby wreck to that name and close the file.
prison_origin: The wardens kept ledgers. They still do. Every scan at a gate repeats the old intake ritual — names, numbers, contraband counts.
silt_role: |
  Guards the Silt distribution lines. Concord patrols enforce "Silt Quotas" at
  gate checkpoints. They scan cargo holds not for weapons, but for unregistered
  or stolen Silt canisters. Under REG 44-C, unauthorized possession of Silt is
  classified as "Logistical Theft," resulting in immediate seizure and
  reallocation to Core administrative depots. (Vale's division administers this.)
dostoyevsky_layer:
  theme: crime_without_punishment_system_stolen
  expression: |
    The Concord is the enforcement arm of the system that steals the
    punishment. It logs crimes as lawful seizures. Its beacons attribute
    wrecks to dead officers to close the files. The prison ledgers became
    the customs database without changing format.
canon_refs:
  - ../../orgs/factions-CANONICAL.md#Solar Concord Navy
  - ../../story/ATMOSPHERIC-ECONOMY.md#3-faction-behaviors-systemic-incentives
appears_in_chapters: [B2, B4, B7]   # Choice A "Clean Uniform" joins Concord
register_rule: |
  Bloodless clerk. Cite the ref on every hail. Short declarative sentences.
  No contractions, no slang. Threats arrive as procedure: the consequence is
  always a record — cited, seized, flagged, logged. End on the record.
register_tell: |
  Ref 44-C
  Concord
  transponder
  checkpoint
  inspection
  corridor
  your manifest
  contraband
  cited
  citation
  compliance
  comply
  compliant
  seal codes
  patrol
  filing
  evasion
  surcharge
  Ref 77-A
  casualty
  mayday
  flagged
  accrue
  advisory
  noted
  report
  paperwork
  escalation
  dispatched
  maneuver
  tags
  lawful
  customs
  witnesses
  reclassified
register_forbidden: |
  ain't
  weigh-slip
  reweigh
  clause
  pattern
  variance
  tithe
  salvage
  liturgy
  chorus
  ascension
  syndicate
  meridian
register_example: |
  Concord Patrol. Stand by for routine transponder verification. Ref 44-C.
register_example_cite: src/data/barks.js#faction_scn.scan[0]
voice_direction: |
  Directed synthetic clerk (PQ-158.04 bark_scn: f0 110 Hz, rate 0.94x,
  bandpass 420-2600 Hz). Flat radio, unhurried; the ref number lands and
  nothing else lifts. No recorded actor.
```

**Signature faction graffiti:** *Every name logged. Every shift counted. Every warden re-signed.*
