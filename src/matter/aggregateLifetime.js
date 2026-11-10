// The authored-lifetime stash a held body carries while a tool holds it in stasis (Gyre's core, the
// Pull collector's knot). One implementation, so a tool can never leave a freed body immortal or a
// handed-back one assassinated: both lifetime channels — data.despawnAt (the data-table deadline) and
// entity.ttl (the lifetime sweep) — are stashed and cleared on capture, and restored on release.
//
// Keys are shared with Gyre's hand-back/boundary machinery (gyrePrevDespawnAt / gyrePrevTtl).

/** Stash both lifetime channels and plant the stasis (no deadline, ttl = Infinity). */
export function stashLifetime(e) {
  e.data = e.data || {};
  // Normalize the stash: the serializer's clonePlain maps non-finite to 0, NOT null — a raw Infinity
  // despawnAt/ttl would round-trip as a 0 stash, fail the absent check on restore, and insta-kill
  // the body. Absent and non-finite authored values stash as null (deadline-free), positive finite
  // values stash verbatim.
  e.data.gyrePrevDespawnAt = Number.isFinite(e.data.despawnAt) ? e.data.despawnAt : null;
  e.data.gyrePrevTtl = Number.isFinite(e.ttl) ? e.ttl : null;
  delete e.data.despawnAt;
  e.ttl = Infinity;
}

/**
 * Restore what `stashLifetime` took. `futureOnly` is the hand-back contract (a foreign owner took the
 * body): its own deadline wins, a stale stash is dropped, and nothing is resurrected into the past.
 * `now` is the sim clock (needed only for futureOnly).
 */
export function restoreLifetime(e, futureOnly, now) {
  // Stashed at snag: a freed (non-launched) core resumes its authored deadlines
  // instead of living forever as stasis residue.
  if (!e || !e.data) return;
  // 'in' not '!== undefined': an absent authored despawnAt stashes undefined and
  // must restore ABSENT (and still consume the stash key) — otherwise every freed
  // core that had no authored deadline carries a dead residue key forever.
  if ('gyrePrevDespawnAt' in e.data) {
    // '!(v > 0)' not '== null': a serialized stash that was non-finite at
    // write round-trips as null, and a legacy/foreign 0 stash is the same
    // absent contract — restoring despawnAt = 0 would be an insta-kill, not
    // an authored deadline.
    if (!(e.data.gyrePrevDespawnAt > 0)) {
      if (!futureOnly) delete e.data.despawnAt; // absent authored → restore absent
      // futureOnly: a foreign owner's own deadline (if any) wins — leave it.
      delete e.data.gyrePrevDespawnAt;
    } else {
      // futureOnly (hand-back): the body's CURRENT owner keeps its deadline. Restore
      // the authored stash only when nothing else set one AND it's still in the
      // future — resurrecting a stale stash assassinates an adopted body on the next
      // lifetime sweep, and clobbering a live launch deadline would cut a still-
      // flying overflow ball's flight short.
      
      // A non-finite now can't prove the stash is stale — treat unprovable
      // as unfresh and skip the restore rather than writing a possibly-past
      // deadline into a body we can't sweep honestly anyway.
      if (futureOnly && (e.data.despawnAt != null
        || !Number.isFinite(now)
        || e.data.gyrePrevDespawnAt <= now)) {
        delete e.data.gyrePrevDespawnAt;
      } else {
        e.data.despawnAt = e.data.gyrePrevDespawnAt;
        delete e.data.gyrePrevDespawnAt;
      }
    }
  }
  // 'in' not '!== undefined': an absent authored ttl stashes undefined and must
  // restore ABSENT (e.ttl = undefined) — otherwise a released body keeps the
  // Infinity the snag planted instead of round-tripping as authored.
  if ('gyrePrevTtl' in e.data) {
    // The countdown channel is RELATIVE — frozen at snag, it can't go stale like an
    // absolute despawnAt. Resuming it under futureOnly is the honest authored state:
    // an adopter keeping the body strips deadlines itself, and a released hand-back
    // must not leave immortal debris. A non-positive stash restores nothing.
    if (futureOnly) {
      // Same current-owner guard as the despawnAt branch: a foreign owner that
      // assigns its own finite ttl keeps it — the snag only planted Infinity, so a
      // finite e.ttl here is owner-set and wins. Infinity still restores authored.
      // An absent OR non-positive stash restores nothing — and must not leave the
      // snag's planted Infinity behind either (immortal debris): delete instead.
      if (!(e.data.gyrePrevTtl > 0)) {
        if (!Number.isFinite(e.ttl)) delete e.ttl;
      } else if (!Number.isFinite(e.ttl)) {
        e.ttl = e.data.gyrePrevTtl;
      }
      delete e.data.gyrePrevTtl;
    } else {
      // Same '!(v > 0)' absent contract as the despawnAt branch: a null or
      // non-positive stash (absent authored, or a serialized non-finite that
      // round-tripped as 0 before the write-side normalization) restores
      // ABSENT — writing e.ttl = 0 would decrement a corpse deadline into
      // the body and kill it on the next lifetime tick.
      if (!(e.data.gyrePrevTtl > 0)) delete e.ttl;
      else e.ttl = e.data.gyrePrevTtl;
      delete e.data.gyrePrevTtl;
    }
  }
}
