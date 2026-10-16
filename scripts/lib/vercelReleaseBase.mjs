// Pin retail JavaScript to this deployment without changing the page's URL or base.
// VERCEL_URL is the generated deployment hostname, not the production or branch alias.
export const VERCEL_RELEASE_HOST_PATTERN = 'spaceface-play-demo-[a-z0-9]+-robin-gattis-projects\\.vercel\\.app';
const deploymentHost = new RegExp(`^${VERCEL_RELEASE_HOST_PATTERN}$`);

export function vercelReleaseBase(hostname) {
  if (hostname === undefined || hostname === null || hostname === '') return '';
  if (typeof hostname !== 'string' || deploymentHost.exec(hostname)?.[0] !== hostname) {
    throw new Error('VERCEL_URL must be a generated spaceface-play-demo deployment hostname');
  }
  return `/_releases/${hostname}/`;
}

export function pinVercelReleaseHtml(html, hostname) {
  const base = vercelReleaseBase(hostname);
  // Local web and Electron builds retain the exact same HTML bytes.
  if (!base) return html;
  if (/<base\b/i.test(html)) throw new Error('Retail HTML already contains a base element');
  const entry = '<script type="module" src="./main.js"></script>';
  if (!html.includes(entry)) throw new Error('Retail HTML has no bundled main entry');
  return html.replace(entry, `<script type="module" src="${base}main.js"></script>`);
}
