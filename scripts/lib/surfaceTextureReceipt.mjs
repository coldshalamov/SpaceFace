import { createHash } from 'node:crypto';

export function expectedSurfaceArtifacts(buildReceipt, role) {
  const artifacts = Array.isArray(buildReceipt?.artifacts) ? buildReceipt.artifacts : [];
  const expected = {};
  for (const artifact of artifacts) {
    if (artifact?.role !== role || !artifact.channel || !artifact.sha256) continue;
    expected[artifact.channel] = {
      path: artifact.path || null,
      sha256: String(artifact.sha256).toLowerCase(),
    };
  }
  return expected;
}

export async function sha256FetchedTexture(url, fetchImpl = globalThis.fetch) {
  if (!url) return null;
  if (typeof fetchImpl !== 'function') throw new Error('texture receipt requires fetch');
  const response = await fetchImpl(url, { cache: 'no-store' });
  if (!response?.ok) throw new Error(`texture fetch failed ${response?.status ?? 'unknown'}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    byteLength: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

export async function verifyBoundSurfaceTextures({ buildReceipt, role, urls, fetchImpl = globalThis.fetch }) {
  const expected = expectedSurfaceArtifacts(buildReceipt, role);
  const channels = {};
  for (const channel of ['basecolor', 'normal', 'orm']) {
    const expectedArtifact = expected[channel] || null;
    const url = urls?.[channel] || null;
    const fetched = url ? await sha256FetchedTexture(url, fetchImpl) : null;
    channels[channel] = {
      url,
      expectedPath: expectedArtifact?.path || null,
      expectedSha256: expectedArtifact?.sha256 || null,
      actualSha256: fetched?.sha256 || null,
      byteLength: fetched?.byteLength || 0,
      match: !!(expectedArtifact && fetched && expectedArtifact.sha256 === fetched.sha256),
    };
  }
  return {
    schema: 'spaceface.boundSurfaceTextureReceipt.v1',
    role,
    channels,
    allMatch: Object.values(channels).every((channel) => channel.match),
  };
}
