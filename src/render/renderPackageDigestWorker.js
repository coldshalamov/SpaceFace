// Worker for src/render/renderPackageDigest.js: the SHA-256 of one render package per message, so hashing
// streamed GLB bytes never runs on the game's main thread.
// Protocol: in { id, buffer } (the buffer is transferred), out { id, hex } or { id, error }.
self.addEventListener('message', (event) => {
  const data = event.data || {};
  const id = data.id;
  Promise.resolve()
    .then(() => self.crypto.subtle.digest('SHA-256', data.buffer))
    .then((digest) => {
      const bytes = new Uint8Array(digest);
      let hex = '';
      for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
      self.postMessage({ id, hex });
    })
    .catch((error) => {
      self.postMessage({ id, error: String((error && error.message) || error) });
    });
});
