# E-02 catalog — save/load & persistence
`src/ui/screens/saveNotices.js` (clean) is the persistence-rememberance surface: REASON_WORD
maps failure codes to plain clauses, recoveryNotice/generationAge speak in "generations".
The reason bank had 11 words; recovery flows can emit more reason kinds than it covers.
Landed: +6 reason words (tombstoned, attestation_failed, peer_conflict, empty_profile,
corrupt_backup, write_interrupted) — dormant until an emitter names them, same default path.
