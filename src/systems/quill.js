// W-SHIFT (row 506, 03 §4.3): QUILL / AR-3 — the deserter page-drone. It hides
// by the Watcher's Tithe rim on Triton Wake's empty lane with the Archive's
// sealed pages still in its chest. Bring it a scanned wreck — a hull whose
// manifest your scanner resolved — settled inside its read ring, and it copies
// the log. The wreck stays yours; the page opens. One sealed secret per new
// copy, in order, until the Archive is out. "I copied it. Now it exists twice.
// That is how you keep a thing."
//
// WHAT THIS OWNS — the drone hull (one-off event seams: init / deferred
// sector-enter / save:loaded / newGame), the copy count and gone receipt in
// story flags, the quillCopied stamp on each read wreck, and the calendar census
// that reads the ring. The stamp rides the hull's data, so a copied log can
// never be re-copied — across saves, sectors, or a later drone. Nothing here
// reads or writes entity.vel; drift-home goes through queuePhysicsImpulse.
import { QUILL } from '../data/quill.js';
import { quillCopyable, quillNextSecret, quillSecretAt, quillDriftHome } from '../characters/quillRules.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';

export function quillSpec() {
  return {
    type: 'drone',
    pos: { ...QUILL.post }, vel: { x: 0, z: 0 },
    radius: 9, mass: 22, hull: 180, hullMax: 180,
    homeSectorId: QUILL.sectorId,
    data: {
      quill: true, authoredCharacter: 'quill', parentType: 'story_prop',
      callsign: QUILL.callsign,
      scanLabel: 'QUILL / AR-3 — deserter page-drone, reads wreck logs',
      scannerSignalKind: 'archive',
      homeSectorId: QUILL.sectorId,
    },
  };
}

export function createQuill() {
  return {
    name: 'quill',
    init(ctx) {
      this.destroy();
      this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers || {};
      this._unsubs = [];
      this._announced = false;
      const on = (event, fn) => {
        const off = this.bus?.on(event, fn); if (typeof off === 'function') this._unsubs.push(off);
      };
      on('sector:enter', (p) => {
        this._announced = false;
        if (deferSectorEnterMaterialization(this.state, p, this._cookProvider)) return;
        this._sync();
      });
      this._cookProvider = () => { this._sync(); };
      (this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = []))
        .push(this._cookProvider);
      on('save:loaded', () => { this._announced = false; this._sync(); });
      on('game:newGame', () => { this._announced = false; this._sync(); });
      on('entity:killed', (p) => this._onKilled(p));
      this._sync();
    },
    destroy() {
      for (const off of this._unsubs || []) off();
      this._unsubs = [];
      const providers = this.helpers?.sectorCookProviders;
      if (Array.isArray(providers)) {
        const i = providers.indexOf(this._cookProvider);
        if (i >= 0) providers.splice(i, 1);
      }
      const queue = this.state?.render?.deferredEnterMaterializers;
      if (Array.isArray(queue)) {
        for (let i = queue.length - 1; i >= 0; i--) {
          if (queue[i] && queue[i].provider === this._cookProvider) queue.splice(i, 1);
        }
      }
      this._cookProvider = null;
      this._removeOwned();
    },
    _flags() {
      const flags = this.state?.story?.flags;
      return flags ? flags : (this.state?.story ? (this.state.story.flags = {}) : null);
    },
    _adventure() {
      const run = this.state?.run;
      return (!run || !run.kind || run.kind === 'adventure' || run.kind === 'campaign')
        && this.state?.world?.currentSectorId === QUILL.sectorId;
    },
    _entity(id) {
      const s = this.state;
      return s?.entities?.get?.(id) || (s?.entityList || []).find((e) => e && e.id === id) || null;
    },
    _robot() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.quill === true) return e;
      }
      return null;
    },
    _removeOwned() {
      for (const e of this.state?.entityList || []) {
        if (e?.alive && e.data?.quill === true) this.helpers?.removeEntity?.(e.id);
      }
    },
    _say(id, text, ttl = 7) {
      this.bus?.emit('comms:popup', {
        id, sender: QUILL.sender, category: 'story', text, ttl, persist: false,
      });
    },
    _sync() {
      if (!this.state?.story) return;
      if (!this._adventure()) { this._removeOwned(); return; }
      const flags = this._flags();
      const gone = flags?.[QUILL.goneFlag] === true;
      if (!gone && !this._robot() && this.helpers.spawnEntity) {
        this.helpers.spawnEntity(quillSpec());
      }
      if (!gone && !this._announced) {
        this._announced = true;
        this._say('quill_announce', QUILL.announce, 9);
      }
    },
    /** Kill reports read the victim by id — the emitter marks it dead before the
     *  bus hears it. The drone's death is durable and its last line fires once;
     *  the copies it already made stay copied — that was the whole point. */
    _onKilled(p) {
      if (!this._adventure() || !p) return;
      const victim = this._entity(p.id);
      if (!victim || !victim.data || victim.data.quill !== true) return;
      const flags = this._flags();
      if (flags && flags[QUILL.goneFlag] !== true) {
        flags[QUILL.goneFlag] = true;
        this._say('quill_gone', QUILL.goneLine, 9);
      }
    },
    /** The calendar census: walk the drone home if it was shoved off its drift
     *  (impulse-membrane steering), then read the ring — the first settled
     *  scanned wreck gets the quillCopied stamp on ITS hull (the copy travels
     *  with the body, so the ledger is the wreck itself), the count steps, and
     *  one sealed page opens in order. One copy per census — the drone writes
     *  carefully. */
    update(dt, state) {
      const s = state || this.state;
      if (!s || !this._adventure()) return;
      const robot = this._robot();
      if (!robot || !robot.pos) return;
      const dv = quillDriftHome(robot);
      if (dv && robot.mass > 0) {
        queuePhysicsImpulse(robot, { x: dv.x * robot.mass, z: dv.z * robot.mass }, { tick: s.tick });
      }
      const flags = this._flags();
      if (!flags) return;
      const copied = Number(flags[QUILL.copiedFlag]) || 0;
      const next = quillNextSecret(copied);
      if (next < 0) return; // every page is already out
      for (const e of s.entityList || []) {
        if (!e || e === robot) continue;
        if (!quillCopyable(e, robot.pos)) continue;
        e.data = e.data || {};
        e.data.quillCopied = true;
        e.data.quillCopiedBy = robot.id;
        e.data.quillCopiedAt = Number(s.simTime) || 0;
        flags[QUILL.copiedFlag] = copied + 1;
        const secret = quillSecretAt(next);
        this._say(`quill_copy_${e.id}`, QUILL.copiedLine, 6);
        this._say(`quill_secret_${next}`, secret, 12);
        if (quillNextSecret(copied + 1) < 0) {
          this._say('quill_mastery', QUILL.masteryLine, 9);
        }
        return;
      }
    },
  };
}

export const quill = createQuill();
