// Optional target/contact-detail surface. Host places this inside its existing UI, not
// a second flight prompt deck. No clocks, randomness, gameplay writes, HTML injection,
// global input listeners, or animation. Static lines also satisfy reduced-motion mode.
export function mountIonaStatus({ root, read, act, document: doc = globalThis.document }) {
  if (!doc || !root || typeof read !== 'function' || typeof act !== 'function') return null;
  const section = doc.createElement('section'), heading = doc.createElement('h3');
  const status = doc.createElement('p'), terms = doc.createElement('p');
  const list = doc.createElement('ul'), buttons = doc.createElement('div');
  section.setAttribute('aria-label', 'Iona Vey salvage claim');
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  section.append(heading, status, terms, list, buttons); root.append(section);
  let fingerprint = '', disposed = false;
  function update() {
    if (disposed) return;
    const r = read(); section.hidden = !r?.visible;
    if (!r?.visible) return;
    const next = JSON.stringify(r);
    if (next === fingerprint) return;
    fingerprint = next;
    heading.textContent = `Iona Vey · ${r.title}`;
    status.textContent = r.retired ? 'Fair Measure is unavailable. No replacement tug.'
      : r.closed ? `Recovery closed · ${r.outcome === 'unsettled' ? 'record retained' : r.outcome.replaceAll('_', ' ')}`
        : `${r.agreement === 'none' ? 'Terms open' : r.agreement} · ${r.graceS}s until Iona begins her lift`;
    terms.textContent = r.terms;
    list.replaceChildren(); buttons.replaceChildren();
    for (const b of r.bodies) {
      const li = doc.createElement('li');
      li.textContent = `${b.label}: ${b.status}, ${b.remaining} units; ${b.claim === 'iona' ? 'Iona’s stake' : b.claim === 'joint' ? 'joint claim' : 'open salvage'}.`;
      list.append(li);
    }
    for (const verb of r.choices) {
      const button = doc.createElement('button'); button.type = 'button';
      button.textContent = { cooperate: 'Agree to joint recovery', compete: 'Compete within the claims', yield: 'Leave Iona’s frame to her' }[verb];
      button.addEventListener('click', () => {
        const result = act({ appearanceId: r.appearanceId, revision: r.revision, verb });
        fingerprint = ''; update();
        if (result?.ok === false) status.textContent = 'The offer changed or the tug is out of hail range. Check the current claim.';
      });
      buttons.append(button);
    }
  }
  update();
  return { element: section, update, destroy() { if (disposed) return; disposed = true; section.remove(); } };
}

/** Draw static spatial terms on a host-owned 2D overlay. project consumes XZ points;
 * native hull/rope/geometry stay under the authored renderer. No WebGL readback. */
export function drawIonaClaims(context, snapshot, project) {
  if (!snapshot?.visible || !context || typeof project !== 'function') return;
  const ring = (pos, radius, label, color) => {
    if (!pos) return;
    const p = project({ x: pos.x, y: 0, z: pos.z });
    if (!p || p.onScreen === false) return;
    context.save(); context.strokeStyle = color; context.fillStyle = color; context.lineWidth = 2;
    context.beginPath();
    let opened = false;
    for (let i = 0; i <= 32; i++) {
      const t = i / 32 * Math.PI * 2;
      const q = project({ x: pos.x + radius * Math.cos(t), y: 0, z: pos.z + radius * Math.sin(t) });
      if (!q || q.onScreen === false) { opened = false; continue; }
      if (!opened) { context.moveTo(q.x, q.y); opened = true; } else context.lineTo(q.x, q.y);
    }
    context.stroke(); context.font = '14px sans-serif'; context.fillText(label, p.x + 8, p.y - 10); context.restore();
  };
  for (const b of snapshot.bodies) if (b.status === 'live' && b.claim === 'iona')
    ring(b.pos, snapshot.claimRadius, 'Iona’s frame only · hail to share', '#ffd48a');
  ring(snapshot.receiver, 70, 'Recovery ring · ≤8 m/s · hold line 2s', '#b7e5ef');
}
