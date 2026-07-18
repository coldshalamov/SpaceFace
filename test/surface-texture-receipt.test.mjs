import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';

import {
  expectedSurfaceArtifacts,
  verifyBoundSurfaceTextures,
} from '../scripts/lib/surfaceTextureReceipt.mjs';

const payloads = {
  basecolor: Buffer.from('rock-basecolor-v2'),
  normal: Buffer.from('rock-normal-v2'),
  orm: Buffer.from('rock-orm-v2'),
};

const buildReceipt = {
  artifacts: Object.entries(payloads).map(([channel, bytes]) => ({
    role: 'rock',
    channel,
    path: `rock_${channel}.png`,
    sha256: createHash('sha256').update(bytes).digest('hex').toUpperCase(),
  })),
};

test('surface receipt normalizes deterministic artifact hashes by semantic channel', () => {
  const expected = expectedSurfaceArtifacts(buildReceipt, 'rock');
  assert.deepEqual(Object.keys(expected), ['basecolor', 'normal', 'orm']);
  assert.match(expected.basecolor.sha256, /^[0-9a-f]{64}$/);
});

test('runtime-bound texture bytes must match the deterministic build receipt, not only its URL', async () => {
  const fetchImpl = async (url) => {
    const channel = new URL(url).searchParams.get('channel');
    const bytes = payloads[channel];
    return { ok: !!bytes, status: bytes ? 200 : 404, arrayBuffer: async () => bytes };
  };
  const urls = Object.fromEntries(Object.keys(payloads)
    .map((channel) => [channel, `https://game.test/rock.png?channel=${channel}`]));
  const verified = await verifyBoundSurfaceTextures({ buildReceipt, role: 'rock', urls, fetchImpl });
  assert.equal(verified.allMatch, true);
  assert.deepEqual(Object.values(verified.channels).map((entry) => entry.match), [true, true, true]);

  const stale = await verifyBoundSurfaceTextures({
    buildReceipt,
    role: 'rock',
    urls,
    fetchImpl: async () => ({ ok: true, status: 200, arrayBuffer: async () => Buffer.from('stale-map') }),
  });
  assert.equal(stale.allMatch, false, 'same-path stale maps must fail byte-level provenance');
});
