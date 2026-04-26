// Document scan result cache — keyed by document URI + version.
//
// Separate from metadataCache.ts by design:
//   - Invalidation: document.version (increments on every keystroke), not TTL
//   - Persistence: none — scan results are cheap to recompute and auth-independent
//   - clearCache() (called on auth change) must NOT clear this cache
//
// Max 50 entries with clear-on-overflow; VS Code GC handles cleanup on deactivate.

import type { TableRef } from "../types/editor.js";

interface ScanEntry {
  version: number;
  refs: TableRef[];
}

const _store = new Map<string, ScanEntry>();
const MAX_ENTRIES = 50;

/**
 * Return cached scan results if the stored version matches the current document version.
 * Returns undefined on a miss (version mismatch or not yet scanned).
 */
export function getScan(uri: string, version: number): TableRef[] | undefined {
  const entry = _store.get(uri);
  if (entry && entry.version === version) { return entry.refs; }
  return undefined;
}

/**
 * Store scan results for a document version.
 * Clears the entire store if MAX_ENTRIES is reached (simple overflow guard).
 */
export function setScan(uri: string, version: number, refs: TableRef[]): void {
  if (_store.size >= MAX_ENTRIES) { _store.clear(); }
  _store.set(uri, { version, refs });
}
