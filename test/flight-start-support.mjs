import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Loads a production module by repo-relative path for the flight-start regression tests. `id` names the proposal the
 * test belongs to; it is kept in the signature so a test reads as "(proposal, module)".
 */
export async function load(id, file) {
  return import(pathToFileURL(path.resolve(file)).href);
}
