import type {
  OmTable,
  OmSearchResponse,
  OmSearchHit,
  OmDQResult,
  OmService,
  OmDatabase,
  OmSchema,
  OmListResponse,
  OmLineageResponse,
  OmLineageNode,
} from "../types/openmetadata.js";
import { cache, TTL } from "./metadataCache.js";

// ---- Config (set by authenticate.ts) -------------------------

let _baseUrl = "https://sandbox.open-metadata.org";
let _token = "";

/** Called by authenticate.ts after the user enters credentials. */
export function setCredentials(baseUrl: string, token: string): void {
  _baseUrl = baseUrl.replace(/\/$/, "");
  _token = token;
}

export function getBaseUrl(): string {
  return _baseUrl;
}

// ---- Internal fetch helper -----------------------------------

async function apiFetch<T>(path: string): Promise<T> {
  if (!_token) {
    throw new Error(
      'Not authenticated — run "OpenMetadata: Setup" first (Ctrl+Shift+P)'
    );
  }

  const url = `${_baseUrl}/api/v1${path}`;
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        Authorization: `Bearer ${_token}`,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "Content-Type": "application/json",
      },
    });
  } catch {
    throw new Error(
      `Cannot reach OpenMetadata at ${_baseUrl} — check your network or server URL`
    );
  }

  if (response.status === 401) {
    throw new Error(
      'OpenMetadata token invalid or expired — run "OpenMetadata: Setup" again'
    );
  }
  if (response.status === 404) {
    throw new Error(`Not found: ${path}`);
  }
  if (!response.ok) {
    throw new Error(
      `OpenMetadata API error: ${response.status} ${response.statusText}`
    );
  }

  return response.json() as Promise<T>;
}

// ---- Internal pagination helper ------------------------------

/** Exhausts all cursor pages for a list endpoint and returns every item. */
async function fetchAllPages<T>(basePath: string): Promise<T[]> {
  const results: T[] = [];
  let after: string | undefined;
  do {
    const cursor = after ? `&after=${encodeURIComponent(after)}` : "";
    const data = await apiFetch<OmListResponse<T>>(`${basePath}${cursor}`);
    results.push(...(data.data ?? []));
    after = data.paging.after;
  } while (after);
  return results;
}

// ---- Public API methods --------------------------------------

/**
 * Search for tables by name. Returns up to `size` hits (default 5).
 */
export async function search(
  name: string,
  size = 5
): Promise<OmSearchHit["_source"][]> {
  const encoded = encodeURIComponent(name);
  const data = await apiFetch<OmSearchResponse>(
    `/search/query?q=${encoded}&index=table_search_index&size=${size}`
  );
  return data.hits.hits.map((h) => h._source);
}

/**
 * Fetch full table metadata by FQN.
 * e.g. fqn = "sample_data.ecommerce_db.shopify.dim_customer"
 * Cached for TTL.TABLE (5 min); persisted to globalState across restarts.
 */
export async function getTable(fqn: string): Promise<OmTable> {
  const key = `table:${fqn}`;
  const hit = cache.get<OmTable>(key);
  if (hit) {return hit;}
  const encoded = encodeURIComponent(fqn);
  const result = await apiFetch<OmTable>(
    `/tables/name/${encoded}?fields=name,description,columns,owners,tags`
  );
  cache.set(key, result, TTL.TABLE);
  return result;
}

/**
 * Fetch all DQ test cases for a table, each with its latest result embedded.
 * Cached for TTL.DQ (2 min); NOT persisted across restarts.
 * Returns [] gracefully if the DQ endpoint is unavailable or the table has no suite.
 *
 * includeAllTests=true is required — without it the entityLink filter returns 0 results.
 */
export async function getDQResults(fqn: string): Promise<OmDQResult[]> {
  const key = `dq:${fqn}`;
  const hit = cache.get<OmDQResult[]>(key);
  if (hit) { return hit; }
  try {
    const entityLink = encodeURIComponent(`<#E::table::${fqn}>`);
    const results = await fetchAllPages<OmDQResult>(
      `/dataQuality/testCases?entityLink=${entityLink}&fields=testCaseResult&includeAllTests=true&limit=1000000`
    );
    cache.set(key, results, TTL.DQ);
    return results;
  } catch {
    return [];
  }
}

/**
 * Fetch direct upstream + downstream lineage for a table by FQN (depth=1 each direction).
 * Cached for TTL.LINEAGE (10 min); NOT persisted across restarts.
 * Returns an empty response gracefully if the lineage endpoint is unavailable.
 */
export async function getLineage(fqn: string): Promise<OmLineageResponse> {
  const key = `lineage:${fqn}`;
  const hit = cache.get<OmLineageResponse>(key);
  if (hit) { return hit; }
  try {
    const encoded = encodeURIComponent(fqn);
    const result = await apiFetch<OmLineageResponse>(
      `/lineage/table/name/${encoded}?upstreamDepth=1&downstreamDepth=1`
    );
    cache.set(key, result, TTL.LINEAGE);
    return result;
  } catch {
    return { entity: {} as OmLineageNode, nodes: [], upstreamEdges: [], downstreamEdges: [] };
  }
}

// ---- Sidebar catalog list functions (Service → DB → Schema → Table) ----
// All cached for TTL.LIST (5 min), not persisted across restarts.

/** List all database services — sidebar root level. */
export async function listServices(): Promise<OmService[]> {
  const key = "list:services";
  const hit = cache.get<OmService[]>(key);
  if (hit) { return hit; }
  const result = await fetchAllPages<OmService>("/services/databaseServices?limit=1000000");
  cache.set(key, result, TTL.LIST);
  return result;
}

/** List all databases inside a service. */
export async function listDatabases(serviceFqn: string): Promise<OmDatabase[]> {
  const key = `list:databases:${serviceFqn}`;
  const hit = cache.get<OmDatabase[]>(key);
  if (hit) { return hit; }
  const encoded = encodeURIComponent(serviceFqn);
  const result = await fetchAllPages<OmDatabase>(`/databases?service=${encoded}&limit=1000000`);
  cache.set(key, result, TTL.LIST);
  return result;
}

/** List all schemas inside a database. */
export async function listSchemas(dbFqn: string): Promise<OmSchema[]> {
  const key = `list:schemas:${dbFqn}`;
  const hit = cache.get<OmSchema[]>(key);
  if (hit) { return hit; }
  const encoded = encodeURIComponent(dbFqn);
  const result = await fetchAllPages<OmSchema>(`/databaseSchemas?database=${encoded}&limit=1000000`);
  cache.set(key, result, TTL.LIST);
  return result;
}

/** List all tables inside a schema. */
export async function listTables(schemaFqn: string): Promise<OmTable[]> {
  const key = `list:tables:${schemaFqn}`;
  const hit = cache.get<OmTable[]>(key);
  if (hit) { return hit; }
  const encoded = encodeURIComponent(schemaFqn);
  const result = await fetchAllPages<OmTable>(`/tables?databaseSchema=${encoded}&limit=1000000`);
  cache.set(key, result, TTL.LIST);
  return result;
}

/** Clear all in-memory cache entries. Call on credential change or sidebar refresh. */
export function clearCache(): void {
  cache.clear();
}

// Return type for resolveToFqn — carries both the resolved FQN and whether the
// name matched multiple tables. Kept local; callers infer types structurally.
type FqnResolution = { fqn: string | null; ambiguous: boolean };

// In-flight deduplication for FQN resolution (Singleflight pattern).
// Prevents duplicate search calls for concurrent requests on the same table name.
const _inFlightFqnResolutions = new Map<string, Promise<FqnResolution>>();

/**
 * Internal helper for LVL1/2/3 resolution.
 * Queries `fullyQualifiedName:*.{suffix}` — the unanalyzed fullyQualifiedName field
 * supports leading wildcards, giving exact server-side suffix matches.
 * Returns the best-scored FQN hit and the exact total match count.
 */
async function apiFetchResolution(suffix: string): Promise<{ fqn: string | null; total: number }> {
  const q = `fullyQualifiedName:*.${suffix}`;
  const data = await apiFetch<OmSearchResponse>(
    `/search/query?q=${encodeURIComponent(q)}&index=table_search_index&size=1&track_total_hits=true`
  );
  return {
    fqn: data.hits.hits[0]?._source.fullyQualifiedName ?? null,
    total: data.hits.total.value,
  };
}

/**
 * Resolve any table name as it appears in the editor — bare name, schema-qualified,
 * or full FQN — to a confirmed OpenMetadata FQN.
 *
 * Resolution strategy by dot count:
 *   LVL4 (3+ dots): full FQN → GET /tables/name/{fqn} directly (unique by definition)
 *   LVL1/2/3 (0-2 dots): fullyQualifiedName:*.{tableName} suffix search — server-side,
 *     exact count via track_total_hits=true. total>1 = ambiguous.
 *
 * - Cache key normalised to lowercase so "Orders" and "orders" share one entry
 * - Singleflight: concurrent callers for the same name share one in-flight request
 * - Unambiguous results cached for TTL.FQN (10 min); persisted to globalState
 * - Ambiguous + null results NOT cached — re-resolves on every hover
 */
export function resolveToFqn(tableName: string): Promise<FqnResolution> {
  const normalized = tableName.toLowerCase();
  const cacheKey = `fqn:${normalized}`;

  // Cache hit — only unambiguous resolutions are cached, so ambiguous: false is always correct.
  const hit = cache.get<string>(cacheKey);
  if (hit) { return Promise.resolve({ fqn: hit, ambiguous: false }); }

  // Singleflight — reuse an already in-flight request for the same name.
  const inFlight = _inFlightFqnResolutions.get(normalized);
  if (inFlight) { return inFlight; }

  const dotCount = (tableName.match(/\./g) ?? []).length;
  let promise: Promise<FqnResolution>;

  if (dotCount >= 3) {
    // LVL4 — full FQN (service.db.schema.table), unique by definition.
    // Uses /tables/name/{fqn} directly — different endpoint/response shape from apiFetchResolution.
    const encoded = encodeURIComponent(tableName);
    promise = apiFetch<OmTable>(`/tables/name/${encoded}?fields=name`)
      .then((): FqnResolution => {
        cache.set(cacheKey, tableName, TTL.FQN);
        return { fqn: tableName, ambiguous: false };
      })
      .catch((): FqnResolution => ({ fqn: null, ambiguous: false }));

  } else {
    // LVL1/2/3 — bare name, schema.table, db.schema.table
    // fullyQualifiedName:*.{tableName} works for all three since OM FQNs always have 4 levels.
    promise = apiFetchResolution(tableName).then(({ fqn, total }): FqnResolution => {
      if (!fqn) { return { fqn: null, ambiguous: false }; }
      const ambiguous = total > 1;
      if (!ambiguous) { cache.set(cacheKey, fqn, TTL.FQN); }
      return { fqn, ambiguous };
    });
  }

  promise = promise.finally(() => { _inFlightFqnResolutions.delete(normalized); });
  _inFlightFqnResolutions.set(normalized, promise);
  return promise;
}

/**
 * Returns the Unix ms timestamp when table metadata was last cached,
 * or undefined if not cached / expired. Used by hoverProvider for the
 * "Cached X min ago" tooltip footer.
 */
export function getTableCachedAt(fqn: string): number | undefined {
  return cache.getCachedAt(`table:${fqn}`);
}
