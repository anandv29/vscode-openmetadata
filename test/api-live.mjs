// Live API test against sandbox.open-metadata.org
// Tests that the sandbox is reachable and endpoints respond correctly
// Does NOT need an API token for the connectivity test
// Run: node test/api-live.mjs [YOUR_TOKEN]
//
// Usage:
//   node test/api-live.mjs                    ← tests without auth (expect 401)
//   node test/api-live.mjs YOUR_TOKEN_HERE    ← full test with real data

const BASE = "https://sandbox.open-metadata.org/api/v1";
const token = process.argv[2] ?? null;

const headers = token
  ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  : { "Content-Type": "application/json" };

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg ?? "Assertion failed");
}

// ---- Connectivity tests (no token needed) ---------------------------

console.log(`\n🌐 Sandbox connectivity tests (${BASE})`);

await test("Sandbox is reachable (HTTP response)", async () => {
  const res = await fetch(`${BASE}/system/version`);
  assert(res.status < 500, `Server returned ${res.status} — should not be a 5xx`);
});

await test("Unauthenticated request returns 401", async () => {
  const res = await fetch(`${BASE}/databases?limit=1`);
  assert(res.status === 401, `Expected 401, got ${res.status}`);
});

// ---- Authenticated tests (token required) ---------------------------

if (!token) {
  console.log("\n⚠️  Skipping authenticated tests — no token provided");
  console.log("   Rerun with: node test/api-live.mjs YOUR_TOKEN\n");
} else {
  console.log("\n🔑 Authenticated API tests");

  await test("GET /databases — returns array", async () => {
    const res = await fetch(`${BASE}/databases?limit=5`, { headers });
    assert(res.ok, `HTTP ${res.status}`);
    const json = await res.json();
    assert(Array.isArray(json.data), "Expected json.data to be an array");
    assert(json.data.length > 0, "Expected at least 1 database");
    console.log(`     → Found ${json.data.length} databases: ${json.data.map(d => d.name).join(", ")}`);
  });

  await test("GET /search/query?q=dim_customer — returns hits", async () => {
    const res = await fetch(
      `${BASE}/search/query?q=dim_customer&index=table_search_index&size=5`,
      { headers }
    );
    assert(res.ok, `HTTP ${res.status}`);
    const json = await res.json();
    assert(json.hits?.hits?.length > 0, "Expected at least 1 search hit");
    const first = json.hits.hits[0]._source;
    console.log(`     → Top result: ${first.fullyQualifiedName}`);
    assert(first.fullyQualifiedName, "Expected fullyQualifiedName field");
    assert(first.name, "Expected name field");
  });

  await test("FQN suffix search — resolves a dbt ref('model') name", async () => {
    // This is the exact query resolveToFqn() fires for LVL1 names (bare table name).
    // When the scanner finds ref('dim_customer'), it calls resolveToFqn('dim_customer')
    // which queries: fullyQualifiedName:*.dim_customer with track_total_hits=true.
    const q = encodeURIComponent("fullyQualifiedName:*.dim_customer");
    const res = await fetch(
      `${BASE}/search/query?q=${q}&index=table_search_index&size=1&track_total_hits=true`,
      { headers }
    );
    assert(res.ok, `HTTP ${res.status}`);
    const json = await res.json();
    const total = json.hits?.total?.value ?? 0;
    const fqn = json.hits?.hits?.[0]?._source?.fullyQualifiedName;
    assert(fqn, "Expected at least one hit for dim_customer");
    console.log(`     → total matches: ${total} (${total > 1 ? "ambiguous" : "unambiguous"})`);
    console.log(`     → top result: ${fqn}`);
  });

  await test("GET /tables/name/{fqn} — returns table with columns", async () => {
    // First search to get the real FQN
    const searchRes = await fetch(
      `${BASE}/search/query?q=dim_customer&index=table_search_index&size=1`,
      { headers }
    );
    const searchJson = await searchRes.json();
    const fqn = searchJson.hits?.hits?.[0]?._source?.fullyQualifiedName;
    assert(fqn, "Need a FQN from search to test getTable");

    const res = await fetch(
      `${BASE}/tables/name/${encodeURIComponent(fqn)}?fields=name,description,columns,owners,tags`,
      { headers }
    );
    assert(res.ok, `HTTP ${res.status}`);
    const table = await res.json();
    assert(table.name, "Expected table.name field");
    assert(Array.isArray(table.columns), "Expected table.columns array");
    console.log(`     → Table: ${table.name}, ${table.columns.length} columns`);
    console.log(`     → Description: ${table.description?.slice(0, 60) ?? "(none)"}...`);
    console.log(`     → Owners: ${table.owners?.map(o => o.name).join(", ") ?? "(none)"}`);
    console.log(`     → Tags: ${table.tags?.map(t => t.tagFQN).join(", ") ?? "(none)"}`);
  });

  await test("GET /dataQuality/testCases — production endpoint shape", async () => {
    // Uses the same endpoint + params as metadataService.getDQResults():
    //   entityLink=<#E::table::fqn>, includeAllTests=true
    // (NOT /testCases/search/list?entityFQN — that's a different endpoint)
    const searchRes = await fetch(
      `${BASE}/search/query?q=dim_customer&index=table_search_index&size=1`,
      { headers }
    );
    const searchJson = await searchRes.json();
    const fqn = searchJson.hits?.hits?.[0]?._source?.fullyQualifiedName;
    if (!fqn) { console.log("     → Skipping: no FQN found"); return; }

    const entityLink = encodeURIComponent(`<#E::table::${fqn}>`);
    const res = await fetch(
      `${BASE}/dataQuality/testCases?entityLink=${entityLink}&fields=testCaseResult&includeAllTests=true&limit=50`,
      { headers }
    );
    // 404 is acceptable if no DQ tests are configured for this table
    if (res.status === 404) {
      console.log("     → 404 (no DQ suite for this table — OK)");
      return;
    }
    assert(res.ok, `HTTP ${res.status}`);
    const json = await res.json();
    assert(Array.isArray(json.data), "Expected json.data array");
    console.log(`     → ${json.data.length} DQ test cases found for ${fqn}`);
    if (json.data.length > 0) {
      const first = json.data[0];
      console.log(`     → First case: ${first.name}, status: ${first.testCaseResult?.testCaseStatus ?? "no result"}`);
    }
  });

  await test("GET /databaseSchemas — returns schemas for sample_data", async () => {
    // Find sample_data database first
    const dbRes = await fetch(`${BASE}/databases?limit=25`, { headers });
    const dbJson = await dbRes.json();
    const sampleDb = dbJson.data?.find(db => db.name === "ecommerce_db") ?? dbJson.data?.[0];
    if (!sampleDb) { console.log("     → Skipping: no databases found"); return; }

    const res = await fetch(
      `${BASE}/databaseSchemas?database=${encodeURIComponent(sampleDb.fullyQualifiedName)}&limit=10`,
      { headers }
    );
    assert(res.ok, `HTTP ${res.status}`);
    const json = await res.json();
    assert(Array.isArray(json.data), "Expected data array");
    console.log(`     → ${json.data.length} schemas in ${sampleDb.name}: ${json.data.map(s => s.name).join(", ")}`);
  });

  await test("GET /lineage/table/name/{fqn} — returns entity + edges", async () => {
    // Resolve a real FQN dynamically so the test works on any sandbox state
    const searchRes = await fetch(
      `${BASE}/search/query?q=dim_customer&index=table_search_index&size=1`,
      { headers }
    );
    const searchJson = await searchRes.json();
    const fqn = searchJson.hits?.hits?.[0]?._source?.fullyQualifiedName;
    assert(fqn, "Need a FQN from search to test lineage");
    console.log(`     → testing lineage for: ${fqn}`);

    const res = await fetch(
      `${BASE}/lineage/table/name/${encodeURIComponent(fqn)}?upstreamDepth=1&downstreamDepth=1`,
      { headers }
    );
    // 404 means this table has no lineage configured — not an API shape failure
    if (res.status === 404) {
      console.log("     → 404 (no lineage on this table — API endpoint confirmed reachable, skipping shape assertions)");
      return;
    }
    assert(res.ok, `HTTP ${res.status} — expected 200`);
    const json = await res.json();

    // Top-level shape
    assert(json.entity, "Expected entity field");
    assert(json.entity.id, "Expected entity.id (UUID)");
    assert(json.entity.fullyQualifiedName, "Expected entity.fullyQualifiedName");
    assert(Array.isArray(json.nodes ?? []), "Expected nodes to be array");
    assert(Array.isArray(json.upstreamEdges ?? []), "Expected upstreamEdges to be array");
    assert(Array.isArray(json.downstreamEdges ?? []), "Expected downstreamEdges to be array");

    // If any edges exist, verify their structure
    const allEdges = [...(json.upstreamEdges ?? []), ...(json.downstreamEdges ?? [])];
    for (const edge of allEdges) {
      assert(typeof edge.fromEntity === "string", "Edge.fromEntity should be a UUID string");
      assert(typeof edge.toEntity === "string", "Edge.toEntity should be a UUID string");
    }

    // Log what we found
    console.log(`     → entity: ${json.entity.fullyQualifiedName}`);
    console.log(`     → nodes: ${(json.nodes ?? []).length}`);
    console.log(`     → upstreamEdges: ${(json.upstreamEdges ?? []).length}`);
    console.log(`     → downstreamEdges: ${(json.downstreamEdges ?? []).length}`);

    // Map node id → FQN (this is how Feature B will resolve edge UUIDs to table names)
    const nodeMap = new Map((json.nodes ?? []).map(n => [n.id, n.fullyQualifiedName]));
    nodeMap.set(json.entity.id, json.entity.fullyQualifiedName);
    for (const edge of json.upstreamEdges ?? []) {
      const from = nodeMap.get(edge.fromEntity) ?? edge.fromEntity;
      console.log(`     → upstream: ${from}`);
    }
    for (const edge of json.downstreamEdges ?? []) {
      const to = nodeMap.get(edge.toEntity) ?? edge.toEntity;
      console.log(`     → downstream: ${to}`);
    }
  });
}

console.log(`\n${"─".repeat(45)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("🎉 All tests passed!\n");
  process.exit(0);
} else {
  console.log("💥 Some tests failed.\n");
  process.exit(1);
}
