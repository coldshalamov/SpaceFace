# Faction Sheet — Helix Directorate (Helix)

```yaml
id: faction_helix
name: Helix Directorate
short: Helix
color: "#8C9BAA"   # not in factions.js palette; using neutral steel-gray per prose
primary_function: legal-corporate membrane and tariff enforcement
betrayal_pattern: |
  A Helix customs cutter flies with MTS transponders 60% of the time and
  Reach hulls the remaining 40%. When it destroys a Quiet smuggler, the cargo
  is logged as "recovered contraband" then sold at Bourse Station under an
  MTS manifest. The same crew receives a Reach bonus if the kill happened
  inside a contested lane.
hud_graffiti_lie: Patrol logs read "lawful interdiction" while the cargo manifest shows the seized goods already assigned to a private buyer.
spacer_superstition: Never file a claim against a Helix cutter; the logs will show the cutter was "under orders" and the claim will be reassigned to the original owner as a debt.
prison_origin: The same men who once signed the daily quota reports now sign the tariff schedules. The pen is the same. The hand has not changed.
silt_role: |
  The legal-corporate membrane that launders the Silt economy's rougher
  edges into legitimate-seeming freight. Helix cutters operate across the
  faction membrane (MTS/Reach) so that confiscated Silt can be re-sold
  through whichever channel maximizes the margin. They are the layer that
  makes the corruption read as commerce.
dostoyevsky_layer:
  theme: crime_without_punishment_system_stolen
  expression: |
    The invoice and the fine are written in the same hand. Helix is the
    faction that most literally embodies the audit's thesis — the system runs
    on signatures, every signature is correct, the signatures add up to a
    planet suffocating, and no single signature is the one that did it. The
    pen is the same. The hand has not changed.
canon_refs:
  - ../../orgs/factions-CANONICAL.md#Helix Directorate
appears_in_chapters: [B4, B5]
register_rule: |
  Paper voice, not radio voice. ALL CAPS filing, vessel first, file number
  over name. The invoice and the fine in the same hand. No action required:
  the filing is the action. No slang, no bravado, no liturgy. Basis: one
  once-flagged filing; Helix has no bark table.
register_tell: |
  VARIANCE FILE OPEN
  VARIANCE FILE
  variance
  NO ACTION REQUIRED
  no action
  DO NOT RESOLVE
  Helix
register_forbidden: |
  ain't
  weigh-slip
  reweigh
  clause
  pattern
  liturgy
  chorus
  tithe
  salvage
  accord
  syndicate
register_example: |
  VESSEL VHL-4471-T — VARIANCE FILE OPEN. COORDINATES ON ATTACHED MANIFEST DO NOT RESOLVE. NO ACTION REQUIRED.
register_example_cite: src/data/narrative.js#COMMS.story.story_b8_helix_audit
voice_direction: |
  Unvoiced paper filing. Helix has no bark table and no PQ-158.04 voice
  register; the filing renders as text only. resolveVoiceRegister falls back
  to faction_free for unknown houses — that fallback is not Helix's voice
  and must never voice a Helix filing.
```

**Signature faction graffiti:** *The invoice and the fine are written in the same hand. Read the invoice first.*

**Canon note:** Helix Directorate is the corpus's canonical 8th faction (`orgs/factions-CANONICAL.md`). It does NOT appear as a playable `factionId` in `src/data/factions.js` (which has 8 factions: scn, mts, reach, dmc, quiet, vael, free, choir). The playable faction `faction_free` (Free Frontier) has no canon faction sheet — flagged as a canon/data mismatch in INDEX.md for resolution.
