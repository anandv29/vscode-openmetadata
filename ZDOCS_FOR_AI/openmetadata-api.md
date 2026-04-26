# OpenMetadata API Reference Notes

API Server: `https://sandbox.open-metadata.org/api`
Auth: `Authorization: Bearer <token>` header

---

## Index

**Search**
- `GET /v1/search/query` — full-text search across entities
- `GET /v1/search/entityTypeCounts` — entity counts by type for a query
- Notes for FQN Resolution in the Extension

**Catalog Hierarchy (Sidebar)**
- `GET /v1/services/databaseServices` — list all database services (root level)
- `GET /v1/databases` — list databases inside a service
- `GET /v1/databaseSchemas` — list schemas inside a database
- `GET /v1/tables` — list tables inside a schema

**Table Metadata**
- `GET /v1/tables/name/{fqn}` — fetch full metadata for a single table by FQN

**Data Quality**
- Concepts & FQN Formats
- `GET /v1/dataQuality/testCases` — list test cases (scoped to a table via entityLink)
- `GET /v1/dataQuality/testCases/{id}` — retrieve a single test case
- `GET /v1/dataQuality/testCases/{id}/testCaseResult` — full run history for a test case
- `GET /v1/dataQuality/testSuites` — list test suites

**Lineage**
- `GET /v1/lineage/table/name/{fqn}` — get upstream + downstream graph by FQN
- `GET /v1/lineage/export` — export lineage as CSV
- `GET /v1/dataQuality/testSuites/{id}` — retrieve a single test suite

---

# Search

## GET /v1/search/query

Search entities using query text.

### All parameters

| Param | Type | Default | Notes |
|---|---|---|---|
| `q` | string | `*` | Query text. Supports Elasticsearch field syntax (see below). Pass text for substring match; pass without wildcards for exact match |
| `index` | string | `table_search_index` | ES index name. Use `table_search_index` for tables |
| `size` | int | 10 | Number of results to return. Pass `0` for count-only |
| `from` | int | 0 | Pagination offset |
| `search_after` | string | — | For deep pagination: `search_after=value1,value2,...` |
| `sort_field` | string | `_score` | Sort by field. Options: `weekly_stats`, `daily_stats`, `monthly_stats`, `last_updated_timestamp` |
| `sort_order` | string | `desc` | `asc` or `desc` |
| `track_total_hits` | boolean | **false** | **Must pass `true` to get accurate total counts beyond 10k** |
| `deleted` | boolean | false | Filter by deleted status |
| `query_filter` | string | — | Raw Elasticsearch query JSON combined with the `q` query_string. Allows precise ES queries (wildcard, term, bool, etc.) |
| `post_filter` | string | — | Raw Elasticsearch query JSON applied as a post-filter (after aggregations) |
| `fetch_source` | boolean | true | Set `false` to skip document body (faster for count-only queries) |
| `include_source_fields` | array of string | — | Return only these fields from each document body |
| `exclude_source_fields` | array of string | — | Exclude these fields e.g. `columns` to reduce payload size |
| `getHierarchy` | boolean | false | Fetch results in hierarchical order. Only supported for `glossary_term_search_index` |
| `explain` | boolean | false | Return ES score explanation. Debugging only |
| `semanticSearch` | boolean | false | Enable semantic search (vector similarity + BM25). Requires embedding setup |
| `include_aggregations` | boolean | true | Include aggregation buckets in response |

### Query syntax examples

```
q=*                                                      → list all tables
q=ACCOUNTS                                               → fuzzy search (matches name, FQN, description, etc.)
q=name.keyword:ACCOUNTS                                  → exact name match only
q=tags.tagFQN:Tier.Tier1                                 → filter by tag
q=deleted:true                                           → search deleted entities
q=owner.displayName.keyword:john                         → filter by owner
q=columnNames:address                                    → search by column name
q=name.keyword:ACCOUNTS AND deleted:false                → combine with AND/OR/NOT (must be uppercase)
q=tableConstraints.constraintType.keyword:PRIMARY_KEY    → filter by constraint type
q=service.type:databaseService AND version:0.1           → filter by service type and version
```

### Response shape

```json
{
  "hits": {
    "total": { "value": 3, "relation": "eq" },
    "hits": [
      { "_score": 1.5, "_source": { "name": "...", "fullyQualifiedName": "...", ... } }
    ]
  }
}
```

`hits.total.value` = total matching documents (requires `track_total_hits=true` for accuracy beyond 10k).

### Behaviour by FQN level (verified against sandbox)

| User types | Query | Total | Notes |
|---|---|---|---|
| `ACCOUNTS` (LVL1, 0 dots) | `q=name.keyword:ACCOUNTS&size=1&track_total_hits=true` | **3** | Plain `q=ACCOUNTS` returns 18 fuzzy — unreliable |
| `FINANCIAL_STAGING.ACCOUNTS` (LVL2, 1 dot) | `q=fullyQualifiedName:*.FINANCIAL_STAGING.ACCOUNTS&size=1&track_total_hits=true` | **3** | Returns exact suffix matches server-side |
| `default.FINANCIAL_STAGING.ACCOUNTS` (LVL3, 2 dots) | `q=fullyQualifiedName:*.default.FINANCIAL_STAGING.ACCOUNTS&size=1&track_total_hits=true` | **1** | Specific enough to be unambiguous |
| `ACME_MYSQL.default.FINANCIAL_STAGING.ACCOUNTS` (LVL4, 3 dots) | `GET /tables/name/{fqn}` | 200 or 404 | Full FQN — unique by definition, use direct fetch |

### FQN suffix search ("tables ending in .ABC.CDE") — verified

**`q=fullyQualifiedName:*.FINANCIAL_STAGING.ACCOUNTS`** → **works, returns 3** ✅  
The unanalyzed `fullyQualifiedName` field (without `.keyword`) supports leading wildcards in query_string syntax.

**`q=fullyQualifiedName.keyword:*.FINANCIAL_STAGING.ACCOUNTS`** → returns 0 ❌  
The `.keyword` variant has leading wildcards blocked at index level.

**`query_filter` with `fullyQualifiedName` wildcard** → also works ✅ (but `q=` is simpler)

**Conclusion:** Use `q=fullyQualifiedName:*.{partialFqn}` for LVL2/3 resolution. Server-side, exact, no in-memory filtering needed, `total` gives accurate ambiguity count.

---

## GET /v1/search/entityTypeCounts

Get exact counts of entities by type for a given search query.

### Key parameters

| Param | Type | Notes |
|---|---|---|
| `q` | string | Search query text |
| `index` | string | Default: `dataAsset`. Options: `all`, `dataAsset`, `table`, etc. |
| `deleted` | boolean | Filter by deleted status |
| `query_filter` | string | Additional Elasticsearch query combined with `q` |
| `post_filter` | string | Elasticsearch post-filter |

### Usage

Returns counts broken down by entity type (table, topic, pipeline, etc.). Useful for showing aggregate counts, not for individual table resolution.

---

## Notes for FQN Resolution in the Extension

- For **count-only** queries: use `size=0&fetch_source=false&track_total_hits=true`
- For **LVL1/2/3**: use `q=fullyQualifiedName:*.{tableName}&size=1&track_total_hits=true` — works for all three levels since OM FQNs always have 4 levels (every table's FQN ends in `.{tableName}`). `total` = exact count for ambiguity detection.
- For **LVL4**: use `GET /tables/name/{fqn}` directly — FQNs are globally unique
- **`fullyQualifiedName:*suffix`** works ✅ — unanalyzed field allows leading wildcards
- **`fullyQualifiedName.keyword:*suffix`** does NOT work ❌ — `.keyword` variant has leading wildcards blocked
- `exclude_source_fields=columns` is useful when you only need name/FQN for resolution (skips heavy column list)
- `queryFilter` (note: camelCase in some docs) = same as `query_filter`

---

# Catalog Hierarchy (Sidebar)

All four endpoints follow the same `OmListResponse<T>` shape and support cursor-based pagination:

```json
{ "data": [...], "paging": { "total": 26, "after": "cursor-string" } }
```

`paging.after` is **absent** (not empty string) when all results fit in one response — confirmed on sandbox.
Extension usage: `limit=1000000` + loop while `paging.after` is present (`fetchAllPages` helper).

---

## GET /v1/services/databaseServices

Root level of the catalog hierarchy — all database services registered in the OM instance.

### Key parameters

| Param | Type | Notes |
|---|---|---|
| `limit` | integer | Max 1,000,000 |
| `after` | string | Cursor for forward pagination |

### Verified response item (sandbox)

```json
{
  "id": "a56112ba-5eb1-46f9-bb1c-78efe0f00a58",
  "name": "ACME_MYSQL",
  "fullyQualifiedName": "ACME_MYSQL",
  "serviceType": "Mysql",
  "description": "<p>...</p>",
  "deleted": false
}
```

`paging` verified: `{total: 26, after: "..."}` — sandbox has 26 services, cursor present when limit exceeded.

---

## GET /v1/databases

List databases, optionally filtered by service.

### Key parameters

| Param | Type | Notes |
|---|---|---|
| `service` | string | Filter by service **full FQN** e.g. `ACME_MYSQL` |
| `limit` | integer | Max 1,000,000 |
| `after` | string | Cursor for forward pagination |

### Verified response item (sandbox)

```json
{
  "id": "3b3fb625-b994-493f-a187-c0b4f1bd667a",
  "name": "default",
  "fullyQualifiedName": "ACME_MYSQL.default",
  "serviceType": "Mysql",
  "deleted": false
}
```

`paging` verified: `{total: 1}` — no `after` when all results fit in one page.

---

## GET /v1/databaseSchemas

List schemas, optionally filtered by database.

### Key parameters

| Param | Type | Notes |
|---|---|---|
| `database` | string | Filter by database **full FQN** e.g. `ACME_MYSQL.default` |
| `limit` | integer | Max 1,000,000 |
| `after` | string | Cursor for forward pagination |

### Verified response item (sandbox)

```json
{
  "id": "b33dd6ce-228b-4c86-90ca-4499c03db3ff",
  "name": "CUSTOMERS_STAGING",
  "fullyQualifiedName": "ACME_MYSQL.default.CUSTOMERS_STAGING",
  "serviceType": "Mysql",
  "deleted": false
}
```

`paging` verified: `{total: 8, after: "..."}` — cursor present when results exceed limit.

---

## GET /v1/tables

List tables, optionally filtered by database or schema. Uses cursor-based pagination.

### Key parameters

| Param | Type | Default | Notes |
|---|---|---|---|
| `fields` | string | — | Comma-separated fields to include. Options: `tableConstraints`, `tablePartition`, `usageSummary`, `owners`, `customMetrics`, `columns`, `sampleData`, `tags`, `followers`, `joins`, `schemaDefinition`, `dataModel`, `extension`, `testSuite`, `domains`, `dataProducts`, `lifeCycle`, `sourceHash` |
| `database` | string | — | Filter by database **full FQN** e.g. `snowflakeWestCoast.financeDB` |
| `databaseSchema` | string | — | Filter by schema **full FQN** e.g. `snowflakeWestCoast.financeDB.schema` |
| `includeEmptyTestSuite` | boolean | true | Include tables with no test cases |
| `limit` | int32 | 10 | Min 0, Max 1,000,000 |
| `before` | string | — | Cursor: return tables before this cursor |
| `after` | string | — | Cursor: return tables after this cursor |
| `include` | enum | `non-deleted` | `all` \| `deleted` \| `non-deleted` |

### Usage in extension

- `listTables(schemaFqn)` uses `databaseSchema={schemaFqn}&limit=1000000` + `fetchAllPages` — sidebar fourth level

### Why this doesn't help FQN resolution

Both `database` and `databaseSchema` require **full FQNs** as input (e.g. `snowflakeWestCoast.financeDB.schema`). When the user types a partial name like `FINANCIAL_STAGING.ACCOUNTS`, we don't know which service it belongs to — so we can't construct the full schema FQN needed to filter. Not useful for partial name resolution.

---

# Table Metadata

## GET /v1/tables/name/{fqn}

Fetch a single table by its **exact, complete** FQN.

### Key parameters

| Param | Type | Notes |
|---|---|---|
| `fqn` (path) | string | Full FQN e.g. `ACME_MYSQL.default.FINANCIAL_STAGING.ACCOUNTS` |
| `fields` | string | Comma-separated fields to include in response. Options: `tableConstraints`, `tablePartition`, `usageSummary`, `owners`, `customMetrics`, `columns`, `sampleData`, `tags`, `followers`, `joins`, `schemaDefinition`, `dataModel`, `extension`, `testSuite`, `domains`, `dataProducts`, `lifeCycle`, `sourceHash` |
| `include` | enum | `non-deleted` (default), `all`, `deleted` |

### Usage

Used **after** resolving a partial name to a full FQN. Not suitable for resolution or ambiguity detection — requires exact full FQN.

In the extension: `getTable(fqn)` uses this endpoint.

---

# Data Quality

## Concepts

| Concept | What it is |
|---|---|
| **Test Suite** | A container that groups test cases. `executable` = auto-created per table; `logical` = user-defined grouping across tables. |
| **Test Case** | One individual check (e.g. "column value must be between 0 and 100"). Belongs to a suite, targets a table or column. |
| **Test Case Result** | A historical run record for a test case. Multiple results exist per test case (one per run). Has `timestamp`, `testCaseStatus`, `result`, `testResultValue`. |

---

## FQN Formats

- **Test case FQN** = table FQN + test case name: `sample_data.ecommerce_db.shopify.dim_address.testCaseName`
- **Test suite FQN** = its name, which for logical suites is a UUID: `b5fcae09-02c2-4c0b-8c4a-5b52d650e592`

---

## GET /v1/dataQuality/testCases

List test cases, optionally scoped to a table or test suite.

### Parameters

| Param | Type | Default | Notes |
|---|---|---|---|
| `limit` | integer | 10 | Max results (max: 1,000,000) |
| `before` | string | — | Cursor for backward pagination |
| `after` | string | — | Cursor for forward pagination |
| `fields` | string | — | Comma-separated: `owners`, `testSuite`, `testDefinition`, `testCaseResult` |
| `include` | string | `non-deleted` | `all`, `deleted`, or `non-deleted` |
| `testSuiteId` | string | — | Filter by test suite UUID |
| `entityLink` | string | — | Filter by entity link (URL-encoded). Format: `<#E::table::{fqn}>` — returns both table-level and column-level tests for that table |
| `includeAllTests` | boolean | false | **Include test cases from all test suites, not just the primary executable suite.** Must be `true` or the filter returns nothing for most tables — verified on sandbox |
| `orderByLastExecutionDate` | boolean | false | Order by most recent execution date |

### Extension usage (verified against sandbox)

```
GET /v1/dataQuality/testCases
  ?entityLink=<#E::table::{fqn}>
  &fields=testCaseResult
  &includeAllTests=true
  &limit=1000000
  [&after={cursor}]
```

Paginate while `paging.after` is present. In practice all tests fit in one call since `limit=1000000`.

### Response shape (verified against sandbox)

```json
{
  "data": [
    {
      "id": "b2af8f05-665a-4262-8311-d5801306dd17",
      "name": "dim_customers_key_unique",
      "displayName": "Customer Key Uniqueness",
      "fullyQualifiedName": "acme_nexus_analytics.ANALYTICS.MARTS.dim_customers.customer_key.dim_customers_key_unique",
      "description": "<p>verify my unique key</p>",
      "entityLink": "<#E::table::acme_nexus_analytics.ANALYTICS.MARTS.dim_customers::columns::customer_key>",
      "entityFQN": "acme_nexus_analytics.ANALYTICS.MARTS.dim_customers.customer_key",
      "testCaseStatus": "Aborted",
      "testCaseResult": {
        "id": "5f2d9df5-139a-40d3-9acf-a12dbfe981ed",
        "testCaseFQN": "acme_nexus_analytics.ANALYTICS.MARTS.dim_customers.customer_key.dim_customers_key_unique",
        "timestamp": 1776556950067,
        "testCaseStatus": "Aborted",
        "result": "Error executing columnValuesToBeUnique — Password is empty",
        "testResultValue": [],
        "dimensionResults": []
      },
      "parameterValues": [],
      "deleted": false
    }
  ],
  "paging": { "total": 1 }
}
```

Notes:
- `testCaseResult` is only populated when `fields=testCaseResult` is passed
- `testCaseResult` is absent (not null) when a test has never been run
- `testCaseStatus` appears both at top level and inside `testCaseResult` — redundant, same value
- `paging.after` is absent when all results fit on one page (not present vs empty string)

---

## GET /v1/dataQuality/testCases/{id}

Retrieve a single test case by UUID or FQN.

### Variants

- `GET /v1/dataQuality/testCases/{id}` — by UUID
- `GET /v1/dataQuality/testCases/name/{fqn}` — by fully qualified name

### Parameters

| Param | Type | Notes |
|---|---|---|
| `id` / `fqn` (path) | string | UUID or FQN of the test case |
| `fields` | string | Comma-separated: `owners`, `testSuite`, `testDefinition`, `testCaseResult` |
| `include` | string | `non-deleted` (default), `all`, `deleted` |

### Response fields

| Field | Type | Notes |
|---|---|---|
| `id` | string | UUID |
| `name` | string | Test case name slug |
| `fullyQualifiedName` | string | Full FQN |
| `entityLink` | string | Link to target table/column |
| `testDefinition` | object | Reference to the test type definition |
| `testSuite` | object | Reference to the parent suite |
| `parameterValues` | array | Test parameters (e.g. min/max values) |
| `testCaseResult` | object | Most recent result — only if `fields=testCaseResult` |
| `owners` | array | Only if `fields=owners` |

---

## GET /v1/dataQuality/testCases/{id}/testCaseResult

Get the **full historical results** for a test case (all runs, paginated).

### Parameters

| Param | Type | Notes |
|---|---|---|
| `id` (path) | string | UUID of the test case |
| `startTs` | integer | Filter from this timestamp (epoch ms) |
| `endTs` | integer | Filter to this timestamp (epoch ms) |

### Response shape

```json
{
  "data": [
    {
      "timestamp": 1713456000000,
      "testCaseStatus": "Failed",
      "result": "Value 150 is greater than expected max 100",
      "testResultValue": [{ "name": "max", "value": "150" }]
    }
  ],
  "paging": { "total": 12 }
}
```

Use this endpoint for trend/history views. For the latest result only, use `fields=testCaseResult` on the list or retrieve endpoints instead.

---

## GET /v1/dataQuality/testSuites

List test suites.

### Parameters

| Param | Type | Default | Notes |
|---|---|---|---|
| `limit` | integer | 10 | Max results (max: 1,000,000) |
| `before` / `after` | string | — | Cursor-based pagination |
| `fields` | string | — | Comma-separated: `owners`, `tests` |
| `include` | string | `non-deleted` | `all`, `deleted`, or `non-deleted` |
| `testSuiteType` | string | — | `executable` or `logical` |

### Response shape

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "b5fcae09-02c2-4c0b-8c4a-5b52d650e592",
      "displayName": "My Suite",
      "fullyQualifiedName": "b5fcae09-02c2-4c0b-8c4a-5b52d650e592",
      "executable": false,
      "deleted": false
    }
  ],
  "paging": { "total": 3 }
}
```

---

## GET /v1/dataQuality/testSuites/{id}

Retrieve a single test suite by UUID or FQN.

### Variants

- `GET /v1/dataQuality/testSuites/{id}` — by UUID
- `GET /v1/dataQuality/testSuites/name/{fqn}` — by FQN (for logical suites: FQN = UUID string)

### Parameters

| Param | Type | Notes |
|---|---|---|
| `id` / `fqn` (path) | string | UUID or FQN of the test suite |
| `fields` | string | Comma-separated: `owners`, `tests` |
| `include` | string | `non-deleted` (default), `all`, `deleted` |

### Response fields

| Field | Type | Notes |
|---|---|---|
| `id` | string | UUID |
| `name` | string | Name (UUID string for logical suites) |
| `fullyQualifiedName` | string | FQN |
| `displayName` | string | Human-readable label |
| `description` | string | Description |
| `executable` | boolean | `true` = table-attached; `false` = logical grouping |
| `owners` | array | Only if `fields=owners` |
| `tests` | array | Test case references — only if `fields=tests` |

---

## Lineage

Docs: https://docs.open-metadata.org/v1.12.x/api-reference/lineage

---

### GET /v1/lineage/{entityType}/{id}
### GET /v1/lineage/{entityType}/name/{fqn}

Fetch the lineage graph for an entity. Returns the entity itself, all referenced nodes, and directed upstream/downstream edges. The FQN variant is more practical for the extension (no UUID lookup needed).

```
GET /api/v1/lineage/table/name/{fqn}?upstreamDepth=1&downstreamDepth=1
GET /api/v1/lineage/table/{id}?upstreamDepth=1&downstreamDepth=1
```

**Path parameters:**
- `entityType` — entity type (see supported values below)
- `fqn` — fully qualified name, e.g. `sample_data.ecommerce_db.shopify.dim_customer`
- `id` — UUID of the entity (alternative to FQN variant)

**Query parameters:**

| Parameter | Type | Default | Range | Description |
|---|---|---|---|---|
| `upstreamDepth` | integer | 1 | 0–3 | Hops toward data sources |
| `downstreamDepth` | integer | 1 | 0–3 | Hops toward consumers |
| `includeDeleted` | boolean | false | — | Include soft-deleted entities |

**Response shape:**

```json
{
  "entity": {
    "id": "string",
    "type": "string",
    "name": "string",
    "fullyQualifiedName": "string",
    "deleted": false,
    "href": "string"
  },
  "nodes": [
    {
      "id": "string",
      "type": "string",
      "name": "string",
      "fullyQualifiedName": "string",
      "deleted": false,
      "href": "string"
    }
  ],
  "upstreamEdges": [
    {
      "fromEntity": "uuid",
      "toEntity": "uuid",
      "lineageDetails": {
        "sqlQuery": "string (nullable)",
        "columnsLineage": [
          {
            "fromColumns": ["schema.table.col_a"],
            "toColumn": "schema.table.col_b"
          }
        ],
        "pipeline": { "id": "uuid", "type": "pipeline", "name": "string", "fullyQualifiedName": "string" }
      }
    }
  ],
  "downstreamEdges": [
    {
      "fromEntity": "uuid",
      "toEntity": "uuid",
      "lineageDetails": { }
    }
  ]
}
```

**Key points:**
- `nodes` contains ALL entities referenced by any edge (both upstream and downstream). The center entity itself is in `entity`, not in `nodes`.
- `upstreamEdges` — data flows INTO this entity. `fromEntity` = source UUID, `toEntity` = this entity's UUID.
- `downstreamEdges` — data flows OUT of this entity. `fromEntity` = this entity's UUID, `toEntity` = consumer UUID.
- To resolve a node name from an edge: match `fromEntity`/`toEntity` UUID against `nodes[].id`.
- Node field is `fullyQualifiedName` (not `fqn`).
- `lineageDetails` is optional on each edge — not all edges have SQL/column info.
- `lineageDetails.columnsLineage` gives column-level tracing: `fromColumns` is an array of source column FQNs, `toColumn` is a single destination column FQN.
- `lineageDetails.pipeline` links the transformation pipeline that produced the edge (nullable).
- `upstreamDepth=0` / `downstreamDepth=0` returns the entity with no edges in that direction.
- Max depth is 3 in each direction.

**Supported entityType values:**
`table`, `dashboard`, `pipeline`, `topic`, `mlmodel`, `container`, `searchIndex`, `storedProcedure`, `dashboardDataModel`, `apiEndpoint`

**Error codes:** 401, 403, 404

---

### GET /v1/lineage/export

Export the lineage graph as CSV. Useful for batch processing or external tooling.

```
GET /api/v1/lineage/export?fqn={fqn}&type=table&upstreamDepth=1&downstreamDepth=1
```

**Required query parameters:**
- `fqn` — fully qualified name of the entity
- `type` — entity type (same values as the path parameter above)

**Optional query parameters:**
- `upstreamDepth` (integer, default 1, range 0–3)
- `downstreamDepth` (integer, default 1, range 0–3)

**Response:** CSV with columns:
- `fromEntityFQN` — source entity FQN
- `fromEntityType` — source entity type
- `toEntityFQN` — target entity FQN
- `toEntityType` — target entity type
- `sqlQuery` — transformation SQL (nullable)

**Error codes:** 400 (missing/invalid params), 401, 403, 404

---

### Extension Usage Notes

**To get upstream tables (sources):**
1. Call `GET /v1/lineage/table/name/{fqn}?upstreamDepth=1&downstreamDepth=0`
2. For each edge in `upstreamEdges`, look up `edge.fromEntity` in `nodes` to get the FQN and name

**To get downstream tables (consumers):**
1. Call with `upstreamDepth=0&downstreamDepth=1`
2. For each edge in `downstreamEdges`, look up `edge.toEntity` in `nodes`

**Practical depth choice for in-editor display:** depth=1 is enough for a useful summary (direct parents/children). Depth 2–3 returns potentially large graphs.

**Entity type for tables:** always `table` in path and `type` param.
