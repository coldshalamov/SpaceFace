// Tether cable event pictures. VFX retains the cable pools, event wiring, and frame lifecycle.
export function createTetherCableEventMethods({
  SPR_FLASH,
  SPR_RING,
  TETHER_RELEASE_FADE_RATE,
  TETHER_SNAP_FADE_RATE,
  clearMasslineReleaseTarget,
  clamp01Finite,
  masslineChainNoteRelease,
  random,
  releaseClassification,
  releaseClassificationColor,
  releaseCuePicture,
  releaseCutMark,
  sameTetherIdentity,
  writeTetherVisualEndpoints,
}) {
  return {
    // Snap burst at both cable ends when the line breaks under load (tether:broken).
    // Top-50 rank-2 massline pack: louder break — dual-end sparks + white-hot flash + longer scatter.
    _tetherBreakMatchesCable(p, cable = this._tetherCable) {
      if (!p || !cable || !(cable.wasActive || cable.fade > 0.001)) return false;
      if (cable.lastSourceId == null || cable.lastTargetId == null) return false;
      if (p.targetId != null && !sameTetherIdentity(p.targetId, cable.lastTargetId)) return false;
      // actorId names the controller that cut the attachment; it is not necessarily the rendered
      // remote source. Only an explicitly published source/owner id may constrain that endpoint.
      const receiptSourceId = p.sourceId != null ? p.sourceId : (p.ownerId != null ? p.ownerId : null);
      if (receiptSourceId != null && !sameTetherIdentity(receiptSourceId, cable.lastSourceId)) return false;

      const receiptAttachmentId = p.attachmentId;
      const retainedAttachmentId = cable.lastAttachmentId;
      if (receiptAttachmentId != null || retainedAttachmentId != null) {
        return receiptAttachmentId != null && retainedAttachmentId != null
          && sameTetherIdentity(receiptAttachmentId, retainedAttachmentId);
      }
      // Legacy presentation receipts did not carry attachmentId. Target identity is the narrowest
      // safe fallback; a receipt without either identity cannot claim the retained cable.
      return p.targetId != null && sameTetherIdentity(p.targetId, cable.lastTargetId);
    },

    _onTetherSnap(p) {
      // Attachment cuts report through tether:broken before tetherGameplay publishes the semantic
      // ordinary-release pair. A player `tether_cut` must therefore skip the violent snap grammar.
      // The default cut reason and a plain release are the same let-go; only a real break snaps.
      if (p && (p.reason === 'tether_cut' || p.reason === 'cut' || p.reason === 'release')) return false;
      const cable = this._tetherCable;
      if (!cable || !this._scene || !this._tetherBreakMatchesCable(p, cable)) return false;
      // Hold the ribbon even when the anchor was already swept (mined-out rock, killed payload).
      // The burst below needs live endpoints; the fade does not. Returning early used to skip this
      // state and left the next VFX frame to hide a still-active cable against a missing target.
      // Fade state is committed before any later cosmetic call so a throw in reset/burst cannot
      // skip it.
      cable.snapAge = 0;
      cable.latchAge = 999;
      cable.fadeRate = TETHER_SNAP_FADE_RATE;
      cable.wasActive = false;
      if (cable.fade < 1) cable.fade = 1;
      this._resetMasslineReleaseArc();

      const source = this._ent(cable.lastSourceId);
      const target = this._ent(cable.lastTargetId);
      const endpoints = cable.endpointScratch || (cable.endpointScratch = {});
      const hasEndpoints = !!(source && target
        && writeTetherVisualEndpoints(source, target, cable.lastRemote, endpoints));

      this._emitJuiceCue('presentation.tether.break', p, 1.5);
      // Do NOT hide the cable. A break is the most violent thing the massline ever does and it used
      // to be the only event in the game with no line on screen at all: the ribbon was hidden on the
      // same frame the sparks appeared. Hold it, whip it, and let it burn out.
      //
      // This is presentation only. The line is deliberately near-unbreakable and a break is an
      // ENGINEERED event (bomb-web hub, cutting charge), never an ambient one — nothing here changes
      // when a break happens, only what it looks like when one does.
      // A valid receipt can still describe overlapping endpoints (for example, a source embedded in
      // a despawning target). Keep the retained line's fade state, but do not stack two identical
      // bursts or divide a zero-length recoil chord.
      if (!hasEndpoints) return true;

      try {
        this._spawnTetherSnapBurst(cable, source, target, endpoints);
      } catch (_) {
        // Burst is cosmetic. Fade state above must survive a particle/light spawn failure so the
        // next frames can hide the ribbon instead of throwing from vfx.update.
      }
      return true;
    },

    _spawnTetherSnapBurst(cable, source, target, endpoints) {
      void cable;
      void source;
      // Trailing streak: the recoiling line reads as light dragged through space. Anisotropic sprites
      // stretched ALONG the broken chord (the instanced pool already carries aspect + roll), laid down
      // from each end toward the middle so both halves visibly snap back.
      const dx = endpoints.bx - endpoints.ax;
      const dz = endpoints.bz - endpoints.az;
      const chord = endpoints.chord;
      if (!(chord > 1e-6) || !Number.isFinite(chord)) return;
      const ux = dx / chord, uz = dz / chord;
      const roll = Math.atan2(uz, ux);
      const px = -uz, pz = ux;
      const lash = Math.max(4, Math.round(9 * (this._burst || 1)));
      for (let k = 0; k < lash; k++) {
        const f = (k + 0.5) / lash;
        // Recoil is fastest at the ends and slowest mid-span, like a real parting cable.
        const endBias = Math.abs(f - 0.5) * 2;
        const recoil = (28 + 120 * endBias) * (f < 0.5 ? -1 : 1);
        const lateral = (random() - 0.5) * 46;
        this._spawnSprite(
          SPR_FLASH,
          endpoints.ax + dx * f, 1.5, endpoints.az + dz * f,
          0.16 + random() * 0.14,
          Math.min(14, chord * 0.16), 1.2,
          0.95, 0.0,
          k % 3 === 0 ? '#ffffff' : '#ffb35c',
          ux * recoil + px * lateral, uz * recoil + pz * lateral,
          3.5, roll,
        );
      }

      // Spark exactly at the two visible cable endpoints. The prior 34-per-end burst could consume 68
      // particle slots before the recoil ribbon and lights were admitted; preserve the dual-end read
      // with a quality-scaled 14..22 budget instead.
      //
      // massline_release port (VFX NEXT recipe, beat 3): on the TARGET end the burst obeys the
      // released body's ACTUAL retained velocity — directions collapse into a cone around it, speeds
      // and streak lengths scale with it — so the break hands the frame to the body's momentum
      // instead of an isotropic starburst. Counts, endpoint positions and the per-quality budget are
      // unchanged (acceptance-pinned); a target at rest keeps the uniform burst. The source end
      // recoils rather than departs, so it keeps the uniform read.
      this._c0.set('#ffffff'); this._c1.set('#ff5c5c');
      const targetVelX = target.vel && Number.isFinite(target.vel.x) ? target.vel.x : 0;
      const targetVelZ = target.vel && Number.isFinite(target.vel.z) ? target.vel.z : 0;
      const targetSpeed = Math.hypot(targetVelX, targetVelZ);
      const momentumAimed = targetSpeed > 1;
      const releaseAngle = momentumAimed ? Math.atan2(targetVelZ, targetVelX) : 0;
      for (let end = 0; end < 2; end++) {
        const endX = end === 0 ? endpoints.ax : endpoints.bx;
        const endZ = end === 0 ? endpoints.az : endpoints.bz;
        const n = Math.min(22, Math.max(14, Math.round(22 * (this._burst || 1))));
        const aimed = end === 1 && momentumAimed;
        for (let k = 0; k < n; k++) {
          const a = aimed
            ? releaseAngle + (random() - 0.5) * 1.1
            : random() * Math.PI * 2;
          const v = aimed
            ? targetSpeed + (34 + random() * 110) * (0.6 + random() * 0.9) * 0.55
            : 34 + random() * 110;
          // Spark trails inherit their own direction so they streak instead of dotting; the aimed
          // end stretches them further with the retained speed.
          const stretch = aimed ? 0.85 * (1 + Math.min(2, targetSpeed / 120)) : 0.85;
          this._spawnParticle(endX, endZ, Math.cos(a) * v, Math.sin(a) * v,
            0.24 + random() * 0.34, 1.5, 0.0, this._c0, this._c1, 4.2, 0, 0, a, stretch);
        }
        this._spawnSprite(SPR_FLASH, endX, 0, endZ, 0.10, 4.6, 9.5, 1.0, 0.0, '#fff2e2', 0, 0);
        // The recoil ring is a shock, not a smoke cloud: fast, thin and hot. At 16 wu it swallowed the
        // whole ship in a flat orange donut for a third of a second.
        this._spawnSprite(SPR_RING, endX, 0.9, endZ, 0.26, 1.4, 8.5, 0.55, 0.0, '#ffc9a0', 0, 0);
        this._eventLight({ x: endX, z: endZ }, 'tether', { severity: 'snap' });
      }
    },

    // A normal cut is a transfer of visual ownership: the rope recoils for one short beat at both
    // retained surface endpoints, then the released body's real velocity becomes the dominant line.
    // This consumes cached render pose and live entity snapshots only; it never selects a camera
    // target, changes velocity, or manufactures a release when no retained cable identity exists.
    _onTetherRelease(p) {
      // A later rating may paint only this exact, successfully rendered release transaction.
      this._resetMasslineReleaseToken();
      const cable = this._tetherCable;
      if (!cable || !this._scene || cable.lastSourceId == null || cable.lastTargetId == null) return false;
      if (!p || p.targetId == null || !sameTetherIdentity(p.targetId, cable.lastTargetId)) return false;
      const source = this._ent(cable.lastSourceId);
      const target = this._ent(cable.lastTargetId);
      if (!source || !target) return false;
      const endpoints = cable.endpointScratch || (cable.endpointScratch = {});
      if (!writeTetherVisualEndpoints(source, target, cable.lastRemote, endpoints)) return false;

      const ux = (endpoints.bx - endpoints.ax) / endpoints.chord;
      const uz = (endpoints.bz - endpoints.az) / endpoints.chord;
      const roll = Math.atan2(uz, ux);
      const priority = 0.88;
      // Paired anisotropic flashes read as the line's ends springing apart, never as a radial blast.
      this._spawnSprite(
        SPR_FLASH, endpoints.ax, 1.15, endpoints.az,
        0.16, 4.2, 8.6, 0.72, 0, '#d7f7ff',
        -ux * 18, -uz * 18, 3.2, roll, priority,
      );
      this._spawnSprite(
        SPR_FLASH, endpoints.bx, 1.15, endpoints.bz,
        0.16, 4.2, 8.6, 0.72, 0, '#d7f7ff',
        ux * 18, uz * 18, 3.2, roll, priority,
      );
      const cue = releaseCuePicture(
        ux, uz, target.vel && target.vel.x, target.vel && target.vel.z, this._isReduced(),
      );
      this._spectacleGate(
        'release', (endpoints.ax + endpoints.bx) * 0.5, (endpoints.az + endpoints.bz) * 0.5,
      );
      const layer = this._ensureCauseMarks();
      const mark = releaseCutMark(cue, endpoints);
      if (layer && mark && mark.sprite !== true && mark.vanish !== true) {
        layer.noteCut(mark, this._causeNow());
      }

      cable.fadeRate = TETHER_RELEASE_FADE_RATE;
      const last = this._lastMasslineReleaseVfx;
      last.stage = 'release';
      last.targetId = target.id;
      last.endpointCount = 2;
      last.classification = null;
      last.releaseScore = 0;
      last.velocityAxisX = 0;
      last.velocityAxisZ = 0;
      last.cameraTargetRequested = false;
      const arc = this._masslineReleaseArc;
      if (arc) {
        const captured = this.state.massline2 && this.state.massline2.throw
          && this.state.massline2.throw.releaseTarget;
        const postTarget = arc.postTarget;
        clearMasslineReleaseTarget(postTarget);
        // The captured frame anchors to the resolved holder at release — the seeded targetId can
        // name a recycled slot by then; only an unstamped bind still trusts its seed id.
        const throwRuntime = this.state.massline2 && this.state.massline2.throw;
        const liveId = throwRuntime && throwRuntime.aimTargetId != null
          ? throwRuntime.aimTargetId
          : (captured && !captured.stable ? captured.targetId : null);
        const capturedEntity = liveId != null
          ? this._ent(liveId)
          : null;
        if (capturedEntity && capturedEntity.alive !== false && capturedEntity.pos
          && Number.isFinite(capturedEntity.pos.x) && Number.isFinite(capturedEntity.pos.z)) {
          postTarget.kind = captured.kind || (captured.targetId != null ? 'entity' : 'point');
          postTarget.source = captured.source || 'release-target';
          postTarget.targetId = captured.targetId;
          // Freeze the accepted release frame: stamp where the target entity was at the
          // moment of release, so the post-release annulus stays anchored to that
          // historical point instead of following the still-moving entity (NXI-197).
          postTarget.pos.x = capturedEntity.pos.x;
          postTarget.pos.z = capturedEntity.pos.z;
          postTarget.radius = Number.isFinite(captured.radius)
            ? Math.max(0, captured.radius)
            : Math.max(0, Number.isFinite(capturedEntity.radius) ? capturedEntity.radius : 0);
        } else if (captured && captured.pos
          && Number.isFinite(captured.pos.x) && Number.isFinite(captured.pos.z)) {
          postTarget.kind = captured.kind || 'point';
          postTarget.source = captured.source || 'release-target';
          postTarget.pos.x = captured.pos.x;
          postTarget.pos.z = captured.pos.z;
          postTarget.radius = Number.isFinite(captured.radius) ? Math.max(0, captured.radius) : 0;
        }
      }
      const token = this._masslineReleaseToken;
      token.active = true;
      token.targetId = target.id;
      token.sourceId = source.id;
      token.tick = Number.isFinite(this.state && this.state.tick) ? this.state.tick : null;
      return true;
    },

    _onTetherReleaseRated(p) {
      const token = this._masslineReleaseToken;
      if (!token || !token.active) return false;
      const tick = Number.isFinite(this.state && this.state.tick) ? this.state.tick : null;
      const matches = !!(p && p.targetId != null && p.sourceId != null
        && token.tick != null && tick === token.tick
        && sameTetherIdentity(p.targetId, token.targetId)
        && sameTetherIdentity(p.sourceId, token.sourceId));
      this._resetMasslineReleaseToken();
      if (!matches) return false;
      const target = this._ent(p.targetId);
      if (!target || target.alive === false || !target.pos || !target.vel
        || !Number.isFinite(target.vel.x) || !Number.isFinite(target.vel.z)) return false;
      const speed = Math.hypot(target.vel.x, target.vel.z);
      const score = clamp01Finite(p.releaseScore);
      const classification = releaseClassification(p.classification);
      const axisX = speed > 1e-6 ? target.vel.x / speed : 0;
      const axisZ = speed > 1e-6 ? target.vel.z / speed : 0;

      // NXB-050 chain readout: the accepted release opens one bounded ancestry. The node
      // sits on the thrown body's real release position — a captured world point that
      // never drifts with the live entity after the cut.
      const chain = this._masslineChainReadout;
      if (chain) {
        masslineChainNoteRelease(chain.record, {
          thrownId: target.id,
          x: target.pos.x,
          z: target.pos.z,
          dirX: axisX,
          dirZ: axisZ,
          nowS: this._t,
        });
      }

      if (speed > 1e-6) {
        const reduced = this._isReduced();
        const length = (8 + score * 16) * (reduced ? 0.48 : 1);
        const width = (0.24 + score * 0.22) * (reduced ? 0.72 : 1);
        const radius = Math.max(0, Number.isFinite(target.radius) ? target.radius : 0);
        const centerX = target.pos.x - axisX * (radius + length * 0.5);
        const centerZ = target.pos.z - axisZ * (radius + length * 0.5);
        const carry = reduced ? 0 : 0.28;
        this._spawnProjectileTrailStreak(
          centerX, 0.28, centerZ,
          reduced ? 0.18 : 0.22,
          width, length,
          reduced ? 0.28 : 0.58 + score * 0.22,
          releaseClassificationColor(classification),
          target.vel.x * carry, target.vel.z * carry,
          axisX, axisZ,
          0.88 + score * 0.08,
        );
        // massline_release's loud particle beat deliberately does NOT enter this path: the accepted
        // R3B clean-release grammar is the paired endpoints + this one actual-velocity streak, and
        // its acceptance contract pins the rated release at zero added particles/lights. The
        // recipe's momentum spray lives on the break path instead (see _onTetherSnap).
      }

      // Slingshot apex: the rated release landed at the crest of a real swing. This handler only
      // runs for deliberate clean cuts (the token match above), and releasedAtApex additionally
      // demands the omega crest — a break or a lazy let-go never reaches this beat.
      if (p.releasedAtApex === true) {
        this._triggerApexFlare(target, score);
        this.bus.emit('audio:cue', { id: 'massline.slingshotApex' });
      }

      const last = this._lastMasslineReleaseVfx;
      last.stage = 'rated';
      last.targetId = target.id;
      last.classification = classification;
      last.releaseScore = score;
      last.velocityAxisX = axisX;
      last.velocityAxisZ = axisZ;
      last.cameraTargetRequested = false;
      const arc = this._masslineReleaseArc;
      if (arc) {
        const destinationEntity = arc.postTarget.targetId != null
          ? this._ent(arc.postTarget.targetId)
          : null;
        const hasDestination = !!(destinationEntity && destinationEntity.alive !== false
          && destinationEntity.pos
          && Number.isFinite(destinationEntity.pos.x) && Number.isFinite(destinationEntity.pos.z))
          || (Number.isFinite(arc.postTarget.pos.x) && Number.isFinite(arc.postTarget.pos.z));
        if (hasDestination) {
          arc.ratingAge = 0;
          arc.ratingLife = 0.24 + score * 0.24;
          arc.ratingTargetId = target.id;
          arc.ratingClassification = classification;
          arc.ratingScore = score;
        } else {
          arc.ratingAge = Infinity;
          arc.ratingLife = 0;
          arc.ratingTargetId = null;
          arc.ratingClassification = null;
          arc.ratingScore = 0;
        }
      }
      return true;
    },

    // Latch spark at BOTH ends when a tether attaches (tether:attached).
    // massline_latch port (VFX NEXT recipe): the read of "a connection was made" is both ends
    // firing together (the flash pair), an oriented contact mark showing WHICH WAY the line leaves
    // the anchor, one pulse that genuinely travels the chord ship -> anchor, and sparks thrown in
    // the plane of contact — a disc around the line axis, not a ball. Ported onto the live pools.
    _onTetherLatch(p) {
      this._resetMasslineReleaseArc();
      // A new hitch starts a fresh sweep history — the previous body's arc must never bleed in.
      this._resetMasslineSwingTrace(); this._resetMonofilamentBlade();
      this._emitJuiceCue('presentation.tether.attach', p, 1);
      if (!this._scene) return;
      const target = p && p.targetId != null ? this._ent(p.targetId) : null;
      const player = this.helpers && this.helpers.player ? this.helpers.player() : this._ent(this.state.playerId);
      this._c0.set('#a6f0ff'); this._c1.set('#39d0ff');
      const ends = [];
      if (player && player.pos) {
        const cf = Math.cos(player.rot || 0), sf = Math.sin(player.rot || 0);
        const noseR = (player.radius || 6);
        ends.push({ x: player.pos.x + cf * noseR, z: player.pos.z + sf * noseR });
      }
      if (target && target.pos) ends.push({ x: target.pos.x, z: target.pos.z });
      if (!ends.length) return;
      const anchor = ends.length > 1 ? ends[1] : null;
      for (const pos of ends) {
        if (anchor && pos === anchor) continue; // the anchor end is rendered by the recipe below
        const n = Math.max(12, Math.round(20 * (this._burst || 1)));
        for (let k = 0; k < n; k++) {
          const a = random() * Math.PI * 2;
          const v = 18 + random() * 42;
          this._spawnParticle(pos.x, pos.z, Math.cos(a) * v, Math.sin(a) * v,
            0.28 + random() * 0.24, 1.55, 0.0, this._c0, this._c1, 3.4, 0, 0);
        }
        this._spawnSprite(SPR_FLASH, pos.x, 0, pos.z, 0.07, 3.0, 5.8, 0.9, 0.0, '#a6f0ff', 0, 0);
        this._eventLight({ x: pos.x, z: pos.z }, 'tether');
      }
      if (!anchor) return;
      const ship = ends[0];
      let dirX = anchor.x - ship.x;
      let dirZ = anchor.z - ship.z;
      const chord = Math.hypot(dirX, dirZ);
      // Simultaneous anchor flash + light: both ends firing together is the connection read.
      this._spawnSprite(SPR_FLASH, anchor.x, 0, anchor.z, 0.07, 3.0, 5.8, 0.9, 0.0, '#a6f0ff', 0, 0);
      this._eventLight({ x: anchor.x, z: anchor.z }, 'tether');
      if (!(chord > 1e-3)) return;
      dirX /= chord;
      dirZ /= chord;
      const perpAngle = Math.atan2(-dirX, dirZ); // the contact plane: perpendicular to the line
      // Anchor contact mark: a short oriented streak along the line axis at the anchor, so at
      // gameplay zoom you can see which way the line leaves — the tell that the tether bit into
      // something rather than merely reaching it.
      this._spawnProjectileTrailStreak(anchor.x, 0.3, anchor.z, 0.30,
        0.34, Math.min(9, Math.max(2.5, chord * 0.2)), 0.85, '#d7f7ff',
        -dirX * 4, -dirZ * 4, -dirX, -dirZ);
      // The travelling pulse runs anchor→ship: the kinetic wave of the catch riding the line home.
      // (The ribbon's own uLatchWave band travels the same direction on the same beat — the shader
      // wave is the line lighting up, this streak is the packet of energy arriving at the hull.)
      const pulseLife = 0.22;
      this._spawnProjectileTrailStreak(anchor.x, 0.34, anchor.z, pulseLife,
        0.42, 3.4, 0.95, '#ffffff',
        -dirX * (chord / pulseLife), -dirZ * (chord / pulseLife), -dirX, -dirZ);
      // Spark ring thrown off the anchor IN the plane of contact: a disc around the line axis —
      // alternating the two perpendicular directions with jitter, never an isotropic ball.
      this._c0.set('#eaf6ff');
      const n = Math.max(10, Math.round(14 * (this._burst || 1)));
      for (let k = 0; k < n; k++) {
        const a = perpAngle + (k % 2 ? Math.PI : 0) + (random() - 0.5) * 0.6;
        const v = 14 + random() * 30;
        this._spawnParticle(anchor.x, anchor.z, Math.cos(a) * v, Math.sin(a) * v,
          0.18 + random() * 0.3, 1.35, 0.0, this._c0, this._c1, 2.8, 0, 0);
      }
    },
  };
}
