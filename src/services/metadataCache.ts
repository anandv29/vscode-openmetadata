import type * as vscode from "vscode";

// ---- Cache key schema ----------------------------------------
//
// key                          value                  TTL
// ─────────────────────────────────────────────────────────────
// fqn:{raw name}               string (full FQN)      10 min   — resolves whatever the user typed to its confirmed OM FQN
// table:{full FQN}             OmTable                 5 min   — full table metadata (description, columns, owners, tags)
// dq:{full FQN}                OmDQResult[]            2 min   — DQ test cases + latest results for that table
// lineage:{full FQN}           OmLineageResponse      10 min   — upstream/downstream edges for that table
// list:services                OmService[]             5 min   — all database services (sidebar root level)
// list:databases:{serviceFqn}  OmDatabase[]            5 min   — databases inside a service (sidebar second level)
// list:schemas:{dbFqn}         OmSchema[]              5 min   — schemas inside a database (sidebar third level)
// list:tables:{schemaFqn}      OmTable[]               5 min   — tables inside a schema (sidebar fourth level)
//
// Persistence: fqn: and table: keys are eagerly written to globalState so they
// survive VS Code restarts. dq:, lineage: and list: are intentionally volatile (in-memory only).

// ---- TTL constants (milliseconds) ----------------------------

export const TTL = {
  TABLE:   5 * 60 * 1000,   // 5 min  — table metadata rarely changes mid-session
  DQ:      2 * 60 * 1000,   // 2 min  — DQ results can change; keep fresh
  FQN:     10 * 60 * 1000,  // 10 min — FQNs are immutable identifiers
  LIST:    5 * 60 * 1000,   // 5 min  — sidebar catalog lists
  LINEAGE: 10 * 60 * 1000,  // 10 min — lineage edges change infrequently
} as const;

// ---- Internal entry type -------------------------------------

interface CacheEntry<T> {
  value: T;
  expiresAt: number; // Unix ms when entry becomes stale
  cachedAt: number;  // Unix ms when entry was stored (for "X min ago" display)
}

// ---- Cache class ---------------------------------------------

class TableCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private _context: vscode.ExtensionContext | undefined;

  /** Get a cached value by key. Returns undefined if missing or expired. */
  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  /**
   * Store a value with a configurable TTL.
   * Defaults to TTL.TABLE (5 min) if not specified.
   * Eagerly persists table: and fqn: keys to globalState while VS Code is
   * fully running — avoids the confirmed VS Code bug where globalState.update()
   * is silently cancelled when called during deactivate() (won't-fix #144118).
   */
  set<T>(key: string, value: T, ttlMs = TTL.TABLE): void {
    const now = Date.now();
    this.store.set(key, {
      value,
      expiresAt: now + ttlMs,
      cachedAt: now,
    });
    if (key.startsWith("table:") || key.startsWith("fqn:")) {
      this._eagerPersist();
    }
  }

  /**
   * Returns the Unix ms timestamp when the entry was last cached,
   * or undefined if the entry is missing or expired.
   * Used by hoverProvider to show "Cached X min ago" in the tooltip.
   */
  getCachedAt(key: string): number | undefined {
    const entry = this.store.get(key);
    if (!entry || Date.now() > entry.expiresAt) {
      return undefined;
    }
    return entry.cachedAt;
  }

  /**
   * Remove all cached entries and sync the empty state to globalState
   * so the next restart starts clean rather than loading stale data.
   * Call on auth change or sidebar refresh.
   */
  clear(): void {
    this.store.clear();
    this._eagerPersist();
  }

  /**
   * Call once from activate(), before any provider starts.
   * Loads non-expired entries from globalState into memory AND stores the
   * context reference so future set() calls can eagerly persist stable keys.
   *
   * Replaces the old persist()/load() pattern — those relied on deactivate()
   * which VS Code cancels before globalState writes complete.
   */
  initPersistence(context: vscode.ExtensionContext): void {
    this._context = context;
    const saved = context.globalState.get<Record<string, CacheEntry<unknown>>>(
      "openmetadata.cache",
      {}
    );
    const now = Date.now();
    for (const [key, entry] of Object.entries(saved)) {
      if (now > entry.expiresAt) {
        continue; // discard stale entries from previous session
      }
      // Older persisted entries may lack cachedAt — fall back to expiresAt - TABLE TTL
      if (!entry.cachedAt) {
        entry.cachedAt = entry.expiresAt - TTL.TABLE;
      }
      this.store.set(key, entry);
    }
  }

  /**
   * Write all non-volatile, non-expired entries to globalState immediately.
   * Called from set() for stable keys and from clear() to sync the empty state.
   * Skips dq: and list: keys — those are intentionally volatile.
   * No-ops if initPersistence() hasn't been called yet (e.g. in unit tests).
   */
  private _eagerPersist(): void {
    if (!this._context) {return;}
    const toSave: Record<string, CacheEntry<unknown>> = {};
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (key.startsWith("dq:") || key.startsWith("list:") || key.startsWith("lineage:")) {continue;}
      if (now > entry.expiresAt) {continue;}
      toSave[key] = entry;
    }
    void this._context.globalState.update("openmetadata.cache", toSave);
  }
}

// Singleton — shared across all providers.
export const cache = new TableCache();
