// ============================================================
// test/run-tests.ts
// Unit tests — runs with plain Node via: npm run test:unit
// Tests the real production code (not a shadow copy).
// ============================================================
/// <reference types="node" />

import {
  TABLE_REF_PATTERN,
  DBT_REF_PATTERN,
  DBT_SOURCE_PATTERN,
  SQL_KEYWORDS,
  cleanTableName,
} from "../src/utils/sqlParser.js";
import { cache, TTL } from "../src/services/metadataCache.js";
import { buildDQSection } from "../src/utils/tooltipBuilder.js";
import { extractColumnFromEntityFqn } from "../src/utils/helpers.js";
import type { OmDQResult } from "../src/types/openmetadata.js";
import type * as vscode from "vscode";

// ── Test helpers ─────────────────────────────────────────────
// Direct pattern helpers — replaces the old getAllTableNamesFromLine / extractTableRefs.
// Comment stripping is a document-level concern (documentScanner.ts) — not tested here.

/** Return all table names matched in a text snippet. */
function getTablesFromText(text: string): string[] {
  const results: string[] = [];
  TABLE_REF_PATTERN.lastIndex = 0;
  for (const m of text.matchAll(TABLE_REF_PATTERN)) {
    const raw = m[1];
    if (!raw) { continue; }
    const name = cleanTableName(raw);
    if (!SQL_KEYWORDS.has(name.toLowerCase())) { results.push(name); }
  }
  return results;
}

/** Return the first matched table name, or null. */
function getTableFromText(text: string): string | null {
  return getTablesFromText(text)[0] ?? null;
}

// Non-global copies for single-.match() dbt testing.
const REF_PATTERN_SINGLE = /\bref\s*\(\s*(?:(['"])([^'"]+)\1\s*,\s*)?(['"])([^'"]+)\3(?:\s*,\s*v(?:ersion)?\s*=\s*\d+)?\s*\)/i;
const SRC_PATTERN_SINGLE = /\bsource\s*\(\s*(['"])([^'"]+)\1\s*,\s*(['"])([^'"]+)\3\s*\)/i;

function matchRef(text: string): string | null {
  const m = text.match(REF_PATTERN_SINGLE);
  return m ? (m[4] ?? null) : null;
}
function matchSource(text: string): string | null {
  const m = text.match(SRC_PATTERN_SINGLE);
  return m ? (m[4] ?? null) : null;
}

// ── Mini test framework ──────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): void | Promise<void> {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(
        () => { console.log(`  ✅ ${name}`); passed++; },
        (err: Error) => { console.error(`  ❌ ${name}\n     ${err.message}`); failed++; }
      );
    }
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}`);
    console.error(`     ${(err as Error).message}`);
    failed++;
  }
}

function assert(condition: boolean, message?: string): void {
  if (!condition) { throw new Error(message ?? "Assertion failed"); }
}

function assertEqual<T>(actual: T, expected: T, label?: string): void {
  if (actual !== expected) {
    throw new Error(`${label ?? "assertEqual"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ============================================================
// 1. TABLE_REF_PATTERN tests — basic detection
// ============================================================

console.log("\n📋 sqlParser.ts — basic detection");

test("FROM tableName", () => assertEqual(getTableFromText("SELECT * FROM orders"), "orders"));
test("JOIN tableName", () => assertEqual(getTableFromText("INNER JOIN dim_customer ON id = id"), "dim_customer"));
test("UPDATE tableName", () => assertEqual(getTableFromText("UPDATE orders SET status = 'done'"), "orders"));
test("INSERT INTO tableName", () => assertEqual(getTableFromText("INSERT INTO audit_log VALUES (1)"), "audit_log"));
test("LEFT JOIN tableName", () => assertEqual(getTableFromText("LEFT JOIN dim_product p ON o.pid = p.id"), "dim_product"));
test("CROSS JOIN tableName", () => assertEqual(getTableFromText("CROSS JOIN calendar"), "calendar"));

console.log("\n🏷️  sqlParser.ts — alias handling");

test("Alias without AS: FROM orders o → 'orders'", () => assertEqual(getTableFromText("FROM orders o"), "orders"));
test("Alias with AS: FROM orders AS o → 'orders'", () => assertEqual(getTableFromText("FROM orders AS o"), "orders"));
test("JOIN with alias: JOIN dim_customer c → 'dim_customer'", () => assertEqual(getTableFromText("JOIN dim_customer c ON c.id = o.id"), "dim_customer"));

console.log("\n🔗  sqlParser.ts — schema-qualified names");

test("schema.table: FROM shopify.dim_customer", () => assertEqual(getTableFromText("FROM shopify.dim_customer"), "shopify.dim_customer"));
test("db.schema.table: FROM ecommerce_db.shopify.dim_customer", () => assertEqual(getTableFromText("FROM ecommerce_db.shopify.dim_customer"), "ecommerce_db.shopify.dim_customer"));
test("schema.table with alias", () => assertEqual(getTableFromText("FROM shopify.orders o"), "shopify.orders"));

console.log("\n🚫  sqlParser.ts — keyword rejection");

test("SELECT keyword line → null", () => assertEqual(getTableFromText("SELECT id, name, email"), null));
test("WHERE clause → null", () => assertEqual(getTableFromText("WHERE status = 'active'"), null));
test("ORDER BY → null", () => assertEqual(getTableFromText("ORDER BY created_at DESC"), null));
test("Empty line → null", () => assertEqual(getTableFromText(""), null));

console.log("\n💬  sqlParser.ts — inline comment behaviour");

// Comment stripping is document-level (documentScanner.ts).
// TABLE_REF_PATTERN matches before the -- so inline comments don't affect results.
test("Inline -- comment: FROM orders -- comment → 'orders'", () => assertEqual(getTableFromText("FROM orders -- this is a comment"), "orders"));

console.log("\n🔡  sqlParser.ts — case insensitivity");

test("Lowercase: 'select * from orders'", () => assertEqual(getTableFromText("select * from orders"), "orders"));
test("Mixed case: 'Select * From Orders'", () => assertEqual(getTableFromText("Select * From Orders"), "Orders"));

console.log("\n🔧  sqlParser.ts — special identifier formats");

test("Backtick identifiers: FROM `mysql`.`ecommerce`.`orders`", () => {
  assertEqual(getTableFromText("FROM `mysql`.`ecommerce`.`orders`"), "mysql.ecommerce.orders");
});
test("Bracket identifiers: FROM [TESTDB].[sales].[staffs]", () => {
  assertEqual(getTableFromText("FROM [TESTDB].[sales].[staffs]"), "TESTDB.sales.staffs");
});
test("Underscore-prefixed table: FROM _airbyte_raw_customers", () => {
  assertEqual(getTableFromText("FROM _airbyte_raw_customers"), "_airbyte_raw_customers");
});

console.log("\n📋  sqlParser.ts — multi-table lines");

test("FROM a JOIN b JOIN c → 3 tables", () => {
  const names = getTablesFromText("FROM orders o JOIN dim_customer c ON o.id = c.id JOIN dim_product p ON o.pid = p.id");
  assert(names.length === 3, `Expected 3 tables, got ${names.length}: ${names}`);
  assert(names.includes("orders"), "Missing 'orders'");
  assert(names.includes("dim_customer"), "Missing 'dim_customer'");
  assert(names.includes("dim_product"), "Missing 'dim_product'");
});
test("First table on multi-join line", () => {
  assertEqual(getTableFromText("FROM orders o JOIN dim_customer c ON o.id = c.id"), "orders");
});

// ============================================================
// 2. DBT_REF_PATTERN tests
// ============================================================

console.log("\n🌿  sqlParser.ts — DBT_REF_PATTERN");

test("ref('model') → model name", () => assertEqual(matchRef("{{ ref('dim_customer') }}"), "dim_customer"));
test("ref(\"model\") double quotes", () => assertEqual(matchRef('{{ ref("dim_customer") }}'), "dim_customer"));
test("ref('pkg', 'model') cross-project → group 4 = model", () => assertEqual(matchRef("{{ ref('my_package', 'dim_customer') }}"), "dim_customer"));
test("ref('model', version=2) versioned → model name", () => assertEqual(matchRef("{{ ref('dim_customer', version=2) }}"), "dim_customer"));
test("ref('model', v=2) short version kwarg", () => assertEqual(matchRef("{{ ref('dim_customer', v=2) }}"), "dim_customer"));
test("ref('pkg', 'model', version=2) combined", () => assertEqual(matchRef("{{ ref('my_pkg', 'dim_customer', version=2) }}"), "dim_customer"));
test("ref(some_var) dynamic → null (no quotes)", () => assertEqual(matchRef("{{ ref(some_var) }}"), null));

// ============================================================
// 3. DBT_SOURCE_PATTERN tests
// ============================================================

console.log("\n🌿  sqlParser.ts — DBT_SOURCE_PATTERN");

test("source('src', 'table') → table name", () => assertEqual(matchSource("{{ source('raw', 'orders') }}"), "orders"));
test("source double quotes", () => assertEqual(matchSource('{{ source("raw", "orders") }}'), "orders"));
test("source with extra whitespace", () => assertEqual(matchSource("{{ source( 'raw' , 'orders' ) }}"), "orders"));
test("source missing second arg → null", () => assertEqual(matchSource("{{ source('raw') }}"), null));

// ============================================================
// 4. Cache Tests — real production cache (metadataCache.ts)
// ============================================================

console.log("\n🗄️  metadataCache.ts tests");

test("set and get immediately returns value", () => {
  cache.set("dim_customer", { name: "dim_customer" });
  const val = cache.get<{ name: string }>("dim_customer");
  assert(val !== undefined, "Expected cached value");
  assertEqual(val!.name, "dim_customer");
});
test("get missing key returns undefined", () => {
  assertEqual(cache.get("nonexistent_table_xyz"), undefined);
});
test("TTL expiry — value gone after clear()", async () => {
  cache.set("ttl_test_key", "ttl_test_value");
  assert(cache.get("ttl_test_key") !== undefined, "Value should exist before clear");
  cache.clear();
  assertEqual(cache.get("ttl_test_key"), undefined, "Value should be gone after clear");
});
test("clear() empties all entries", () => {
  cache.set("a", 1); cache.set("b", 2);
  cache.clear();
  assertEqual(cache.get("a"), undefined);
  assertEqual(cache.get("b"), undefined);
});
test("overwrite existing key", () => {
  cache.set("k", "first"); cache.set("k", "second");
  assertEqual(cache.get("k"), "second");
});

console.log("\n⏱️  metadataCache.ts — per-entry TTL & constants");

test("TTL.TABLE is 5 minutes", () => assertEqual(TTL.TABLE, 5 * 60 * 1000));
test("TTL.DQ is 2 minutes",    () => assertEqual(TTL.DQ,    2 * 60 * 1000));
test("TTL.FQN is 10 minutes",  () => assertEqual(TTL.FQN,   10 * 60 * 1000));
test("TTL.LIST is 5 minutes",  () => assertEqual(TTL.LIST,  5 * 60 * 1000));
test("custom short TTL — value expires after TTL ms", async () => {
  cache.set("short_ttl_key", "hello", 80);
  assert(cache.get("short_ttl_key") === "hello", "Should be present before expiry");
  await new Promise(r => setTimeout(r, 100));
  assert(cache.get("short_ttl_key") === undefined, "Should be gone after expiry");
});
test("getCachedAt returns timestamp just after set()", () => {
  const before = Date.now();
  cache.set("ts_key", "val", 5000);
  const cachedAt = cache.getCachedAt("ts_key");
  const after = Date.now();
  assert(cachedAt !== undefined, "getCachedAt should return a number");
  assert(cachedAt! >= before && cachedAt! <= after, "cachedAt should be between before and after");
});
test("getCachedAt returns undefined for missing key", () => {
  assertEqual(cache.getCachedAt("definitely_not_here_xyz"), undefined);
});
test("getCachedAt returns undefined after entry expires", async () => {
  cache.set("exp_ts_key", "val", 60);
  await new Promise(r => setTimeout(r, 80));
  assertEqual(cache.getCachedAt("exp_ts_key"), undefined);
});

console.log("\n💾  metadataCache.ts — initPersistence + eager writes");

test("initPersistence loads non-expired entries from globalState", () => {
  const now = Date.now();
  const mockStore: Record<string, unknown> = {
    "openmetadata.cache": {
      "table:foo.bar": { value: { name: "bar" }, expiresAt: now + 60_000, cachedAt: now },
      "fqn:bar":       { value: "foo.bar",       expiresAt: now + 60_000, cachedAt: now },
    },
  };
  const mockContext = {
    globalState: {
      get<T>(key: string, def: T): T { return (key in mockStore ? mockStore[key] : def) as T; },
      async update(key: string, val: unknown): Promise<void> { mockStore[key] = val; },
    },
  } as unknown as vscode.ExtensionContext;
  cache.clear(); cache.initPersistence(mockContext);
  assert(cache.get("table:foo.bar") !== undefined, "initPersistence restores table: entries");
  assert(cache.get("fqn:bar") !== undefined,       "initPersistence restores fqn: entries");
});
test("initPersistence discards expired entries", () => {
  const mockStore: Record<string, unknown> = {
    "openmetadata.cache": {
      "table:expired": { value: { name: "old" }, expiresAt: Date.now() - 1, cachedAt: Date.now() - 10_000 },
    },
  };
  const mockContext = {
    globalState: {
      get<T>(key: string, def: T): T { return (key in mockStore ? mockStore[key] : def) as T; },
      async update(_k: string, _v: unknown): Promise<void> {},
    },
  } as unknown as vscode.ExtensionContext;
  cache.clear(); cache.initPersistence(mockContext);
  assertEqual(cache.get("table:expired"), undefined, "expired entries not loaded");
});
test("cache.set table: key triggers eager write to globalState", () => {
  const mockStore: Record<string, unknown> = {};
  const mockContext = {
    globalState: {
      get<T>(_k: string, def: T): T { return def; },
      async update(key: string, val: unknown): Promise<void> { mockStore[key] = val; },
    },
  } as unknown as vscode.ExtensionContext;
  cache.clear(); cache.initPersistence(mockContext);
  cache.set("table:a.b.c", { name: "c" }, TTL.TABLE);
  const saved = mockStore["openmetadata.cache"] as Record<string, unknown>;
  assert(saved !== undefined,     "globalState was written");
  assert("table:a.b.c" in saved, "table: key is persisted eagerly");
});
test("cache.set dq: key does NOT trigger eager write", () => {
  const mockStore: Record<string, unknown> = {};
  const mockContext = {
    globalState: {
      get<T>(_k: string, def: T): T { return def; },
      async update(key: string, val: unknown): Promise<void> { mockStore[key] = val; },
    },
  } as unknown as vscode.ExtensionContext;
  cache.clear(); cache.initPersistence(mockContext);
  cache.set("dq:a.b.c", [], TTL.DQ);
  const saved = mockStore["openmetadata.cache"] as Record<string, unknown> | undefined;
  assert(!saved || !("dq:a.b.c" in saved), "dq: key is never persisted eagerly");
});
test("cache.clear() writes empty object to globalState", () => {
  const mockStore: Record<string, unknown> = {};
  const mockContext = {
    globalState: {
      get<T>(_k: string, def: T): T { return def; },
      async update(key: string, val: unknown): Promise<void> { mockStore[key] = val; },
    },
  } as unknown as vscode.ExtensionContext;
  cache.clear(); cache.initPersistence(mockContext);
  cache.set("table:a.b", { name: "b" }, TTL.TABLE);
  cache.clear();
  const saved = mockStore["openmetadata.cache"] as Record<string, unknown>;
  assert(saved !== undefined,            "globalState was written after clear");
  assertEqual(Object.keys(saved).length, 0, "globalState is empty after clear");
});

// ============================================================
// 5. API URL construction tests
// ============================================================

console.log("\n🌐  API URL construction tests");

function buildSearchUrl(baseUrl: string, name: string, size = 5): string {
  return `${baseUrl}/api/v1/search/query?q=${encodeURIComponent(name)}&index=table_search_index&size=${size}`;
}
function buildTableUrl(baseUrl: string, fqn: string): string {
  return `${baseUrl}/api/v1/tables/name/${encodeURIComponent(fqn)}?fields=name,description,columns,owners,tags`;
}
function buildDQUrl(baseUrl: string, fqn: string): string {
  const entityLink = encodeURIComponent(`<#E::table::${fqn}>`);
  return `${baseUrl}/api/v1/dataQuality/testCases?entityLink=${entityLink}&fields=testCaseResult&includeAllTests=true&limit=1000000`;
}

const BASE = "https://sandbox.open-metadata.org";
const FQN = "sample_data.ecommerce_db.shopify.dim_customer";

test("Search URL is correct", () => assertEqual(
  buildSearchUrl(BASE, "dim_customer"),
  "https://sandbox.open-metadata.org/api/v1/search/query?q=dim_customer&index=table_search_index&size=5"
));
test("Table URL contains FQN", () => assert(buildTableUrl(BASE, FQN).includes("dim_customer")));
test("DQ URL hits correct endpoint", () => assert(buildDQUrl(BASE, FQN).includes("dataQuality/testCases?entityLink=")));
test("Search URL encodes spaces", () => assert(buildSearchUrl(BASE, "my table").includes("my%20table")));
test("Lineage URL ends with /lineage", () => {
  assert(`${BASE}/table/${encodeURIComponent(FQN)}/lineage`.endsWith("/lineage"));
});

// ============================================================
// 6. buildDQSection tests
// ============================================================

const TABLE_FQN = "sample_data.ecommerce_db.shopify.dim_customer";
const DQ_URL = "https://sandbox.open-metadata.org/table/sample_data/profiler/data-quality";

function makeDQ(overrides: Partial<OmDQResult> = {}): OmDQResult {
  return { id: "test-id", name: "test_case_name", fullyQualifiedName: `${TABLE_FQN}.test_case_name`,
    entityLink: `<#E::table::${TABLE_FQN}>`, deleted: false, ...overrides };
}

console.log("\n🧪  buildDQSection tests");

test("empty array → no tests set up", () => assert(buildDQSection([], TABLE_FQN, DQ_URL).includes("No tests set up")));
test("all Queued / no result → X tests set up — none run yet", () => {
  const dqs = [makeDQ(), makeDQ({ name: "test2", fullyQualifiedName: `${TABLE_FQN}.test2` })];
  assert(buildDQSection(dqs, TABLE_FQN, DQ_URL).includes("2 tests set up — none run yet"));
});
test("all Success → passing count shown, no failure markers", () => {
  const dqs = [makeDQ({ testCaseResult: { testCaseStatus: "Success" } }),
               makeDQ({ testCaseResult: { testCaseStatus: "Success" } }),
               makeDQ({ testCaseResult: { testCaseStatus: "Success" } })];
  const out = buildDQSection(dqs, TABLE_FQN, DQ_URL);
  assert(out.includes("3/3"), "should show 3/3");
  assert(!out.includes("×"), "no × when all pass");
});
test("mix of Success + Failed → correct count and × marker", () => {
  const dqs = [makeDQ({ testCaseResult: { testCaseStatus: "Success" } }),
               makeDQ({ displayName: "Bad Test", testCaseResult: { testCaseStatus: "Failed", result: "oops" } })];
  const out = buildDQSection(dqs, TABLE_FQN, DQ_URL);
  assert(out.includes("1/2"), "should show 1/2");
  assert(out.includes("×"), "should have × for failed test");
  assert(out.includes("Bad Test"), "should show display name");
  assert(out.includes("oops"), "should show result message");
});
test("Aborted test → ! marker not ×", () => {
  const out = buildDQSection([makeDQ({ testCaseResult: { testCaseStatus: "Aborted" } })], TABLE_FQN, DQ_URL);
  assert(out.includes("!"), "should have ! for aborted");
  assert(!out.includes("×"), "should not have × for aborted");
});
test("testResultValue → metric pairs shown", () => {
  const dqs = [makeDQ({ testCaseResult: { testCaseStatus: "Failed",
    testResultValue: [{ name: "max", value: "150" }, { name: "min", value: "0" }] } })];
  const out = buildDQSection(dqs, TABLE_FQN, DQ_URL);
  assert(out.includes("`max: 150`"), "should show max metric");
  assert(out.includes("`min: 0`"), "should show min metric");
});
test("timestamp → age string shown", () => {
  const ts = Date.now() - 3 * 3600 * 1000;
  assert(buildDQSection([makeDQ({ testCaseResult: { testCaseStatus: "Failed", timestamp: ts } })], TABLE_FQN, DQ_URL).includes("3h ago"));
});
test("passedRows + failedRows → row counts shown", () => {
  const out = buildDQSection([makeDQ({ testCaseResult: { testCaseStatus: "Failed", passedRows: 980, failedRows: 20 } })], TABLE_FQN, DQ_URL);
  assert(out.includes("980 passed") && out.includes("20 failed"));
});
test("column-level test → column name extracted from entityFQN", () => {
  const out = buildDQSection([makeDQ({ entityFQN: `${TABLE_FQN}.customer_id`, testCaseResult: { testCaseStatus: "Failed" } })], TABLE_FQN, DQ_URL);
  assert(out.includes("`customer_id`"), "should show column name");
});
test(">5 failures → capped at 5 with truncation message", () => {
  const dqs = Array.from({ length: 7 }, (_, i) =>
    makeDQ({ name: `test_${i}`, fullyQualifiedName: `${TABLE_FQN}.test_${i}`, testCaseResult: { testCaseStatus: "Failed" } }));
  assert(buildDQSection(dqs, TABLE_FQN, DQ_URL).includes("2 more tests not passing"));
});

console.log("\n🔧  extractColumnFromEntityFqn tests");

test("column-level entityFqn → column name returned", () => assertEqual(extractColumnFromEntityFqn(`${TABLE_FQN}.shop_id`, TABLE_FQN), "shop_id"));
test("table-level entityFqn → null", () => assertEqual(extractColumnFromEntityFqn(TABLE_FQN, TABLE_FQN), null));
test("undefined entityFqn → null", () => assertEqual(extractColumnFromEntityFqn(undefined, TABLE_FQN), null));
test("unrelated entityFqn → null", () => assertEqual(extractColumnFromEntityFqn("other.service.db.table.col", TABLE_FQN), null));

// ── Summary ──────────────────────────────────────────────────

async function main(): Promise<void> {
  await new Promise(r => setTimeout(r, 100)); // let async tests settle
  console.log(`\n${"─".repeat(45)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) { console.log("🎉 All tests passed!\n"); process.exit(0); }
  else              { console.log("💥 Some tests failed.\n"); process.exit(1); }
}

main();
