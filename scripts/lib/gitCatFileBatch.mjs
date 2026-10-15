import { spawn } from 'node:child_process';

const NEWLINE = 0x0a;
export const DEFAULT_MAX_BLOB_BYTES = 16 * 1024 * 1024;

function headerFor(output, start) {
  const end = output.indexOf(NEWLINE, start);
  if (end < 0) throw new Error('git cat-file --batch returned an incomplete header');
  return { text: output.subarray(start, end).toString('utf8'), next: end + 1 };
}

/**
 * Parse git cat-file --batch's byte-framed output.
 *
 * A blob frame is `<object> blob <bytes>\n<body><newline>`. The body length is
 * authoritative: a body may itself contain newlines, including a final newline,
 * so parsing must advance by the declared byte count before consuming the frame
 * separator. Missing objects have no body frame.
 */
export function parseGitCatFileBatch(output, requestedPaths, {
  maxBlobBytes = DEFAULT_MAX_BLOB_BYTES,
} = {}) {
  if (!Buffer.isBuffer(output)) throw new TypeError('git cat-file output must be a Buffer');
  const paths = Array.isArray(requestedPaths) ? requestedPaths : [];
  const bodies = new Array(paths.length);
  let offset = 0;
  for (let i = 0; i < paths.length; i++) {
    const header = headerFor(output, offset);
    offset = header.next;
    if (header.text.endsWith(' missing')) {
      bodies[i] = null;
      continue;
    }
    // The object expression is echoed in the header and may contain spaces.
    // Match the protocol's terminal type/size fields instead of splitting at
    // the first space, which would misclassify `commit:path with spaces`.
    const blobHeader = header.text.match(/ blob (\d+)$/);
    if (!blobHeader) {
      throw new Error(`git cat-file --batch returned an invalid frame for ${paths[i]}`);
    }
    const size = Number(blobHeader[1]);
    if (!Number.isSafeInteger(size) || size > maxBlobBytes) {
      throw new Error(`git cat-file blob exceeds the ${maxBlobBytes}-byte limit for ${paths[i]}`);
    }
    if (output.length - offset < size + 1) {
      throw new Error(`git cat-file --batch returned a truncated body for ${paths[i]}`);
    }
    const body = output.subarray(offset, offset + size);
    offset += size;
    if (output[offset] !== NEWLINE) {
      throw new Error(`git cat-file --batch body separator is missing for ${paths[i]}`);
    }
    offset += 1;
    // Copy the body so the returned file does not retain the complete batch
    // output buffer after parsing finishes.
    bodies[i] = Buffer.from(body);
  }
  if (offset !== output.length) {
    throw new Error('git cat-file --batch returned trailing bytes');
  }
  return bodies;
}

/** Read a set of commit:path blobs through one git cat-file process. */
export function readGitCatFileBatch(commit, relativePaths, {
  cwd,
  maxBlobBytes = DEFAULT_MAX_BLOB_BYTES,
  windowsHide = true,
} = {}) {
  const paths = Array.isArray(relativePaths) ? relativePaths : [];
  if (!paths.length) return Promise.resolve([]);
  for (const relativePath of paths) {
    if (String(relativePath).includes('\n') || String(relativePath).includes('\0')) {
      return Promise.reject(new Error(`git cat-file path contains a line terminator: ${relativePath}`));
    }
  }
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['cat-file', '--batch'], { cwd, windowsHide });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch (_) { /* process may already have exited */ }
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.stdin.on('error', fail);
    child.on('error', fail);
    child.on('close', (code, signal) => {
      if (settled) return;
      if (code !== 0) {
        const detail = Buffer.concat(stderr).toString('utf8').trim();
        fail(new Error(`git cat-file --batch failed${signal ? ` (${signal})` : ''}${detail ? `: ${detail}` : ''}`));
        return;
      }
      try {
        const output = Buffer.concat(stdout);
        const bodies = parseGitCatFileBatch(output, paths, { maxBlobBytes });
        settled = true;
        resolve(bodies);
      } catch (error) {
        fail(error);
      }
    });
    child.stdin.end(Buffer.from(paths.map((relativePath) => `${commit}:${relativePath}\n`).join(''), 'utf8'));
  });
}
