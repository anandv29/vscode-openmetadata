# Test Changes — Document Scanner Overhaul

These are the test updates required as part of the document scanner refactor.
All changes are temporary — a full testing overhaul is planned separately. Keep this minimal.

---

## What breaks and needs fixing in `test/run-tests.ts`

### 1. Fix import paths (two lines)

```typescript
// change:
import { getAllTableNamesFromLine, wordAtOffset, extractTableRefs, ... } from "../src/utils/sqlParser.js";
import { cache, TTL } from "../src/services/cache.js";
// to:
import { TABLE_REF_PATTERN, DBT_REF_PATTERN, DBT_SOURCE_PATTERN, SQL_KEYWORDS, cleanTableName } from "../src/utils/sqlParser.js";
import { cache, TTL } from "../src/services/metadataCache.js";
```

### 2. Drop `simulateGetTableAtPosition` and all tests that use it

`wordAtOffset` and `extractTableRefs` are deleted. The cursor-position logic (`refs.find(r => r.range.contains(position))`) is too trivial to unit test. Remove the entire cursor-position test section.

### 3. Replace tests that call `getAllTableNamesFromLine` / `getTableNameFromLine`

Both functions are deleted. Replace the existing SQL parsing test helper with a direct pattern runner:

```typescript
function getTablesFromText(text: string): string[] {
  const results: string[] = [];
  TABLE_REF_PATTERN.lastIndex = 0;
  for (const m of text.matchAll(TABLE_REF_PATTERN)) {
    const raw = m[1]; if (!raw) { continue; }
    const name = cleanTableName(raw);
    if (!SQL_KEYWORDS.has(name.toLowerCase())) { results.push(name); }
  }
  return results;
}
```

This is a local test helper — not production code. All existing test cases (FROM, JOIN, aliases, schema-qualified, keywords, comments, case, identifiers, multi-table) stay, just routed through this helper instead.

---

## What stays intact (no changes needed)

All cache tests, all `buildDQSection` tests, all `extractColumnFromEntityFqn` tests, all API URL tests — none touch parsing code.

---

## New test cases to add (dbt patterns)

Add a dbt pattern section. Use a non-global copy of the patterns for single-match testing:

```typescript
// Non-global copies for single-match testing
const REF_PATTERN_SINGLE  = /\bref\s*\(\s*(?:(['"])([^'"]+)\1\s*,\s*)?(['"])([^'"]+)\3(?:\s*,\s*v(?:ersion)?\s*=\s*\d+)?\s*\)/i;
const SRC_PATTERN_SINGLE  = /\bsource\s*\(\s*(['"])([^'"]+)\1\s*,\s*(['"])([^'"]+)\3\s*\)/i;

function matchRef(text: string): string | null {
  const m = text.match(REF_PATTERN_SINGLE);
  return m ? m[4] ?? null : null;
}
function matchSource(text: string): string | null {
  const m = text.match(SRC_PATTERN_SINGLE);
  return m ? m[4] ?? null : null;
}
```

Cases to cover:

**ref() — should match:**
- `{{ ref('orders') }}` → `orders`
- `{{ ref("dim_customer") }}` → `dim_customer`
- `{{ ref('pkg', 'model') }}` → `model`
- `{{ ref('model', version=2) }}` → `model`
- `{{ ref('model', v=2) }}` → `model`
- `{{ ref('pkg', 'model', version=2) }}` → `model`

**ref() — should NOT match:**
- `{{ ref(some_var) }}` → null (dynamic, unresolvable)
- `{{ ref('a' ~ env_var('X')) }}` → null (computed name — tilde after first arg breaks pattern)

**source() — should match:**
- `{{ source('src', 'table') }}` → `table`
- `{{ source("src", "table") }}` → `table`
- `{{ source( 'src' , 'table' ) }}` → `table` (whitespace variants)

---

## What is NOT unit tested

`scanDocumentCached` / `scanDocument` require a real `vscode.TextDocument` — skip unit tests, covered by F5 manual testing. `documentCache.getScan`/`setScan` are trivial Map wrappers — not worth mocking.
