import { detachData, stableStringify } from './stableJson.mjs';

// Closed checks for dock documents and path strings.
// The lab schema is still the authority for scenario documents; these checks
// catch payloads the lab would not treat as code but a mod host must refuse.

const BANNED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

const SCRIPT_RE = /=>|function\s*\(|\$\{|eval\s*\(|new\s+Function|__proto__|constructor\s*\[|<script|<\/script|javascript\s*:|onerror\s*=|onload\s*=/i;

export const MAX_PROJECT_BYTES = 512 * 1024;
export const MAX_STRING_BYTES = 64 * 1024;
export const MAX_ASSET_BYTES = 32 * 1024;

function utf8Length(text) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
  return text.length;
}

export function byteLength(value) {
  if (typeof value === 'string') return utf8Length(value);
  try {
    // Probe toJSON on a detached copy so a throw is reported and the live value stays put.
    stableStringify(value, false);
    const text = JSON.stringify(detachData(value, new Map(), false));
    if (typeof text !== 'string') return null;
    return utf8Length(text);
  } catch (error) {
    return null;
  }
}

/**
 * Walk a JSON value. Returns issue strings. Does not throw.
 * @param {unknown} value
 * @param {string} [path]
 */
export function inspectValue(value, path = '$') {
  const issues = [];
  walk(value, path, issues, 0);
  return issues;
}

function walk(value, path, issues, depth) {
  if (depth > 24) {
    issues.push(`${path}: document nested too deeply`);
    return;
  }
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    issues.push(`${path}: unsupported value type ${typeof value}`);
    return;
  }
  if (typeof value === 'string') {
    if (utf8Length(value) > MAX_STRING_BYTES) {
      issues.push(`${path}: string exceeds ${MAX_STRING_BYTES} bytes`);
    }
    if (SCRIPT_RE.test(value)) {
      issues.push(`${path}: unsafe script or executable expression`);
    }
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) issues.push(`${path}: number must be finite`);
    return;
  }
  if (value == null || typeof value === 'boolean') return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
      walk(descriptor.value, `${path}[${i}]`, issues, depth + 1);
    }
    return;
  }
  if (typeof value !== 'object') {
    issues.push(`${path}: unsupported value`);
    return;
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) continue;
    if (typeof descriptor.value === 'function') continue;
    if (BANNED_KEYS.has(key)) {
      issues.push(`${path}.${key}: banned key`);
      continue;
    }
    if (key === 'asset' || key === 'dataUrl' || key === 'bytes' || key === 'payloadBase64') {
      const raw = descriptor.value;
      const size = typeof raw === 'string' ? utf8Length(raw) : byteLength(raw);
      if (size == null) {
        issues.push(`${path}.${key}: scene could not be cloned`);
      } else if (size > MAX_ASSET_BYTES) {
        issues.push(`${path}.${key}: asset payload exceeds ${MAX_ASSET_BYTES} bytes`);
      }
    }
    walk(descriptor.value, `${path}.${key}`, issues, depth + 1);
  }
}

export function assertProjectSize(value) {
  const size = byteLength(value);
  if (size == null) return ['scene could not be cloned'];
  if (size > MAX_PROJECT_BYTES) return [`$: project exceeds ${MAX_PROJECT_BYTES} bytes`];
  return [];
}

/** Reject traversal, NUL, and absolute paths in a user-supplied path fragment. */
export function pathFragmentIssues(fragment, label = 'path') {
  const issues = [];
  if (typeof fragment !== 'string' || fragment.length === 0) {
    issues.push(`${label}: path is required`);
    return issues;
  }
  if (fragment.includes('\0')) issues.push(`${label}: NUL byte`);
  if (fragment.includes('\\')) issues.push(`${label}: backslash`);
  const normalized = fragment.replace(/\\/g, '/');
  if (normalized.split('/').some((part) => part === '..')) {
    issues.push(`${label}: path traversal`);
  }
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    issues.push(`${label}: absolute path`);
  }
  return issues;
}
