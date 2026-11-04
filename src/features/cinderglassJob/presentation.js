// Browser-only decision/receipt adapter. Every action carries the captured life
// and operation identity; only the simulation owner can accept it.
import { getPromptDeck } from '../../ui/promptDeck.js';
import { cinderglassJobPublicPrompt } from './readModel.js';
import { occupantGenerationOf } from '../../core/entity.js';
import { cinderglassJobRequestPresentation } from './physical.js';

export const CINDERGLASS_PROMPT_ID = 'cinderglassJob:decision';
export const CINDERGLASS_SERVICE_PROMPT_ID = 'cinderglassJob:service';
const OWNERS = new WeakMap();
const key = p => p ? JSON.stringify([p.token, p.operationId, p.revision, p.id, p.choices,
  p.headline, p.detail, p.statusFlag]) : '';

export const cinderglassJobPrompt = {
  name: 'cinderglassJobPrompt',
  init(ctx = {}) {
    this.destroy();
    OWNERS.get(ctx.state)?.destroy();
    this.ctx = ctx; this.state = ctx.state; this.bus = ctx.bus;
    this._subs = []; this._consumed = new Set(); this._facts = new Set();
    this._active = new Map(); this._signatures = new Map(); this._elapsed = 0;
    this._refusalKey = ''; this._destroyed = false;
    this._admittedSignature = ''; this._requestedMeshes = new WeakSet();
    this._admissionLife = '';
    if (this.state) OWNERS.set(this.state, this);
    const on = (name, fn) => {
      const off = this.bus?.on?.(name, fn);
      this._subs.push(typeof off === 'function' ? off : () => this.bus?.off?.(name, fn));
    };
    on('cinderglassJob:offer', p => this.offer(p));
    on('cinderglassJob:servicePrompt', p => this.servicePrompt(p));
    on('cinderglassJob:fact', f => this.fact(f));
    on('cinderglassJob:refused', p => this.refusal(p));
    on('cinderglassJob:serviceEnd', p => {
      if (p?.status === 'interrupted') this.fact({ id: `service:${p.reason}`,
        text: p.text || 'Service interrupted. The original latch is untouched; reposition and try again.' });
      this.close(CINDERGLASS_SERVICE_PROMPT_ID);
    });
    on('cinderglassJob:close', p => this.close(p?.approachOnly ? CINDERGLASS_SERVICE_PROMPT_ID : null));
    for (const name of ['save:restoring', 'sector:exit', 'dock:docked', 'game:new', 'game:newGame']) on(name, () => this.close());
    for (const name of ['save:restoring', 'sector:exit', 'game:new', 'game:newGame']) on(name, () => this._releasePreparation());
    this.frame(0, this.state, true, true);
    return this;
  },

  _deck() { return this.ctx?.deck || getPromptDeck(); },
  _consume(signature) {
    if (!signature) return;
    this._consumed.add(signature);
    while (this._consumed.size > 12) this._consumed.delete(this._consumed.values().next().value);
  },

  _show(raw, id) {
    if (this._destroyed) return false;
    const prompt = cinderglassJobPublicPrompt(raw), deck = this._deck();
    if (!prompt || !prompt.choices.length || !deck) { this.close(id); return false; }
    const signature = key(prompt);
    if (this._consumed.has(signature)) return false;
    if (this._signatures.get(id) === signature && deck.hasDecision?.(id)) return true;
    this._signatures.set(id, signature); this._active.set(id, prompt);
    const spec = {
      id, kind: prompt.kind, sender: prompt.sender || prompt.title || 'CINDERGLASS · RECOVERY',
      headline: prompt.headline, detail: prompt.detail, statusFlag: prompt.statusFlag || null,
      detailCopy: prompt.detailCopy || null,
      choices: prompt.choices.map(c => ({ ...c, cancel: ['decline', 'abort', 'leave', 'back'].includes(c.id) })),
      onChoose: (choiceId, source) => {
        const selected = prompt.choices.find(c => c.id === choiceId);
        if (!selected || selected.disabled || this._active.get(id) !== prompt) return false;
        // Consume before emit: a synchronous refusal may immediately publish a
        // replacement revision. Never close that fresh card after its callback.
        this._consume(signature); this._active.delete(id); this._signatures.delete(id);
        deck.resolveDecision(id);
        const payload = { action: selected.id, token: prompt.token, operationId: prompt.operationId,
          revision: prompt.revision, offerEpoch: prompt.epoch, source: source || 'deck',
          ...(selected.actor ? { actor: selected.actor } : {}),
          ...(selected.quoteId ? { quoteId: selected.quoteId } : {}),
          ...(selected.recipient ? { recipient: selected.recipient } : {}),
          ...(selected.markerId ? { markerId: selected.markerId } : {}), result: null };
        this.bus?.emit?.('cinderglassJob:action', payload);
        return payload.result?.ok !== false;
      },
    };
    return deck.hasDecision?.(id) && deck.updateDecision
      ? deck.updateDecision(id, spec) : deck.offerDecision(spec);
  },

  offer(raw) { return raw ? this._show(raw, CINDERGLASS_PROMPT_ID) : this.close(CINDERGLASS_PROMPT_ID); },
  servicePrompt(raw) { return raw ? this._show(raw, CINDERGLASS_SERVICE_PROMPT_ID) : this.close(CINDERGLASS_SERVICE_PROMPT_ID); },

  fact(fact) {
    if (this._destroyed || !fact?.text) return false;
    const signature = `${fact.id || ''}:${fact.atS ?? ''}:${fact.text}`;
    if (this._facts.has(signature)) return false;
    this._facts.add(signature);
    while (this._facts.size > 24) this._facts.delete(this._facts.values().next().value);
    this.bus?.emit?.('toast', { text: String(fact.text).slice(0, 600), kind: fact.kind === 'warn' ? 'warn' : 'info',
      ttl: 5, source: 'cinderglassJob', dedupeKey: `cinderglassJob:${fact.id || 'receipt'}` });
    return true;
  },

  refusal(row) {
    if (!row) return false;
    const signature = `${row.revision ?? ''}:${row.reason || ''}:${row.text || ''}`;
    if (signature === this._refusalKey) return false;
    this._refusalKey = signature;
    return this.fact({ id: `refusal:${signature}`, text: row.text || refusalText(row.reason), kind: 'warn' });
  },

  frame(dt = 0, state = this.state, hudVisible = true, force = false) {
    if (this._destroyed || !state || state !== this.state) return;
    this._elapsed += Math.max(0, Number(dt) || 0);
    if (!force && this._elapsed < 0.125) return;
    this._elapsed %= 0.125;
    this._admitWorld(state);
    if (!hudVisible || state.mode !== 'flight' || state.ui?.docked || state.player?.docked === true) { this.close(null, false); return; }
    const view = state.cinderglassJobView;
    this.offer(view?.offer || state.cinderglassJobOffer || null);
    this.servicePrompt(view?.approachPrompt || state.cinderglassJobApproach || null);
    if (view?.refusal) this.refusal(view.refusal);
  },

  _admitWorld(state) {
    const admission = state.cinderglassJobView?.admission, scene = state.render?.scene;
    if (state.cinderglassJobView?.outcome || !admission?.token || !admission.operationId || !scene || !Array.isArray(admission.bodies)
      || !admission.bodies.length || admission.bodies.length > 8) { this._releasePreparation(); return; }
    const life = `${admission.token}:${admission.operationId}`;
    if (life !== this._admissionLife) { this._releasePreparation(); this._admissionLife = life; }
    // This adapter and the renderer share a realm. Worker flags are spawn metadata,
    // so changing a sim-side boolean later would never request or retire this work.
    cinderglassJobRequestPresentation(this, state, true, admission);
    const signature = JSON.stringify(admission);
    if (signature === this._admittedSignature) return;
    let ready = true;
    for (const row of admission.bodies) {
      const entity = state.entities?.get?.(row.id), mesh = entity?.mesh;
      if (!entity || entity.alive === false || occupantGenerationOf(entity) !== row.generation
        || entity.data?.worldRecordId !== row.worldRecordId
        || entity.data?.cinderglassOperationId !== admission.operationId
        || entity.data?.cinderglassAssetId !== row.assetId
        || entity.data?.cinderglassAssetFile !== row.assetFile
        || !row.assetFile || !mesh?.parent) { ready = false; continue; }
      let parent = mesh;
      while (parent && parent !== scene) parent = parent.parent;
      if (parent !== scene) { ready = false; continue; }
      const data = mesh.userData || {};
      if (!['authored', 'authored-with-cleanup-error'].includes(data.authoredAssetState)
        || data.pipelinesPending === true || data.geometryPending === true) {
        if (!this._requestedMeshes.has(mesh) && typeof data.requestAuthoredUpgrade === 'function' && state.render?.renderer) {
          this._requestedMeshes.add(mesh);
          try { Promise.resolve(data.requestAuthoredUpgrade(state.render.renderer, scene, { admissionVisible: true })).catch(() => {}); }
          catch { /* admission stays pending until actual mounted geometry is ready */ }
        }
        ready = false;
        continue;
      }
      const expectedFile = row.assetFile.replace(/\\/g, '/').split('?')[0];
      let found = false, geometryReady = false;
      mesh.traverse?.(object => {
        const positions = object.geometry?.getAttribute?.('position') || object.geometry?.attributes?.position;
        if (positions?.count > 0 && object.material) geometryReady = true;
        const d = object.userData || {};
        for (const url of [d.authoredPackageUrl, d.spacefacePartUrl, ...(Array.isArray(d.spacefacePartUrls) ? d.spacefacePartUrls : [])]) {
          if (typeof url !== 'string') continue;
          const file = url.replace(/\\/g, '/').split('?')[0];
          if (file === expectedFile || file.endsWith(`/${expectedFile}`)) found = true;
        }
      });
      if (!found || !geometryReady) ready = false;
    }
    if (!ready) return;
    this._admittedSignature = signature;
    this.bus?.emit?.('cinderglassJob:presentationReady', { token: admission.token, operationId: admission.operationId,
      bodies: admission.bodies.map(({ id, generation }) => ({ id, generation })) });
  },

  _releasePreparation() {
    if (!this._admissionLife) return;
    if (this.state) cinderglassJobRequestPresentation(this, this.state, false);
    this._admissionLife = '';
    this._requestedMeshes = new WeakSet();
  },

  close(id = null, consume = true) {
    const deck = this._deck();
    for (const promptId of id ? [id] : [CINDERGLASS_PROMPT_ID, CINDERGLASS_SERVICE_PROMPT_ID]) {
      if (consume) this._consume?.(this._signatures?.get(promptId));
      this._active?.delete(promptId); this._signatures?.delete(promptId);
      deck?.resolveDecision?.(promptId);
    }
    return true;
  },
  newGame() { this._releasePreparation(); this.close(); this._facts?.clear(); this._refusalKey = ''; },
  destroy() {
    this._releasePreparation();
    this.close();
    for (const off of this._subs || []) off();
    this._subs = []; this._destroyed = true;
    if (this.state && OWNERS.get(this.state) === this) OWNERS.delete(this.state);
  },
};

export function refusalText(reason) {
  return ({ beacon_unavailable: 'The CG-7 cargo beacon cannot answer right now. The last fix has not changed.',
    beacon_no_original: 'The original CG-7 pod is not answering. The last fix has not changed.',
    stale_beacon_view: 'Open the current recovery entry and request a fresh fix.',
    too_fast: 'Too much relative speed. Match the Mule below 4 WU/s.',
    range: 'Move within reach of the external yellow latch.',
    obstructed: 'Solid hardware blocks access to the latch. Approach its exposed side.',
    watched: 'The rack is in an observer’s clear sightline. Wait or use physical cover.',
    no_scan: 'Scan the original pod and latch through a clear sightline first.',
    not_at_layby: 'Wait for the actual low-speed inspection hold at the freight pull-off.',
    no_latch: 'The original external latch is unavailable.',
    not_carried: 'The original pod is already off the rack.',
    stale_offer: 'Those terms have expired. Reopen the contact for current terms.',
    stale_service: 'That service attempt belongs to an earlier action. Start again from the current card.',
    stale_token: 'That choice belongs to an earlier life or restored visit.',
    insufficient_funds: 'The full inspection deposit is unavailable. No credits were charged.',
  })[reason] || 'That action was refused. Check the current position, original hardware and terms.';
}

export function createCinderglassJobPromptSystem() { return Object.create(cinderglassJobPrompt); }

export function mountCinderglassJobPresentation(ctx = {}) {
  if (!ctx.state || !ctx.bus) return null;
  const owner = createCinderglassJobPromptSystem(); owner.init(ctx);
  return { frame: (...args) => owner.frame(...args), close: () => owner.close(),
    destroy: () => owner.destroy(), dispose: () => owner.destroy(), owner };
}
